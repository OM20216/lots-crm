import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import os from 'node:os';
import fs from 'node:fs';

// Credentials live OUTSIDE the project folder (private to this Windows user), so sharing or zipping the
// project never shares passwords. .env holds only non-secret settings. Nothing here is sent to the browser.
export const SECRETS_FILE = process.env.LOTS_SECRETS_FILE || path.join(os.homedir(), '.lots-crm', 'secrets.env');
for (const file of [SECRETS_FILE, undefined /* .env next to package.json */]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file missing — integrations it configures stay off */
  }
}

const store = await import('./db.js');
try {
  await store.load();
} catch (e) {
  console.error(`Could not open the ${store.backend === 'mysql' ? 'MySQL database' : 'data file'}: ${e.message}`);
  process.exit(1);
}
const core = await import('./core.js');
const sparktg = await import('./sparktg.js');
const mail = await import('./mail.js');
const auto = await import('./automation.js');
const calls = await import('./calls.js');

const { db, save, now, log, findCase, applyStatus, phoneKey, TRANSITIONS } = core;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.use(express.json({ limit: '5mb' }));

const api = express.Router();
const agentOf = (req) => req.get('x-agent') || 'Unknown';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const summary = ({ id, createdAt, status, caseType, category, subCategory }) => ({ id, createdAt, status, caseType, category, subCategory });

api.get('/meta', (req, res) => {
  res.json({
    stores: db().stores,
    agents: db().agents,
    transitions: TRANSITIONS,
    integrations: { mail: mail.configured(), sparktg: sparktg.configured() },
    widgetUrl: process.env.SPARKTG_WIDGET_URL || '',
    database: store.status(),
    agentEmails: db().agentEmails,
  });
});

// SparkTG dialer logs agents in by email (SSO), so each CRM agent needs theirs.
api.put('/agents/:name', (req, res) => {
  const name = req.params.name;
  if (!db().agents.includes(name)) return res.status(404).json({ error: 'Agent not found' });
  db().agentEmails[name] = String(req.body.email || '').trim();
  save();
  res.json(db().agentEmails);
});

api.post('/agents', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name && !db().agents.includes(name)) db().agents.push(name);
  if (name && req.body.email) db().agentEmails[name] = String(req.body.email).trim();
  save();
  res.json(db().agents);
});

api.put('/stores/:code', (req, res) => {
  const s = db().stores.find((x) => x.code === req.params.code);
  if (!s) return res.status(404).json({ error: 'Store not found' });
  for (const k of ['spocName', 'spocEmail', 'spocPhone', 'hours']) if (k in req.body) s[k] = req.body[k];
  save();
  res.json(s);
});

// ----- cases -----
api.get('/cases', (req, res) => {
  const { status, channel, store: st, caseType, q, overdue, assignedTo } = req.query;
  let list = db().cases;
  if (status) list = list.filter((c) => status.split(',').includes(c.status));
  if (channel) list = list.filter((c) => c.channel === channel);
  if (st) list = list.filter((c) => c.store === st);
  if (caseType) list = list.filter((c) => c.caseType === caseType);
  if (assignedTo) list = list.filter((c) => (assignedTo === '-' ? !c.assignedTo : c.assignedTo === assignedTo));
  if (overdue) list = list.filter((c) => c.status === 'Escalated' && c.dueAt && c.dueAt < now());
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((c) => [c.id, c.name, c.phone, c.email, c.businessName, c.cardNo, c.subject, c.orderRef].some((v) => v && v.toLowerCase().includes(s)));
  }
  res.json([...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ timeline, ...c }) => c));
});

api.get('/cases/:id', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const history = db()
    .cases.filter((x) => x.id !== c.id && ((c.phone && phoneKey(x.phone) === phoneKey(c.phone)) || (c.email && x.email === c.email)))
    .map(summary);
  res.json({ ...c, history });
});

api.post('/cases', (req, res) => {
  const { status, statusNote, note, callTxnId, ...body } = req.body;
  const { c, warning } = core.createCase(body, agentOf(req), { status, statusNote, note, callTxnId });
  res.status(201).json({ ...c, warning });
});

const EDITABLE = ['callerType', 'memberId', 'name', 'phone', 'email', 'businessName', 'cardNo', 'store', 'caseType', 'category', 'subCategory', 'productCategory', 'orderRef', 'purchaseDate', 'subject', 'description', 'assignedTo'];

api.patch('/cases/:id', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const by = agentOf(req);
  const patch = Object.fromEntries(EDITABLE.filter((k) => k in req.body).map((k) => [k, req.body[k]]));
  if (req.body.status && req.body.status !== c.status) core.validateStatus({ ...c, ...patch }, req.body.status); // reject before changing anything
  const changed = Object.keys(patch).filter((k) => patch[k] !== c[k]);
  for (const k of changed) c[k] = patch[k];
  if (changed.length) log(c, { by, type: 'edit', text: `Updated: ${changed.join(', ')}` });
  if (req.body.status && req.body.status !== c.status) applyStatus(c, req.body.status, by, req.body.note);
  else if (req.body.note) log(c, { by, type: req.body.noteType || 'note', text: req.body.note });
  save();
  res.json(c);
});

// Agent sends an email from the case page (through the connected mailbox).
api.post(
  '/cases/:id/email',
  wrap(async (req, res) => {
    const c = findCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    const { to, cc, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'To, subject and message are required' });
    const out = await auto.sendEmail({ to, cc, subject, body, caseId: c.id, kind: 'Agent email', by: agentOf(req) });
    if (out.status !== 'sent') return res.status(502).json({ error: `Email ${out.status}: ${out.error}`, case: c });
    res.json(c);
  })
);

api.get('/cases/:id/attachments/:file', (req, res) => {
  const a = auto.attachmentPath(req.params.id, req.params.file);
  if (!a) return res.status(404).json({ error: 'Attachment not found' });
  res.download(a.path, a.name);
});

// ----- SparkTG -----
api.post(
  '/cases/:id/calls',
  wrap(async (req, res) => {
    const c = findCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (!req.body.txnId) return res.status(400).json({ error: 'Enter the SparkTG call id' });
    if (calls.linkCaseToCall(c, req.body.txnId)) {
      save();
      return res.json(c);
    }
    if (!sparktg.configured()) return res.status(503).json({ error: 'SparkTG is not configured on the server (.env)' });
    await core.linkCall(c, req.body.txnId, agentOf(req));
    res.json(c);
  })
);

// Caller details for a live/just-ended call — used when a screen-pop only passes the call id.
api.get(
  '/sparktg/call/:txnId',
  wrap(async (req, res) => {
    if (!sparktg.configured()) return res.status(503).json({ error: 'SparkTG is not configured' });
    const raw = await sparktg.pollWithRetry(req.params.txnId, { tries: 3, delayMs: 2000 });
    if (!raw) return res.status(404).json({ error: 'SparkTG has no record for this call yet' });
    res.json(sparktg.normalizeCall(raw));
  })
);

api.get('/sparktg/status', (req, res) => {
  res.json({ configured: sparktg.configured(), events: (db().sparktgEvents || []).slice(-20).reverse() });
});

// Connection check: agents list plus the raw shape of a call record, so the field mapping can be verified.
api.get(
  '/sparktg/test',
  wrap(async (req, res) => {
    const out = { configured: sparktg.configured() };
    if (!out.configured) return res.json(out);
    try {
      const agents = await sparktg.fetchAgents();
      out.agents = { ok: true, count: agents.length, sample: agents.slice(0, 20) };
    } catch (e) {
      out.agents = { ok: false, error: e.message };
    }
    if (req.query.txnId) {
      try {
        const raw = await sparktg.pollRecentCall(req.query.txnId);
        out.call = raw ? { ok: true, raw, mapped: sparktg.normalizeCall(raw) } : { ok: false, error: 'No record for that call id' };
      } catch (e) {
        out.call = { ok: false, error: e.message };
      }
    }
    res.json(out);
  })
);

api.get(
  '/sparktg/recording/:caseId/:txnId',
  wrap(async (req, res) => {
    const call = findCase(req.params.caseId)?.calls?.find((x) => x.txnId === req.params.txnId);
    const url = call?.info?.recordingUrl;
    if (!url || !/^https?:\/\//.test(url)) return res.status(404).json({ error: 'No recording for this call' });
    const r = await sparktg.fetchRecording(url);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'));
    Readable.fromWeb(r.body).pipe(res);
  })
);

// Call-event webhook for SparkTG. Payload fields are matched loosely; the last 50 events are kept for checking in Settings.
api.all('/sparktg/event', (req, res) => {
  const token = process.env.SPARKTG_WEBHOOK_TOKEN;
  if (token && req.query.token !== token) return res.status(401).json({ error: 'Bad token' });
  const payload = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
  delete payload.token;
  const info = sparktg.normalizeCall(payload);
  const d = db();
  d.sparktgEvents.push({ at: now(), payload });
  d.sparktgEvents = d.sparktgEvents.slice(-50);
  const missed = /miss|abandon|no.?answer|unanswer|not.?answer|noans/i.test(String(info.disposition || ''));
  let created = null;
  if (missed && info.phone && !d.missedCalls.some((m) => info.txnId && m.txnId === info.txnId)) {
    created = core.createMissedCall({ phone: info.phone, at: info.startedAt, reason: 'From SparkTG: ' + info.disposition, txnId: info.txnId });
  }
  save();
  res.json({ ok: true, missedCallCreated: created?.id || null });
});

// ----- call log (fed by the SparkTG dialer embedded in the CRM) -----
api.post('/calls/event', (req, res) => {
  res.json(calls.callEvent(req.body, agentOf(req)));
});

api.get('/calls', (req, res) => {
  res.json(calls.listCalls(req.query));
});

api.get('/calls/stats', (req, res) => {
  res.json(calls.callStats(req.query.date));
});

api.get('/calls/:id', (req, res) => {
  const r = db().calls.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Call not found' });
  res.json(r);
});

api.get(
  '/calls/:id/recording',
  wrap(async (req, res) => {
    const url = db().calls.find((x) => x.id === req.params.id)?.info?.recordingUrl;
    if (!url || !/^https?:\/\//.test(url)) return res.status(404).json({ error: 'No recording for this call' });
    const r = await sparktg.fetchRecording(url);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'));
    Readable.fromWeb(r.body).pipe(res);
  })
);

// ----- email intake (manual form; the mailbox poller calls the same function) -----
api.post('/email-intake', (req, res) => {
  const r = core.intakeEmail(req.body, req.get('x-agent') || 'System');
  res.status(r.threaded ? 200 : 201).json(r);
});

// ----- caller lookup -----
api.get('/lookup', (req, res) => {
  const s = String(req.query.q || '').trim().toLowerCase();
  if (s.length < 3) return res.json({ members: [], cases: [], match: null });
  const key = phoneKey(s);

  // A full mobile number is an exact lookup: owner phone, alternate phone, or an add-on card holder's phone.
  if (key.length === 10) {
    const match = core.findMemberByPhone(key);
    const related = db().cases.filter((c) => phoneKey(c.phone) === key || (match && c.memberId === match.member.id));
    const calls = related
      .flatMap((c) => (c.calls || []).filter((k) => k.status === 'found').map((k) => ({ caseId: c.id, txnId: k.txnId, ...k.info })))
      .slice(-5)
      .reverse();
    return res.json({
      members: match ? [match.member] : [],
      match,
      cases: related.slice(-10).reverse().map(summary),
      calls,
      openCases: related.filter((c) => c.status !== 'Closed').length,
    });
  }

  const hit = (v) => v && String(v).toLowerCase().includes(s);
  const members = db().members.filter((m) => [m.phone, m.altPhone, m.cardNo, m.email, m.businessName, m.ownerName].some(hit)).slice(0, 10);
  const cases = db().cases.filter((c) => [c.phone, c.email, c.cardNo].some(hit)).slice(-10).reverse().map(summary);
  const byCard = db().members.find((m) => m.cardNo && m.cardNo.toLowerCase() === s);
  res.json({ members, cases, match: byCard ? { member: byCard, via: 'card' } : null });
});

// ----- members -----
api.get('/members', (req, res) => {
  const s = String(req.query.q || '').toLowerCase();
  let list = db().members;
  if (s) list = list.filter((m) => [m.phone, m.cardNo, m.email, m.businessName, m.ownerName, m.gstin].some((v) => v && v.toLowerCase().includes(s)));
  res.json([...list].reverse().slice(0, 500));
});

const MAX_ADDON_CARDS = 4; // process owner decision, 30 Sep 2026
const checkAddOns = (body) => {
  if (Array.isArray(body.addOnCards) && body.addOnCards.length > MAX_ADDON_CARDS) throw core.fail(`A member can have at most ${MAX_ADDON_CARDS} add-on cards`);
};

api.post('/members', (req, res) => {
  checkAddOns(req.body);
  const m = { id: store.nextId('member', 'M-', 5), createdAt: now(), status: 'Active', addOnCards: [], ...req.body };
  db().members.push(m);
  save();
  res.status(201).json(m);
});

// Bulk import from the member master (CSV parsed in the browser). Existing members matched by card no. or mobile are updated.
api.post('/members/import', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    if (!r.phone && !r.cardNo) continue;
    const existing = db().members.find((m) => (r.cardNo && m.cardNo && m.cardNo.toLowerCase() === String(r.cardNo).toLowerCase()) || (r.phone && phoneKey(m.phone) === phoneKey(r.phone)));
    const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== ''));
    if (existing) {
      Object.assign(existing, clean, { id: existing.id });
      updated++;
    } else {
      db().members.push({ id: store.nextId('member', 'M-', 5), createdAt: now(), status: 'Active', addOnCards: [], ...clean });
      added++;
    }
  }
  save();
  res.json({ added, updated, total: db().members.length });
});

api.patch('/members/:id', (req, res) => {
  const m = db().members.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  checkAddOns(req.body);
  Object.assign(m, req.body, { id: m.id });
  save();
  res.json(m);
});

// ----- missed calls -----
api.get('/missed-calls', (req, res) => {
  res.json([...db().missedCalls].reverse());
});

api.post('/missed-calls', (req, res) => {
  res.status(201).json(core.createMissedCall(req.body));
});

api.patch('/missed-calls/:id', (req, res) => {
  const m = db().missedCalls.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const by = agentOf(req);
  if (req.body.attempt) m.attempts.push({ at: now(), by, outcome: req.body.attempt });
  if (req.body.status) {
    m.status = req.body.status;
    if (req.body.status !== 'Open') Object.assign(m, { calledBackAt: now(), calledBackBy: by });
  }
  save();
  res.json(m);
});

// ----- outbound leads -----
api.get('/leads', (req, res) => {
  let list = db().leads;
  if (req.query.type) list = list.filter((l) => l.type === req.query.type);
  if (req.query.status) list = list.filter((l) => req.query.status.split(',').includes(l.status));
  res.json([...list].reverse());
});

api.post('/leads', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const created = rows.map((r) => {
    const l = {
      id: store.nextId('lead', 'LD-', 5),
      createdAt: now(),
      type: r.type || 'New registration',
      name: r.name || '',
      businessName: r.businessName || '',
      phone: r.phone || '',
      store: r.store || '',
      notes: r.notes || '',
      status: 'New',
      callbackAt: null,
      log: [],
    };
    db().leads.push(l);
    return l;
  });
  save();
  res.status(201).json(created);
});

// Confirmation calls close or re-open the case they belong to.
api.patch('/leads/:id', (req, res) => {
  const l = db().leads.find((x) => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  const by = agentOf(req);
  const { outcome, note, callbackAt } = req.body;
  if (outcome) {
    const c = l.caseId && findCase(l.caseId);
    if (c && outcome === 'Confirmed resolved' && c.status !== 'Closed') {
      if (c.status !== 'Resolved') throw core.fail(`${c.id} is ${c.status} — it can be closed only after the store's resolution (status Resolved)`);
      applyStatus(c, 'Closed', by, `Customer confirmed on call${note ? ': ' + note : ''}`);
    }
    if (c && outcome === 'Not satisfied' && c.status === 'Resolved') applyStatus(c, 'Escalated', by, `Customer not satisfied${note ? ': ' + note : ''}`);
    l.status = outcome;
    l.callbackAt = callbackAt || null;
    l.log.push({ at: now(), by, outcome, note: note || '' });
  }
  save();
  res.json(l);
});

// ----- automation -----
api.get('/automation', (req, res) => {
  const d = db();
  res.json({
    settings: auto.settings(),
    shifts: Object.keys(auto.SHIFTS),
    agentShifts: d.agentShifts,
    mail: { configured: mail.configured(), mailbox: mail.mailbox(), ...auto.mailState, signin: mail.signinStatus() },
    log: d.automationLog.slice(-300).reverse(),
    outbox: d.outbox.slice(-150).reverse(),
  });
});

api.put('/automation', (req, res) => {
  res.json(auto.updateSettings(req.body));
});

api.post(
  '/automation/run',
  wrap(async (req, res) => {
    await auto.tick();
    res.json({ ok: true, mail: auto.mailState });
  })
);

// "Sign in with Microsoft" for the mailbox (device code: the page shows a code to enter at microsoft.com/devicelogin).
api.get('/mail/signin', (req, res) => res.json(mail.signinStatus()));
api.post(
  '/mail/signin',
  wrap(async (req, res) => {
    const job = await mail.startSignin();
    auto.activity(`${agentOf(req)} started Microsoft sign-in for the mailbox`);
    res.json({ ...mail.signinStatus(), pending: job });
  })
);
api.delete('/mail/signin', (req, res) => {
  mail.signOut();
  auto.activity(`${agentOf(req)} disconnected the mailbox`);
  save();
  res.json(mail.signinStatus());
});

api.get(
  '/mail/test',
  wrap(async (req, res) => {
    if (!mail.configured()) return res.json({ configured: false });
    try {
      res.json({ configured: true, ok: true, ...(await mail.test()) });
    } catch (e) {
      res.json({ configured: true, ok: false, error: e.message });
    }
  })
);

// ----- dashboard -----
api.get('/stats', (req, res) => {
  const t = now();
  const today = t.slice(0, 10);
  const cases = db().cases;
  const byStatus = Object.fromEntries(Object.keys(TRANSITIONS).map((s) => [s, 0]));
  cases.forEach((c) => byStatus[c.status]++);
  const todayCases = cases.filter((c) => c.createdAt.slice(0, 10) === today);
  const count = (arr, key) => arr.reduce((acc, x) => ((acc[x[key] || '—'] = (acc[x[key] || '—'] || 0) + 1), acc), {});
  const open = cases.filter((c) => c.status !== 'Closed');
  const escalated = cases.filter((c) => c.status === 'Escalated');
  const agent = req.get('x-agent');
  res.json({
    byStatus,
    openTotal: open.length,
    mine: agent ? open.filter((c) => c.assignedTo === agent).length : 0,
    unassigned: open.filter((c) => !c.assignedTo).length,
    today: {
      total: todayCases.length,
      byChannel: count(todayCases, 'channel'),
      byType: count(todayCases, 'caseType'),
      closedRot: cases.filter((c) => c.closedAt?.slice(0, 10) === today && c.resolutionType === 'ROT').length,
      automated: db().automationLog.filter((a) => a.at.slice(0, 10) === today).length,
    },
    pendingEmails: cases.filter((c) => c.channel === 'Email' && c.status === 'Pending').length,
    overdueEscalations: escalated.filter((c) => c.dueAt < t).length,
    escalatedByStore: count(escalated, 'store'),
    missedOpen: db().missedCalls.filter((m) => m.status === 'Open').length,
    missedBreached: db().missedCalls.filter((m) => m.status === 'Open' && m.dueAt < t).length,
    leadsDue: db().leads.filter((l) => l.status === 'New' || (l.status === 'Call back' && (!l.callbackAt || l.callbackAt <= t))).length,
    topCategories: Object.entries(count(open.filter((c) => c.category), 'category'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
  });
});

// Live count for every box of the workflow chart (Workflow page).
api.get('/flow', (req, res) => {
  const d = db();
  const t = now();
  const day = new Date().toLocaleDateString('en-CA');
  const isToday = (iso) => iso && new Date(iso).toLocaleDateString('en-CA') === day;
  const cases = d.cases;
  const open = cases.filter((c) => c.status !== 'Closed');
  const by = (f) => cases.filter(f).length;
  const openMissed = d.missedCalls.filter((m) => m.status === 'Open');
  const escalated = cases.filter((c) => c.status === 'Escalated');
  const overdue = escalated.filter((c) => c.dueAt < t).length;
  const leadOpen = (l) => ['New', 'Call back', 'Not reachable'].includes(l.status);
  const n = (value, label, alert = false) => ({ n: value, label, alert });
  res.json({
    start: n(by((c) => isToday(c.createdAt)), 'cases today'),
    ib: n(d.calls.filter((r) => r.direction === 'inbound' && isToday(r.startedAt)).length, 'inbound calls today'),
    missed: n(openMissed.length, openMissed.some((m) => m.dueAt < t) ? `open · ${openMissed.filter((m) => m.dueAt < t).length} past 30 min` : 'open', openMissed.some((m) => m.dueAt < t)),
    email: n(by((c) => c.channel === 'Email' && c.status === 'Pending'), 'pending emails', by((c) => c.channel === 'Email' && c.status === 'Pending') > 0),
    airead: n(by((c) => c.channel === 'Email' && c.auto && isToday(c.createdAt)), 'read automatically today'),
    aicheck: n(by((c) => c.channel === 'Email' && isToday(c.createdAt) && ['Issue & Complaint', 'Request'].includes(c.caseType)), 'checked today'),
    aiwait: n(by((c) => c.status === 'Waiting' && c.infoRequests), 'waiting for customer info'),
    ob: n(d.leads.filter(leadOpen).length, 'leads to call'),
    obpitch: n(d.calls.filter((r) => r.direction === 'outbound' && isToday(r.startedAt)).length, 'outbound calls today'),
    oms: n(d.leads.filter((l) => l.status === 'Order placed').length, 'orders on call'),
    identify: n(d.members.length, 'registered members'),
    custtype: n(d.stores.length, 'stores'),
    casetype: n(open.filter((c) => !c.caseType).length, 'open, not categorised', open.some((c) => !c.caseType)),
    enq: n(open.filter((c) => c.caseType === 'Enquiry').length, 'open'),
    comp: n(open.filter((c) => c.caseType === 'Issue & Complaint').length, 'open'),
    req: n(open.filter((c) => c.caseType === 'Request').length, 'open'),
    kb: n(by((c) => c.caseType === 'Enquiry' && c.resolutionType === 'ROT' && isToday(c.closedAt)), 'answered today'),
    reqdocs: n(open.filter((c) => c.caseType === 'Request').length, 'open requests'),
    createcase: n(by((c) => isToday(c.createdAt)), 'created today'),
    decide: n(by((c) => c.status === 'Pending'), 'pending decision', by((c) => c.status === 'Pending') > 0),
    rot: n(by((c) => c.resolutionType === 'ROT' && isToday(c.closedAt)), 'ROT today'),
    esc1: n(escalated.length, overdue ? `with stores · ${overdue} overdue` : 'with stores', overdue > 0),
    waiting: n(by((c) => c.status === 'Waiting'), 'waiting'),
    callclose: n(d.calls.filter((r) => r.connected && isToday(r.startedAt)).length, 'connected calls today'),
    followup: n(overdue, 'overdue — follow up', overdue > 0),
    resolution: n(by((c) => c.status === 'Resolved'), 'awaiting confirmation'),
    confirm: n(d.leads.filter((l) => l.caseId && leadOpen(l)).length, 'confirmation calls due'),
    closed: n(by((c) => isToday(c.closedAt)), 'closed today'),
  });
});

api.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="lots-crm-backup-${now().slice(0, 10)}.json"`);
  res.json(db());
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------- front end ----------
if (PROD) {
  app.use(express.static(path.join(ROOT, 'dist')));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use — is the CRM already running?` : err);
    process.exit(1);
  }
  auto.start();
  setInterval(() => calls.sweepLiveCalls().catch(() => {}), 60000);
  setTimeout(() => calls.sweepLiveCalls().catch(() => {}), 10000);
  console.log(`LOTS CRM running on http://localhost:${PORT} ${PROD ? '(production)' : '(dev)'}`);
  const dbs = store.status();
  console.log(`Data: ${dbs.backend === 'mysql' ? `MySQL database "${dbs.database}"` : dbs.file}`);
  console.log(`Credentials: ${fs.existsSync(SECRETS_FILE) ? SECRETS_FILE : 'no private secrets file found (' + SECRETS_FILE + ')'}`);
  console.log(`Mailbox: ${mail.configured() ? mail.mailbox() + ' (auto-import on)' : 'not connected'} · SparkTG: ${sparktg.configured() ? 'connected' : 'not connected'}`);
});

// Write any pending changes before the process stops (Ctrl + C, service stop).
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      await store.close();
    } finally {
      process.exit(0);
    }
  });
}
