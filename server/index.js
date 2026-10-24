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
const matrixImport = await import('./matrixImport.js');
const matrixLink = await import('./matrixLink.js');
const vtiger = await import('./vtiger.js');
const { mergeDependencies, mergeLists, sameValue } = await import('../src/picklists.js');
const { workflowFor } = await import('../src/workflows.js');
const { CRISIS_CONTACTS, HO_MATRIX, MATRIX_SOURCE, STAGES, WORK_HOURS } = await import('../src/escalationMatrix.js');
const { STORE_TABS } = await import('../src/storeMatrix.js');

const { db, save, now, log, findCase, applyStatus, phoneKey, TRANSITIONS } = core;
const { normalizeCallerType, normalizeCaseNames } = await import('../src/taxonomy.js');
{
  // type of contact renamed to the case master's labels (15 Oct 2026): convert saved cases once
  let n = 0;
  for (const c of db().cases) {
    const v = normalizeCallerType(c.callerType);
    if (v !== c.callerType) (c.callerType = v), n++;
    // case types / categories renamed to the escalation workbook's "Case catergory" sheet (17 Oct 2026)
    const names = normalizeCaseNames(c);
    if (Object.keys(names).length) Object.assign(c, names), n++;
  }
  // store 105 is "DH Duhai" in the case master
  const dh = db().stores.find((x) => x.code === '105');
  if (dh && dh.short === 'GZB') (dh.short = 'DH'), n++;
  if (n) {
    save();
    console.log(`Updated to the case master names (type of contact, case type / category, DH store): ${n} change(s)`);
  }
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.argv.includes('--prod');
const STARTED_AT = new Date().toISOString();
const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.use(express.json({ limit: '5mb' }));

const api = express.Router();
// sign-in with passwords and roles (server/auth.js): off until an admin switches it on
const auth = await import('./auth.js');
api.use(auth.guard);
auth.routes(api);
const agentOf = (req) => req.get('x-agent') || 'Unknown';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const summary = ({ id, createdAt, status, caseType, category, subCategory }) => ({ id, createdAt, status, caseType, category, subCategory });

// Health check for the background service (scripts/crm-service.ps1): up, and no database writes pending.
// Open without sign-in; it shows nothing about the data.
api.get('/health', (req, res) => {
  const d = store.status();
  res.json({ ok: true, backend: d.backend, pending: d.pending || 0, lastError: d.lastError ? true : false, startedAt: STARTED_AT });
});

api.get('/meta', (req, res) => {
  res.json({
    stores: db().stores,
    agents: db().agents,
    transitions: TRANSITIONS,
    integrations: { mail: mail.configured(), sparktg: sparktg.configured(), teamsPreview: auto.previewing() },
    widgetUrl: process.env.SPARKTG_WIDGET_URL || '',
    teams: core.teams(),
    picklists: db().picklists || {},
    escalationMatrix: db().settings?.escalationMatrix || {},
    hoMatrix: hoMatrixView(),
    contactMatrix: contactMatrixView(),
    // store matrix, First Time Resolution only (the New case form shows where a case will go): { '101': { 'app-tech': 'a@cpwi.in' } }
    storeMatrixTo: Object.fromEntries(db().stores.map((s) => [s.code, Object.fromEntries(core.storeRows(s.code).map((r) => [r.rowKey, core.hoStage(r, 0)?.to.join(', ') || '']))])),
    workHours: { ...WORK_HOURS, ...(db().settings?.workHours || {}) },
    holidays: db().settings?.holidays || [],
    dependencies: db().dependencies || [],
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

// ----- Picklists and dependencies (as in the PSRI CRM) -----
// Base values come from src/taxonomy.js and can't be removed; added ones can.
const clean = (v) => String(v || '').trim().replace(/\s+/g, ' ');

api.post('/picklists', (req, res) => {
  const field = clean(req.body.field);
  const value = clean(req.body.value);
  if (!field || !value) return res.status(400).json({ error: 'Enter the list name and a value' });
  if (field.length > 60 || value.length > 100) return res.status(400).json({ error: 'Name or value is too long' });
  const lists = mergeLists(db().picklists);
  const listName = Object.keys(lists).find((n) => sameValue(n, field)) || field;
  const existing = (lists[listName] || []).find((v) => sameValue(v, value));
  if (existing) return res.status(409).json({ error: `"${existing}" is already in ${listName}` });
  const d = db();
  d.picklists ||= {};
  d.picklists[listName] = [...(d.picklists[listName] || []), { value, by: agentOf(req), at: now() }];
  save();
  res.status(201).json({ picklists: d.picklists, dependencies: d.dependencies || [] });
});

api.delete('/picklists', (req, res) => {
  const { field, value } = req.body;
  const d = db();
  const list = d.picklists?.[field] || [];
  if (!list.some((x) => x.value === value)) return res.status(400).json({ error: 'Only values added here can be removed (values from the case master stay)' });
  d.picklists[field] = list.filter((x) => x.value !== value);
  if (!d.picklists[field].length) delete d.picklists[field];
  // pairs that used the value go too
  d.dependencies = (d.dependencies || []).filter((p) => !((p.mainField === field && p.mainValue === value) || (p.subField === field && p.subValue === value)));
  save();
  res.json({ picklists: d.picklists, dependencies: d.dependencies });
});

api.post('/dependencies', (req, res) => {
  const p = Object.fromEntries(['mainField', 'mainValue', 'subField', 'subValue'].map((k) => [k, clean(req.body[k])]));
  if (Object.values(p).some((v) => !v)) return res.status(400).json({ error: 'All 4 fields are required' });
  if (p.mainField === p.subField) return res.status(400).json({ error: 'Main field and sub field must be different' });
  const lists = mergeLists(db().picklists);
  if (!(lists[p.mainField] || []).includes(p.mainValue)) return res.status(400).json({ error: `"${p.mainValue}" is not in the ${p.mainField} picklist — add it there first` });
  if (!(lists[p.subField] || []).includes(p.subValue)) return res.status(400).json({ error: `"${p.subValue}" is not in the ${p.subField} picklist — add it there first` });
  const all = mergeDependencies(db().dependencies);
  if (all.some((x) => x.mainField === p.mainField && x.mainValue === p.mainValue && x.subField === p.subField && x.subValue === p.subValue)) return res.status(409).json({ error: `${p.mainValue} → ${p.subValue} already exists` });
  const d = db();
  d.dependencies = [...(d.dependencies || []), { ...p, by: agentOf(req), at: now() }];
  save();
  res.status(201).json({ picklists: d.picklists || {}, dependencies: d.dependencies });
});

api.delete('/dependencies', (req, res) => {
  const { mainField, mainValue, subField, subValue } = req.body;
  const d = db();
  const before = (d.dependencies || []).length;
  d.dependencies = (d.dependencies || []).filter((x) => !(x.mainField === mainField && x.mainValue === mainValue && x.subField === subField && x.subValue === subValue));
  if (d.dependencies.length === before) return res.status(400).json({ error: 'Only pairs added here can be removed (pairs from the case master stay)' });
  save();
  res.json({ picklists: d.picklists || {}, dependencies: d.dependencies });
});

// ----- Microsoft Teams preview (emails posted to a Teams channel instead of being sent) -----
const teams = await import('./teams.js');
api.get('/teams-preview', (req, res) => res.json({ configured: teams.configured(), enabled: Boolean(auto.settings().teamsPreview) }));
api.post(
  '/teams-preview/test',
  wrap(async (req, res) => {
    await teams.postCard({ title: '✅ LOTS CRM is connected to this channel', subtitle: `Test sent by ${agentOf(req)}`, lines: ['While “Email previews to Teams” is on, every email the CRM would send (acknowledgements, escalations, follow-ups, resolutions…) is posted here instead. Nobody receives an email.'] });
    res.json({ ok: true });
  })
);
api.post(
  '/teams-preview/samples',
  wrap(async (req, res) => res.json({ count: await auto.sendSamples(agentOf(req)) }))
);

// Escalation teams of the case workflows (E-commerce, IT, BDA, HR, …): contact details
api.put('/teams/:key', (req, res) => {
  if (!core.teams()[req.params.key]) return res.status(404).json({ error: 'Team not found' });
  const d = db();
  d.teams ||= {};
  d.teams[req.params.key] = { ...(d.teams[req.params.key] || {}), ...Object.fromEntries(['contact', 'email', 'phone'].filter((k) => k in req.body).map((k) => [k, String(req.body[k] || '').trim()])) };
  save();
  res.json(core.teams());
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
  res.json([...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ timeline, ...c }) => ({ ...c, lastFollowupAt: c.lastFollowupAt || lastFollowup(timeline) })));
});

// A case with where its escalation goes (target) and the levels above Level 1 (escalation matrix)
function view(c) {
  const target = core.targetFor(c);
  const at = c.status === 'Escalated' && c.escalatedTo ? c.escalatedTo : target;
  const row = core.escalationRow(at.kind === 'store' && !at.code ? null : at);
  return {
    ...c,
    target,
    levels: core.escalationLevels(at),
    levelName: core.levelName({ ...c, escalatedTo: at }),
    queryDetails: auto.detailsFor(c), // the "Details of the Query" block of the store / team email templates
    // the three stages (First Time Resolution, Level 1, Level 2) of the HO row or the store / team row
    matrix: row && { key: row.key, row: row.row, ho: at.kind === 'matrix' && !row.store, store: row.store || null, toConfirm: row.toConfirm || '', levelsFrom: row.levelsFrom || null, stages: [0, 1, 2].map((i) => core.hoStage(row, i)).filter(Boolean) },
  };
}

// Store / team escalation rows for the screens (stage 0 = the store's / team's own contact)
const contactMatrixView = () =>
  core.contactRows().map((r) => ({ key: r.key, kind: r.kind, code: r.code, row: r.row, edited: r.edited, updatedAt: r.updatedAt, updatedBy: r.updatedBy, stages: [0, 1, 2].map((i) => (r.stages[i] ? { ...core.hoStage({ stages: [r.stages[i]] }, 0), label: STAGES[i] } : null)) }));

// HO escalation matrix for the screens: each row with its stages ready to show (To / Cc without duplicates, TAT text)
const hoMatrixView = () => ({
  source: MATRIX_SOURCE,
  crisis: CRISIS_CONTACTS,
  rows: core.hoMatrix().map((r) => ({ key: r.key, row: r.row, match: r.match, updatedAt: r.updatedAt, updatedBy: r.updatedBy, edited: Boolean(r.updatedAt), stages: [0, 1, 2].map((i) => core.hoStage(r, i)).filter(Boolean) })),
});

// SOP: a store follow-up is a call by an agent (the automatic daily email doesn't count)
const lastFollowup = (timeline = []) => [...timeline].reverse().find((t) => t.type === 'store-followup' && t.by !== 'Automation')?.at || null;

api.get('/cases/:id', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const history = db()
    .cases.filter((x) => x.id !== c.id && ((c.phone && phoneKey(x.phone) === phoneKey(c.phone)) || (c.email && x.email === c.email)))
    .map(summary);
  res.json({ ...view(c), history }); // target: where an escalation would go under the case's workflow
});

api.post('/cases', (req, res) => {
  const { status, statusNote, note, callTxnId, ...body } = req.body;
  const { c, warning } = core.createCase(body, agentOf(req), { status, statusNote, note, callTxnId });
  res.status(201).json({ ...c, warning });
});

const EDITABLE = ['callerType', 'memberId', 'name', 'phone', 'email', 'businessName', 'cardNo', 'store', 'caseType', 'category', 'subCategory', 'requestFor', 'sub2', 'closureType', 'productType', 'productCategory', 'orderRef', 'purchaseDate', 'callType', 'calledNumber', 'purchaseAmount', 'refundAmount', 'subject', 'description', 'assignedTo'];

api.patch('/cases/:id', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  const by = agentOf(req);
  const patch = Object.fromEntries(EDITABLE.filter((k) => k in req.body).map((k) => [k, req.body[k]]));
  if ('callerType' in patch) patch.callerType = normalizeCallerType(patch.callerType);
  const escalateTo = req.body.status === 'Escalated' && req.body.escalateTo?.kind ? { kind: req.body.escalateTo.kind, code: String(req.body.escalateTo.code || '') } : null;
  if (req.body.status && req.body.status !== c.status) core.validateStatus({ ...c, ...patch, ...(escalateTo ? { escalateTo } : {}) }, req.body.status); // reject before changing anything
  const changed = Object.keys(patch).filter((k) => patch[k] !== c[k]);
  for (const k of changed) c[k] = patch[k];
  if (changed.length) log(c, { by, type: 'edit', text: `Updated: ${changed.join(', ')}` });
  if (req.body.checkStep) {
    c.checklist ||= {};
    const done = req.body.done !== false;
    c.checklist[req.body.checkStep] = { done, by, at: now() };
    log(c, { by, type: 'workflow', text: `${done ? '✓' : 'Unticked'}: ${req.body.stepLabel || req.body.checkStep}` });
  }
  if ('promisedAt' in req.body) {
    const p = req.body.promisedAt && /^\d{4}-\d{2}-\d{2}$/.test(req.body.promisedAt) ? req.body.promisedAt : null;
    if (p !== (c.promisedAt || null)) {
      c.promisedAt = p;
      if (!req.body.note) log(c, { by, type: 'escalation', text: p ? `Store promised the resolution by ${new Date(p).toLocaleDateString('en-IN')}` : 'Promised date cleared' });
    }
  }
  if (req.body.storeReplyReviewed) c.storeReplyReview = null;
  if (escalateTo) c.escalateTo = escalateTo;
  if (req.body.status && req.body.status !== c.status) applyStatus(c, req.body.status, by, req.body.note);
  else if (req.body.note) log(c, { by, type: req.body.noteType || 'note', text: req.body.note + (req.body.noteType === 'store-followup' && c.promisedAt && 'promisedAt' in req.body ? ` Promised by ${new Date(c.promisedAt).toLocaleDateString('en-IN')}.` : '') });
  if (req.body.noteType === 'store-followup') c.lastFollowupAt = now();
  save();
  res.json(view(c));
});

// Escalated to the wrong store / team, or passed on: move it (fresh Level 1 and TAT, escalation email to the new one)
api.post('/cases/:id/reroute', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  core.rerouteEscalation(c, { kind: req.body.kind, code: String(req.body.code || '') }, agentOf(req), String(req.body.note || '').trim());
  save();
  res.json(view(c));
});

// Agent / team leader raises the escalation level now (instead of waiting for the TAT to pass)
api.post(
  '/cases/:id/raise-level',
  wrap(async (req, res) => {
    const c = findCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (c.status !== 'Escalated') return res.status(400).json({ error: 'Only an escalated case can go to the next level' });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Give a reason for escalating further' });
    const level = await auto.raiseLevel(c, agentOf(req), reason);
    if (!level) return res.status(400).json({ error: c.escalatedTo?.kind === 'matrix' ? 'The case is already at Level 2, the highest level of the HO escalation matrix' : (c.escalationLevel || 1) >= 3 ? 'The case is already at Level 2, the highest level' : `No ${core.levelName(c, (c.escalationLevel || 1) + 1)} contact in the escalation matrix (Stores & settings → Store / team escalation matrix)` });
    res.json(view(c));
  })
);

// Correct an escalation level by hand (e.g. a level raised by mistake); the deadline is kept, the change is on the timeline
api.post('/cases/:id/set-level', (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (c.status !== 'Escalated') return res.status(400).json({ error: 'Only an escalated case has an escalation level' });
  const level = Math.max(1, Math.min(3, Number(req.body.level) || 1));
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Give a reason' });
  const was = c.escalationLevel || 1;
  c.escalationLevel = level;
  log(c, { by: agentOf(req), type: 'escalation', text: `Escalation level corrected from ${core.levelName(c, was)} to ${core.levelName(c, level)} — ${reason}` });
  save();
  res.json(view(c));
});

// Escalation matrix: contacts above Level 1, per store / team ('*' = default for all)
api.put('/escalation-matrix/:key', (req, res) => {
  const key = req.params.key;
  const ok = key === '*' || (key.startsWith('store:') && db().stores.some((s) => 'store:' + s.code === key)) || (key.startsWith('team:') && core.teams()[key.slice(5)]);
  if (!ok) return res.status(404).json({ error: 'Unknown store or team' });
  const levels = (Array.isArray(req.body.levels) ? req.body.levels : []).slice(0, 2).map((l) => ({ // Level 1 and Level 2 only (as in the Excel)
    name: String(l?.name || '').trim().slice(0, 100),
    email: String(l?.email || '').trim().slice(0, 300),
    phone: String(l?.phone || '').trim().slice(0, 30),
    tatDays: Math.max(1, Math.min(30, Number(l?.tatDays) || 1)),
  }));
  const bad = levels.find((l) => l.email && !l.email.split(/[,;\s]+/).filter(Boolean).every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)));
  if (bad) return res.status(400).json({ error: `Not a valid email: ${bad.email}` });
  // keep levels in order: an empty level in the middle would skip a level
  while (levels.length && !levels[levels.length - 1].email && !levels[levels.length - 1].name) levels.pop();
  if (levels.some((l) => !l.email)) return res.status(400).json({ error: 'Each level needs an email (fill Level 1 first, then Level 2)' });
  const d = db();
  d.settings ||= {};
  d.settings.escalationMatrix = { ...(d.settings.escalationMatrix || {}), [key]: levels };
  if (!levels.length) delete d.settings.escalationMatrix[key];
  // kept for older screens / tests: also update the row's Level 1 / Level 2
  const rows = (d.settings.escalationRows ||= {});
  if (rows[key]) rows[key].stages = [rows[key].stages[0], ...[0, 1].map((i) => (levels[i] ? { to: levels[i].email.split(/[,;\s]+/).filter(Boolean), cc: [], tat: { value: levels[i].tatDays, unit: 'days' }, name: levels[i].name } : null))];
  save();
  res.json(d.settings.escalationMatrix);
});

// Escalation matrix – stores & teams: one row per store / team (and the default '*'),
// First Time Resolution (the store's / team's email, saved on the store / team too), Level 1, Level 2: To / Cc / TAT
api.put('/escalation-rows/:key', (req, res) => {
  const key = req.params.key;
  const row = core.contactRow(key);
  if (!row) return res.status(404).json({ error: 'Unknown store or team' });
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map((e) => String(e).trim()).filter(Boolean);
  const stages = [0, 1, 2].map((i) => {
    const s = req.body.stages?.[i] || {};
    const to = list(s.to);
    const cc = list(s.cc);
    const value = Number(s.tat?.value) || 1;
    const unit = s.tat?.unit === 'hours' ? 'hours' : 'days';
    const bad = [...to, ...cc].find((e) => !EMAIL.test(e));
    if (bad) throw core.fail(`${STAGES[i]}: not a valid email: ${bad}`);
    if (cc.length && !to.length) throw core.fail(`${STAGES[i]}: add the To before the Cc`);
    if (!(value > 0 && value <= (unit === 'hours' ? 72 : 30))) throw core.fail(`${STAGES[i]}: TAT must be 1–${unit === 'hours' ? 72 : 30} working ${unit}`);
    return { to, cc, tat: { value, unit } };
  });
  if (!stages[1].to.length && stages[2].to.length) return res.status(400).json({ error: 'Fill Level 1 before Level 2' });
  const d = db();
  d.settings ||= {};
  d.settings.escalationRows = { ...(d.settings.escalationRows || {}), [key]: { stages: [key === '*' ? null : stages[0], stages[1], stages[2]], updatedAt: now(), updatedBy: agentOf(req) } };
  // the First Time Resolution To is the store's / team's email
  if (row.kind === 'store') d.stores.find((x) => x.code === row.code).spocEmail = stages[0].to.join(', ');
  if (row.kind === 'team') d.teams = { ...(d.teams || {}), [row.code]: { ...(d.teams?.[row.code] || {}), email: stages[0].to.join(', ') } };
  if (d.settings.escalationMatrix) delete d.settings.escalationMatrix[key]; // the row replaces the older Level 1 / 2 entry
  save();
  res.json(contactMatrixView());
});

// Clear a row's copy lists and levels (the store's / team's email stays)
api.delete('/escalation-rows/:key', (req, res) => {
  const d = db();
  if (d.settings?.escalationRows) delete d.settings.escalationRows[req.params.key];
  if (d.settings?.escalationMatrix) delete d.settings.escalationMatrix[req.params.key];
  save();
  res.json(contactMatrixView());
});

api.post(
  '/escalation-rows/:key/sample',
  wrap(async (req, res) => {
    if (!auto.previewing()) return res.status(400).json({ error: 'Teams preview is off or not connected (Automation → Teams preview)' });
    if (req.params.key === '*') return res.status(400).json({ error: 'Pick a store or team (the default row has no First Time Resolution contact)' });
    res.json({ count: await auto.sendMatrixSamples(req.params.key, agentOf(req)) });
  })
);

// HO escalation matrix: change a row's SPOCs / escalation lists / TATs (LOTS sends a new version of the sheet)
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i;
/** The three stages from the edit form, checked (valid emails, a SPOC per stage, a sensible TAT). */
function stagesFrom(body) {
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map((e) => String(e).trim()).filter(Boolean);
  const stages = (body.stages || []).slice(0, 3).map((s, i) => {
    const to = list(s?.to);
    const cc = list(s?.cc);
    const value = Number(s?.tat?.value);
    const unit = s?.tat?.unit === 'hours' ? 'hours' : 'days';
    const bad = [...to, ...cc].find((e) => !EMAIL.test(e));
    if (bad) throw core.fail(`${STAGES[i]}: not a valid email: ${bad}`);
    if (!to.length) throw core.fail(`${STAGES[i]}: add the SPOC (To)`);
    if (!(value > 0 && value <= (unit === 'hours' ? 72 : 30))) throw core.fail(`${STAGES[i]}: TAT must be 1–${unit === 'hours' ? 72 : 30} working ${unit}`);
    return { to, cc, tat: { value, unit } };
  });
  if (stages.length !== 3) throw core.fail('The row needs all three stages: First Time Resolution, Level 1 and Level 2');
  return stages;
}

api.put('/ho-matrix/:key', (req, res) => {
  const base = core.hoMatrix().find((r) => r.key === req.params.key);
  if (!base) return res.status(404).json({ error: 'Unknown escalation matrix row' });
  const stages = stagesFrom(req.body);
  const d = db();
  d.settings ||= {};
  d.settings.hoMatrix = { ...(d.settings.hoMatrix || {}), [base.key]: { stages, updatedAt: now(), updatedBy: agentOf(req) } };
  save();
  res.json(hoMatrixView());
});

// Back to the row as in the sheet (src/escalationMatrix.js)
api.delete('/ho-matrix/:key', (req, res) => {
  const d = db();
  if (d.settings?.hoMatrix) delete d.settings.hoMatrix[req.params.key];
  // a row added from an updated Excel has no "sheet" version: remove it
  if (d.settings?.hoExtra) d.settings.hoExtra = d.settings.hoExtra.filter((r) => r.key !== req.params.key);
  save();
  res.json(hoMatrixView());
});

// Post the First Time Resolution / Level 1 / Level 2 emails of one row to Teams (sample case, nothing emailed)
api.post(
  '/ho-matrix/:key/sample',
  wrap(async (req, res) => {
    if (!auto.previewing()) return res.status(400).json({ error: 'Teams preview is off or not connected (Automation → Teams preview)' });
    res.json({ count: await auto.sendMatrixSamples(req.params.key, agentOf(req)) });
  })
);

// Store escalation matrix (workbook store tabs): one store's rows, edit a row, back to the workbook, samples
const storeMatrixView = (code) => ({
  source: core.storeMatrixSource(),
  tabs: STORE_TABS.map((t) => ({ tab: t.tab, label: t.label })),
  rows: core.storeRows(code).map((r) => ({ key: r.key, store: r.store, tab: r.tab, row: r.row, sheet: r.sheet, toConfirm: r.toConfirm, note: r.note, edited: r.edited, updatedAt: r.updatedAt, updatedBy: r.updatedBy, stages: [0, 1, 2].map((i) => core.hoStage(r, i)).filter(Boolean) })),
});
api.get('/store-matrix', (req, res) => res.json(storeMatrixView(String(req.query.store || ''))));

api.put('/store-matrix/:key', (req, res) => {
  const row = core.storeRow(req.params.key);
  if (!row) return res.status(404).json({ error: 'Unknown store matrix row' });
  const stages = stagesFrom(req.body);
  const d = db();
  d.settings ||= {};
  d.settings.storeMatrix = { ...(d.settings.storeMatrix || {}), [row.key]: { stages, updatedAt: now(), updatedBy: agentOf(req) } };
  save();
  res.json(storeMatrixView(row.store));
});

api.delete('/store-matrix/:key', (req, res) => {
  const row = core.storeRow(req.params.key);
  if (!row) return res.status(404).json({ error: 'Unknown store matrix row' });
  if (db().settings?.storeMatrix) delete db().settings.storeMatrix[row.key];
  save();
  res.json(storeMatrixView(row.store));
});

api.post(
  '/store-matrix/:key/sample',
  wrap(async (req, res) => {
    if (!core.storeRow(req.params.key)) return res.status(404).json({ error: 'Unknown store matrix row' });
    if (!auto.previewing()) return res.status(400).json({ error: 'Teams preview is off or not connected (Automation → Teams preview)' });
    res.json({ count: await auto.sendMatrixSamples(req.params.key, agentOf(req)) });
  })
);

// Updated escalation matrix from LOTS (Excel / CSV): preview the changes, apply, undo
api.post(
  '/matrix-import',
  express.raw({ type: () => true, limit: '10mb' }),
  wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
    const name = String(req.query.name || 'matrix.xlsx');
    if (!/\.(xlsx|csv)$/i.test(name)) return res.status(400).json({ error: 'Upload the matrix as .xlsx or .csv' });
    res.json(await matrixImport.preview(req.body, name, agentOf(req)));
  })
);
api.get('/matrix-import', (req, res) => res.json({ open: matrixImport.openImports(), history: matrixImport.history(), choices: matrixImport.mappingChoices(), link: matrixLink.status() }));
// Live link to the Excel on OneDrive / SharePoint: read when someone presses Refresh now (and once when linked)
api.put('/matrix-link', wrap(async (req, res) => res.json(await matrixLink.setLink(req.body.url, agentOf(req)))));
api.post('/matrix-link/check', wrap(async (req, res) => res.json(await matrixLink.check(Boolean(req.body?.force)))));
api.delete('/matrix-link', (req, res) => res.json(matrixLink.unlink()));
api.post('/matrix-import/:id/apply', (req, res) => res.json(matrixImport.apply(req.params.id, agentOf(req), req.body.mapping || {})));
api.post('/matrix-import/:id/undo', (req, res) => res.json(matrixImport.undo(req.params.id, agentOf(req))));

// HO working hours, for TATs in hours (Legal: First Time Resolution within 4 working hours)
api.put('/work-hours', (req, res) => {
  const t = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : null);
  const start = t(req.body.start);
  const end = t(req.body.end);
  if (!start || !end || end <= start) return res.status(400).json({ error: 'Give the start and end time (HH:MM), end after start' });
  const d = db();
  d.settings ||= {};
  d.settings.workHours = { start, end };
  save();
  res.json(d.settings.workHours);
});

// Holidays: not counted as working days in TATs
api.put('/holidays', (req, res) => {
  const dates = [...new Set((req.body.dates || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
  const d = db();
  d.settings ||= {};
  d.settings.holidays = dates;
  save();
  res.json(dates);
});

// ----- support button: answers about the CRM, and tokens for the help desk manager -----
const support = await import('./support.js');

api.get('/support', (req, res) => res.json({ ...support.overview(), tickets: support.listTickets().length }));

// The answer to a question. No match → the caller (the support button) offers a support token.
api.post('/support/ask', (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Type your question first' });
  const answer = support.answer(question);
  if (answer) return res.json({ answered: true, answer });
  res.json({
    answered: false,
    related: support.related(question),
    hint: 'This one is not in the help articles — create a support token and the help desk manager will answer.',
  });
});

// One help article in full (the support button lists the topics).
api.get('/support/articles/:id', (req, res) => {
  const a = support.article(req.params.id);
  if (!a) return res.status(404).json({ error: 'No such help topic' });
  res.json(a);
});

// A support token: the agent cannot be helped by the articles, so the help desk manager takes over.
api.post(
  '/support/tickets',
  wrap(async (req, res) => {
    const ticket = await support.createTicket({
      question: req.body?.question,
      agent: agentOf(req),
      context: req.body?.context || {},
    });
    res.status(201).json(ticket);
  })
);

api.get('/support/tickets', (req, res) => res.json(support.listTickets()));

api.get('/support/tickets/:id', (req, res) => {
  const t = support.findTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'Support token not found' });
  res.json(t);
});

// The help desk manager's answer, or a close.
api.patch('/support/tickets/:id', (req, res) => {
  const action = req.body?.action || (req.body?.status === 'Closed' ? 'close' : 'reply');
  // 'reply' = the help desk manager answers; 'message' = the agent writes back on their token
  const t = action === 'close' ? support.closeTicket(req.params.id, agentOf(req)) : support.replyTicket(req.params.id, req.body?.reply, agentOf(req), action === 'message' ? 'agent' : 'manager');
  res.json(t);
});

api.get('/support/settings', (req, res) => res.json({ ...support.settings(), teamsConfigured: teams.configured() }));

api.delete('/support/tickets/:id', (req, res) => res.json(support.deleteTicket(req.params.id)));

api.put('/support/settings', (req, res) => res.json(support.updateSettings(req.body || {})));

// Escalation report per store / team: on time, days to resolve, overdue, levels
api.get('/escalation-report', (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const t = now();
  const day = new Date().toLocaleDateString('en-CA');
  const rows = new Map();
  for (const c of db().cases) {
    if (!c.escalatedAt) continue;
    const open = c.status === 'Escalated';
    if (!open && c.escalatedAt < since) continue;
    const to = c.escalatedTo || { kind: 'store', code: c.store };
    const key = `${to.kind}:${to.code || ''}`;
    if (!rows.has(key)) {
      const tgt = to.code || to.kind === 'team' ? core.targetByKey(to) : { name: 'Store not set' };
      rows.set(key, { key, kind: to.kind, name: tgt.name, escalated: 0, resolved: 0, onTime: 0, daysSum: 0, open: 0, overdue: 0, aboveL1: 0, promisesMissed: 0 });
    }
    const r = rows.get(key);
    if (c.escalatedAt >= since) r.escalated++;
    const resolvedAt = [...c.timeline].find((e) => e.type === 'status' && e.to === 'Resolved' && e.at >= c.escalatedAt)?.at;
    if (resolvedAt && resolvedAt >= since) {
      r.resolved++;
      const due = c.firstDueAt || core.addWorkingDays(c.escalatedAt, workflowTat(c));
      if (resolvedAt <= due) r.onTime++;
      r.daysSum += core.workingDaysBetween(c.escalatedAt, resolvedAt);
    }
    if (open) {
      r.open++;
      if (c.dueAt < t) r.overdue++;
      if ((c.escalationLevel || 1) > 1) r.aboveL1++;
      if (c.promisedAt && c.promisedAt < day) r.promisesMissed++;
    }
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, onTimePct: r.resolved ? Math.round((r.onTime / r.resolved) * 100) : null, avgDays: r.resolved ? Math.round((r.daysSum / r.resolved) * 10) / 10 : null }))
    .sort((a, b) => b.open - a.open || b.escalated - a.escalated);
  const sum = (k) => list.reduce((a, r) => a + r[k], 0);
  const resolved = sum('resolved');
  res.json({
    days,
    rows: list,
    total: { escalated: sum('escalated'), resolved, onTimePct: resolved ? Math.round((sum('onTime') / resolved) * 100) : null, avgDays: resolved ? Math.round((sum('daysSum') / resolved) * 10) / 10 : null, open: sum('open'), overdue: sum('overdue'), aboveL1: sum('aboveL1'), promisesMissed: sum('promisesMissed') },
  });
});

// Agent sends an email from the case page (through the connected mailbox).
api.post(
  '/cases/:id/email',
  wrap(async (req, res) => {
    const c = findCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'Case not found' });
    const { cc, subject, body, kind } = req.body;
    // Teams preview: an email with no address is still shown in Teams (nobody receives it)
    const to = req.body.to || (auto.previewing() ? '(not set — no email address on file)' : '');
    if (!to || !subject || !body) return res.status(400).json({ error: 'To, subject and message are required' });
    const files = (c.attachments || []).filter((a) => (req.body.attachments || []).includes(a.file));
    const out = await auto.sendEmail({ to, cc, subject, body, caseId: c.id, kind: kind || 'Agent email', by: agentOf(req), files });
    if (out.status !== 'sent' && out.status !== 'Teams preview') return res.status(502).json({ error: `Email ${out.status}: ${out.error}`, case: c });
    res.json({ ...c, sentTo: out.status });
  })
);

// Add a file to a case (raw bytes; name in ?name=). Photos / bills that arrive by WhatsApp or phone.
api.post('/cases/:id/attachments', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  const c = findCase(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file received' });
  const a = auto.saveCaseFile(c, String(req.query.name || 'file'), req.body, req.get('content-type'), agentOf(req));
  res.status(201).json({ attachment: a, case: view(c) });
});

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
  res.json(calls.callStats({ date: req.query.date, from: req.query.from, to: req.query.to }));
});

api.get('/calls/:id', (req, res) => {
  const r = db().calls.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Call not found' });
  res.json(r);
});

api.get(
  '/calls/:id/recording',
  wrap(async (req, res) => {
    const call = db().calls.find((x) => x.id === req.params.id);
    const url = call?.info?.recordingUrl;
    if (!url || !/^https?:\/\//.test(url)) return res.status(404).json({ error: 'No recording for this call' });
    const r = await sparktg.fetchRecording(url);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
    if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'));
    // Call logs → Download: saved as "call <number> <date>.mp3"
    if (req.query.download) {
      const ext = /wav/i.test(r.headers.get('content-type') || '') ? 'wav' : 'mp3';
      res.setHeader('Content-Disposition', `attachment; filename="call ${String(call.phone || '').replace(/[^\d+]/g, '')} ${String(call.startedAt || '').slice(0, 10)}.${ext}"`);
    }
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

  // One search box (Identify caller): mobile, card no., membership ID, name, business name or email —
  // of the contact or of its add-on card holders.
  // (the contact index: lakhs of contacts are not read one by one)
  const hit = (v) => v && String(v).toLowerCase().includes(s);
  const members = core.searchMembers(s, 10);
  const cases = db().cases.filter((c) => [c.phone, c.email, c.cardNo, c.name, c.businessName].some(hit)).slice(-10).reverse().map(summary);
  // an exact card no., membership ID or email identifies the caller (as a full mobile does)
  const ix = core.memberIndex();
  const byId = ix.id.get(s);
  const byEmail = ix.email.get(s);
  const match = ix.card.get(core.cardKey(s)) || (byId && { member: byId, via: 'id' }) || (byEmail && { member: byEmail, via: 'email' }) || null;
  res.json({ members: match && !members.includes(match.member) ? [match.member, ...members] : members, cases, match });
});

// ----- members -----
api.get('/members', (req, res) => {
  const s = String(req.query.q || '').toLowerCase();
  let list = db().members;
  if (s) return res.json(core.searchMembers(s, 500)); // the contact index (lakhs of contacts)
  res.json(list.slice(-500).reverse());
});

const MAX_ADDON_CARDS = 4; // process owner decision, 30 Sep 2026
const checkAddOns = (body) => {
  if (Array.isArray(body.addOnCards) && body.addOnCards.length > MAX_ADDON_CARDS) throw core.fail(`A member can have at most ${MAX_ADDON_CARDS} add-on cards`);
};
// registered numbers are unique across contacts (409 = conflict, with the number and the contact it belongs to)
const checkUniquePhones = (record, excludeId) => {
  const c = core.phoneConflict(record, excludeId);
  if (c) throw Object.assign(core.fail(c.message, 409), { data: { field: 'phone', phone: c.phone, memberId: c.memberId || null } });
  // card numbers are unique too (main card and add-on cards)
  const k = core.cardConflict(record, excludeId);
  if (k) throw Object.assign(core.fail(k.message, 409), { data: { field: 'card', card: k.card, memberId: k.memberId || null } });
};

api.post('/members', (req, res) => {
  checkAddOns(req.body);
  checkUniquePhones(req.body);
  const m = { id: store.nextId('member', 'M-', 5), createdAt: now(), status: 'Active', addOnCards: [], ...req.body };
  db().members.push(m);
  save();
  res.status(201).json(m);
});

// Bulk import from the member master or Vtiger (Contacts → Import CSV in parts, or the server's Vtiger import).
// Existing contacts (same Vtiger contact, card no. or mobile) are updated. Every number and card is checked against the
// contact index, not by reading all contacts per row. Same rules as one contact: one mobile / card belongs to one person.
function importMembers(rows) {
  let added = 0;
  let updated = 0;
  let noNumber = 0;
  const skipped = [];
  const ix = core.memberIndex();
  const conflictOf = (merged, existing) => {
    const seen = new Set();
    for (const x of core.contactPhones(merged)) {
      if (seen.has(x.key)) return `${x.key} is entered twice on this contact.`;
      seen.add(x.key);
      const owner = ix.phone.get(x.key)?.member;
      if (owner && owner !== existing) return `${x.key} already belongs to ${owner.businessName || owner.ownerName} (${owner.id}).`;
    }
    seen.clear();
    for (const x of core.contactCards(merged)) {
      if (seen.has(x.key)) return `Card ${x.shown} is entered twice on this contact.`;
      seen.add(x.key);
      const owner = ix.card.get(x.key)?.member;
      if (owner && owner !== existing) return `Card ${x.shown} already belongs to ${owner.businessName || owner.ownerName} (${owner.id}).`;
    }
    return null;
  };
  for (const r of rows) {
    const key = phoneKey(r.phone);
    if (key.length !== 10 && !core.cardKey(r.cardNo)) {
      noNumber++;
      continue;
    }
    const byPhone = ix.phone.get(key);
    const existing =
      (r.vtigerId && ix.vtiger.get(r.vtigerId)) ||
      (core.cardKey(r.cardNo) && ix.card.get(core.cardKey(r.cardNo))?.via === 'card' && ix.card.get(core.cardKey(r.cardNo)).member) ||
      (byPhone?.via === 'owner' && phoneKey(byPhone.member.phone) === key && byPhone.member) ||
      null;
    // two different Vtiger contacts with the same mobile / card are not merged into one: the second is listed as skipped
    if (r.vtigerId && existing?.vtigerId && existing.vtigerId !== r.vtigerId) {
      skipped.push({ row: r.businessName || r.ownerName || r.phone, reason: `Same mobile or card as Vtiger contact ${existing.vtigerId} (${existing.id}), already imported; duplicates in Vtiger are not merged.` });
      continue;
    }
    const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
    const merged = existing ? { ...existing, ...clean } : clean;
    const conflict = conflictOf(merged, existing);
    if (conflict) {
      skipped.push({ row: r.businessName || r.ownerName || r.phone, reason: conflict });
      continue;
    }
    if (existing) {
      Object.assign(existing, clean, { id: existing.id });
      core.reindexMember(existing);
      updated++;
    } else {
      db().members.push({ id: store.nextId('member', 'M-', 5), createdAt: now(), status: 'Active', addOnCards: [], ...clean });
      const m = db().members[db().members.length - 1]; // the tracked copy, so a later row of this batch updating it is saved
      store.unwatch(m); // lakhs of new contacts: no 10-minute safety copy of each (it filled the memory)
      core.reindexMember(m);
      added++;
    }
  }
  save();
  return { added, updated, noNumber, skipped: skipped.length, skippedRows: skipped.slice(0, 50), total: db().members.length };
}
api.post('/members/import', (req, res) => res.json(importMembers(Array.isArray(req.body) ? req.body : [])));

// ----- Vtiger contacts import (server job; the access key stays in the private secrets file) -----
const vtigerJob = {
  // a job cut off by a restart shows as stopped, so it can be continued
  getState: () => {
    const s = db().settings.vtigerImport || null;
    return s && s.status === 'running' && !vtiger.isRunning() ? { ...s, status: 'stopped' } : s;
  },
  setState: (s) => {
    db().settings.vtigerImport = s;
    save();
  },
  importMembers,
  stores: () => db().stores,
};
api.get('/vtiger', (req, res) => res.json({ configured: vtiger.configured(), running: vtiger.isRunning(), job: vtigerJob.getState() }));
api.post('/vtiger/import', async (req, res) => res.json({ job: await vtiger.start(vtigerJob, agentOf(req), { fresh: Boolean(req.body?.fresh) }) }));
api.post('/vtiger/import/stop', (req, res) => {
  vtiger.stop();
  res.json({ ok: true });
});

api.get('/members/:id', (req, res) => {
  const m = db().members.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Contact not found' });
  res.json(m);
});

api.patch('/members/:id', (req, res) => {
  const m = db().members.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  checkAddOns(req.body);
  checkUniquePhones({ ...m, ...req.body }, m.id);
  Object.assign(m, req.body, { id: m.id });
  save();
  res.json(m);
});

// ----- missed calls -----
api.get('/missed-calls', (req, res) => {
  let list = [...db().missedCalls].reverse();
  if (req.query.open) list = list.filter((m) => m.status === 'Open');
  // who called: registered member's business / name, for the top-bar list
  res.json(
    list.map((m) => {
      const hit = core.findMemberByPhone(m.phone);
      return { ...m, member: hit ? { id: hit.member.id, businessName: hit.member.businessName, name: hit.via === 'add-on' ? hit.addOn.name : hit.member.ownerName } : null };
    })
  );
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

// Customer survey results (SOP: collect feedback to improve our service)
api.get('/leads/survey-summary', (req, res) => {
  const done = db().leads.filter((l) => l.survey);
  res.json({
    count: done.length,
    comments: done.filter((l) => l.survey.comments).slice(-20).reverse().map((l) => ({ id: l.id, name: l.businessName || l.name, store: l.store, at: l.survey.at, text: l.survey.comments })),
  });
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
    // follow-up call: missing info received → back to Pending; update given → on the timeline
    if (c && l.type === 'Follow-up' && outcome === 'Info received' && c.status === 'Waiting') applyStatus(c, 'Pending', by, `Customer gave the missing details on a follow-up call${note ? ': ' + note : ''}`);
    else if (c && l.type === 'Follow-up' && outcome === 'Update given') log(c, { by, type: 'call', text: `Follow-up call: update given to the customer${note ? ' — ' + note : ''}` });
    if (outcome === 'Survey completed') {
      const sv = req.body.survey || {};
      // SOP: the survey collects the customer's feedback (no rating questions)
      l.survey = { comments: String(sv.comments || '').trim().slice(0, 2000), by, at: now() };
      if (c) log(c, { by, type: 'call', text: `Customer survey: ${l.survey.comments ? `“${l.survey.comments}”` : 'no feedback given'}` });
    }
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
    await auto.tick({ forceMail: true });
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

// ----- Mailbox screen (like the VMM CRM): list, conversation, log case, reply in thread, read, attachments -----
const needMail = () => {
  if (!mail.configured()) throw core.fail('Mailbox not connected: Automation → Sign in with Microsoft', 503);
};
// "Being handled by …": an email opened by an agent is locked for 15 minutes so two agents don't answer it
const claims = new Map();
const claimOf = (id) => {
  const c = claims.get(id);
  if (c && Date.now() - c.at > 15 * 60000) claims.delete(id);
  return claims.get(id) || null;
};

api.get(
  '/mail/messages',
  wrap(async (req, res) => {
    needMail();
    const list = await mail.listFolder(req.query.folder === 'sent' ? 'sent' : 'inbox', { q: String(req.query.q || '').slice(0, 100) });
    res.json(
      list.map((m) => {
        const c = core.caseForMessage(m) || core.threadTarget(m);
        const claim = claimOf(m.id);
        return { ...m, caseId: c?.id || null, caseStatus: c?.status || null, claimedBy: claim?.agent || null };
      })
    );
  })
);

api.get(
  '/mail/thread/:conversationId',
  wrap(async (req, res) => {
    needMail();
    res.json(await mail.getThread(req.params.conversationId));
  })
);

api.post(
  '/mail/messages/:id/read',
  wrap(async (req, res) => {
    needMail();
    await mail.markRead(req.params.id, req.body.isRead !== false);
    res.json({ ok: true });
  })
);

api.post('/mail/messages/:id/claim', (req, res) => {
  const c = claimOf(req.params.id);
  if (c && c.agent !== agentOf(req)) return res.status(409).json({ error: `Being handled by ${c.agent}`, claimedBy: c.agent });
  claims.set(req.params.id, { agent: agentOf(req), at: Date.now() });
  res.json({ claimedBy: agentOf(req) });
});
api.delete('/mail/messages/:id/claim', (req, res) => {
  if (claimOf(req.params.id)?.agent === agentOf(req)) claims.delete(req.params.id);
  res.json({ ok: true });
});

// Log a case from this email (or return the case it already belongs to). The agent who logs it owns it.
api.post(
  '/mail/messages/:id/log',
  wrap(async (req, res) => {
    needMail();
    const m = await mail.getMessage(req.params.id);
    const already = core.caseForMessage(m);
    if (already) return res.json({ case: already, existing: true });
    const r = await auto.importMessage(m, agentOf(req));
    if (!r.threaded) {
      r.case.assignedTo = agentOf(req);
      log(r.case, { by: agentOf(req), type: 'edit', text: `Logged from the mailbox by ${agentOf(req)}` });
    }
    await mail.markRead(m.id, true).catch(() => {});
    save();
    res.status(201).json({ case: r.case, threaded: r.threaded });
  })
);

// Reply inside this email's thread; goes on the case timeline too.
api.post(
  '/mail/messages/:id/reply',
  wrap(async (req, res) => {
    needMail();
    const text = String(req.body.body || '').trim();
    if (!text) throw core.fail('Write the reply first');
    const m = await mail.getMessage(req.params.id);
    const c = (req.body.caseId && findCase(req.body.caseId)) || core.caseForMessage(m) || core.threadTarget(m);
    const to = req.body.to || m.fromEmail;
    let subject = /^re:/i.test(m.subject) ? m.subject : `RE: ${m.subject}`;
    if (c && !subject.includes(c.id)) subject += ` [${c.id}]`;
    const out = await auto.sendEmail({ to, cc: req.body.cc || '', subject, body: text, caseId: c?.id, kind: 'Agent reply', by: agentOf(req), replyToId: m.id });
    if (out.status !== 'sent') throw core.fail(`Email ${out.status}: ${out.error}`, 502);
    await mail.markRead(m.id, true).catch(() => {});
    claims.delete(m.id);
    res.json({ ok: true, caseId: c?.id || null, inThread: Boolean(out.inThread), test: out.test || null });
  })
);

api.get(
  '/mail/messages/:id/attachments',
  wrap(async (req, res) => {
    needMail();
    res.json(await mail.listAttachments(req.params.id));
  })
);
api.get(
  '/mail/messages/:id/attachments/:attId',
  wrap(async (req, res) => {
    needMail();
    const a = await mail.getAttachment(req.params.id, req.params.attId);
    res.setHeader('Content-Type', a.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${a.name.replace(/[^\w.\- ]+/g, '_')}"`);
    res.send(a.bytes);
  })
);

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
const workflowTat = (c) => workflowFor(c)?.tatDays || 1;
// SOP: call the store daily for every pending case; cases escalated today don't need one yet
function needsFollowupToday(c) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const s = start.toISOString();
  if (c.escalatedAt >= s) return false;
  const last = c.lastFollowupAt || lastFollowup(c.timeline);
  return !last || last < s;
}

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
    notFollowedUpToday: escalated.filter((c) => needsFollowupToday(c)).length,
    promisesMissed: escalated.filter((c) => c.promisedAt && c.promisedAt < new Date().toLocaleDateString('en-CA')).length,
    storeRepliesToReview: escalated.filter((c) => c.storeReplyReview).length,
    escalatedByStore: count(escalated, 'store'),
    missedOpen: db().missedCalls.filter((m) => m.status === 'Open').length,
    missedBreached: db().missedCalls.filter((m) => m.status === 'Open' && m.dueAt < t).length,
    leadsDue: db().leads.filter((l) => l.status === 'New' || (l.status === 'Call back' && (!l.callbackAt || l.callbackAt <= t))).length,
    topCategories: Object.entries(count(open.filter((c) => c.category), 'category'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
    supportTokens: support.listTickets().filter((x) => x.status !== 'Closed').length,
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
    aicheck: n(by((c) => c.channel === 'Email' && isToday(c.createdAt) && ['Issues or Complaint', 'Issues and Complaint (NR)', 'Request'].includes(c.caseType)), 'checked today'),
    aiwait: n(by((c) => c.status === 'Waiting' && c.infoRequests), 'waiting for customer info'),
    ob: n(d.leads.filter(leadOpen).length, 'leads to call'),
    obpitch: n(d.calls.filter((r) => r.direction === 'outbound' && isToday(r.startedAt)).length, 'outbound calls today'),
    oms: n(d.leads.filter((l) => l.status === 'Order placed').length, 'orders on call'),
    identify: n(d.members.length, 'registered members'),
    custtype: n(d.stores.length, 'stores'),
    casetype: n(open.filter((c) => !c.caseType).length, 'open, not categorised', open.some((c) => !c.caseType)),
    enq: n(open.filter((c) => c.caseType === 'Inquiry').length, 'open'),
    comp: n(open.filter((c) => c.caseType.startsWith('Issues')).length, 'open'),
    req: n(open.filter((c) => c.caseType === 'Request').length, 'open'),
    kb: n(by((c) => c.caseType === 'Inquiry' && c.resolutionType === 'ROT' && isToday(c.closedAt)), 'answered today'),
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
  res.status(err.status || 500).json({ error: err.message || 'Server error', ...(err.data || {}) });
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
  setTimeout(() => core.memberIndex(), 2000); // the contact index is ready before the first caller is searched
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
