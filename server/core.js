// Case rules from the SOP, shared by the API and the automation engine.
import * as store from './db.js';
import * as sparktg from './sparktg.js';
import { extractRefs } from '../src/requirements.js';
import { normalizeCallerType } from '../src/taxonomy.js';
import { TEAMS, escalationBlocker, escalationTarget, workflowFor } from '../src/workflows.js';

export const db = () => store.get();
export const save = () => store.save();
export const now = () => new Date().toISOString();

export const MISSED_CALL_TAT_MIN = 30;
export const ESCALATION_L1_WORKING_DAYS = 1;

// Strictly the arrows of the LOTS workflow chart (src/pages/LotsFlow.jsx):
// Pending → Closed (ROT) / Waiting / Escalated · Waiting → Pending · Escalated → Resolution → confirmation → Closed.
// Two moves the chart does not draw are kept on purpose: Reopen (Closed → Pending) and Not satisfied (Resolved → Escalated).
export const TRANSITIONS = {
  Pending: ['Waiting', 'Escalated', 'Closed'],
  Waiting: ['Pending'], // customer provides details → back to the case
  Escalated: ['Resolved'], // only the store's reply moves it on
  Resolved: ['Closed', 'Escalated'], // confirmation call: confirmed → Closed · not satisfied → back to the store
  Closed: ['Pending'],
};

// ---------- events (the automation engine subscribes) ----------
const listeners = {};
export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
}
export function emit(event, payload) {
  for (const fn of listeners[event] || []) {
    try {
      fn(payload);
    } catch (e) {
      console.error(`[${event}]`, e);
    }
  }
}

/** Holidays from Stores & settings (YYYY-MM-DD); they don't count as working days. */
export const holidays = () => new Set(db().settings?.holidays || []);
export const isWorkingDay = (d, hol = holidays()) => d.getDay() !== 0 && !hol.has(d.toLocaleDateString('en-CA'));

export function addWorkingDays(from, days) {
  const d = new Date(from);
  const hol = holidays();
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, hol)) left--; // Sundays and holidays are not counted
  }
  return d.toISOString();
}

/** Working days between two dates (for reports), to one decimal. */
export function workingDaysBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  if (end <= start) return 0;
  const hol = holidays();
  let days = 0;
  const d = new Date(start);
  while (true) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    if (next > end) {
      if (isWorkingDay(d, hol)) days += (end - d) / 864e5;
      break;
    }
    if (isWorkingDay(d, hol)) days += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.round(days * 10) / 10;
}

// SparkTG sends numbers as 91XXXXXXXXXX / 0XXXXXXXXXX / +91 …; compare on the last 10 digits.
export const phoneKey = (v) => String(v || '').replace(/\D/g, '').slice(-10);

export function findCase(id) {
  return db().cases.find((c) => c.id === id);
}

export function findMemberByPhone(phone) {
  const key = phoneKey(phone);
  if (key.length !== 10) return null;
  for (const m of db().members) {
    if (phoneKey(m.phone) === key || phoneKey(m.altPhone) === key || (m.otherPhones || []).some((p) => phoneKey(p) === key)) return { member: m, via: 'owner' };
    const addOn = (m.addOnCards || []).find((a) => phoneKey(a.phone) === key);
    if (addOn) return { member: m, via: 'add-on', addOn };
  }
  return null;
}

// Every mobile on a contact (registered, alternate, extra, add-on members') must belong to that contact only,
// so a call or email from it always identifies exactly one customer.
export function contactPhones(m) {
  const list = [
    ['Registered mobile', m.phone],
    ['Alternate mobile', m.altPhone],
    ...(m.otherPhones || []).map((p) => ['Phone', p]),
    ...(m.addOnCards || []).map((a) => [`Add-on member ${a.name || ''}`.trim(), a.phone]),
  ];
  return list.map(([label, p]) => ({ label, key: phoneKey(p) })).filter((x) => x.key.length === 10);
}

/** First number of `record` already used — by another contact, or twice on this one. null = all unique. */
export function phoneConflict(record, excludeId) {
  const mine = contactPhones(record);
  const seen = new Map();
  for (const x of mine) {
    if (seen.has(x.key)) return { phone: x.key, label: x.label, message: `${x.key} is entered twice on this contact (${seen.get(x.key)} and ${x.label}).` };
    seen.set(x.key, x.label);
  }
  for (const m of db().members) {
    if (m.id === excludeId) continue;
    const hit = contactPhones(m).find((o) => seen.has(o.key));
    if (hit) {
      return {
        phone: hit.key,
        label: seen.get(hit.key),
        memberId: m.id,
        message: `${hit.key} is already registered to ${m.businessName || m.ownerName} (${m.id})${hit.label === 'Registered mobile' ? '' : ' as ' + hit.label.charAt(0).toLowerCase() + hit.label.slice(1)}. One number can belong to one contact only.`,
      };
    }
  }
  return null;
}

export function findMemberByEmail(email) {
  const e = String(email || '').toLowerCase();
  return (e && db().members.find((m) => (m.email && m.email.toLowerCase() === e) || (m.otherEmails || []).some((x) => String(x).toLowerCase() === e))) || null;
}

export function log(c, entry) {
  c.timeline.push({ at: now(), ...entry });
  c.updatedAt = now();
}

export function newCase(body, by) {
  const c = {
    id: store.nextId('case', 'LWS-'),
    createdAt: now(),
    updatedAt: now(),
    channel: body.channel || 'Inbound call',
    callerType: normalizeCallerType(body.callerType) || 'Registered With Lots',
    memberId: body.memberId || null,
    name: body.name || '',
    phone: body.phone || '',
    email: body.email || '',
    businessName: body.businessName || '',
    cardNo: body.cardNo || '',
    store: body.store || '',
    caseType: body.caseType || '',
    category: body.category || '',
    subCategory: body.subCategory || '',
    requestFor: body.requestFor || '', // case master: request_for
    sub2: body.sub2 || '', // case master: sub2
    closureType: body.closureType || '', // case master: resolution_type
    productCategory: body.productCategory || '',
    productType: body.productType || '', // case master: product_type
    orderRef: body.orderRef || '',
    purchaseDate: body.purchaseDate || '', // return / exchange: SOP allows 7 working days
    subject: body.subject || '',
    description: body.description || '',
    status: 'Pending',
    resolutionType: null,
    escalatedAt: null,
    escalationLevel: 0,
    dueAt: null,
    statusAt: now(),
    assignedTo: body.assignedTo ?? by ?? '',
    createdBy: by || 'System',
    source: body.source || {},
    calls: [],
    attachments: [],
    timeline: [],
  };
  log(c, { by: c.createdBy, type: 'created', text: `Case created via ${c.channel}` });
  return c;
}

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** Teams with their saved contact details (Stores & settings → Teams). */
export function teams() {
  const saved = db().teams || {};
  return Object.fromEntries(Object.entries(TEAMS).map(([k, t]) => [k, { ...t, ...(saved[k] || {}) }]));
}

/** A store or team as an escalation target: { kind, code, name, email, phone, contact }. */
export function targetByKey({ kind, code } = {}) {
  if (kind === 'team') {
    const t = teams()[code];
    if (!t) throw fail('Unknown team');
    return { kind: 'team', code, name: t.name, email: t.email || '', phone: t.phone || '', contact: t.contact || '' };
  }
  const s = db().stores.find((x) => x.code === code);
  return { kind: 'store', code: code || '', name: s ? `${s.code} ${s.name}` : 'Store (not set)', email: s?.spocEmail || '', phone: s?.spocPhone || '', contact: s?.spocName || '' };
}

/** Where this case escalates to: the agent's choice if they picked one, else the case type's workflow. */
export function targetFor(c) {
  if (c.escalateTo?.kind) return targetByKey(c.escalateTo);
  return escalationTarget(c, db().stores, teams(), db().members);
}

/**
 * Escalation matrix (Stores & settings): the contacts above Level 1 for a store or team,
 * else the default levels, else the Level 2 email on the Automation page. Index 0 = Level 2.
 */
export function escalationLevels(target) {
  const m = db().settings?.escalationMatrix || {};
  const usable = (list) => (list || []).filter((l) => l?.email);
  const own = target?.kind ? usable(m[`${target.kind}:${target.code}`]) : [];
  if (own.length) return own;
  const def = usable(m['*']);
  if (def.length) return def;
  const l2 = db().settings?.automation?.l2Email;
  return l2 ? [{ name: 'Level 2', email: l2, tatDays: 1 }] : [];
}

/** Move an escalated case to another store or team (wrong team picked, or the store passed it on). */
export function rerouteEscalation(c, target, by, note) {
  if (c.status !== 'Escalated') throw fail('Only an escalated case can be re-assigned');
  const t = targetByKey(target);
  if (t.kind === 'store' && !t.code) throw fail('Pick the store');
  const was = c.escalatedTo || { kind: 'store', code: c.store };
  if (was.kind === t.kind && was.code === t.code) throw fail(`The case is already with ${t.name}`);
  const wf = workflowFor(c);
  c.escalatedTo = { kind: t.kind, code: t.code, name: t.name, email: t.email, contact: t.contact };
  c.escalatedAt = now();
  c.escalationLevel = 1;
  c.dueAt = addWorkingDays(c.escalatedAt, wf?.tatDays || ESCALATION_L1_WORKING_DAYS);
  c.firstDueAt = c.dueAt;
  c.promisedAt = null;
  c.storeReplyReview = null;
  log(c, { by, type: 'escalation', text: `Re-assigned from ${was.name || was.code} to ${t.name}${note ? ' — ' + note : ''}` });
  emit('escalation:rerouted', { c, by, note });
}

// ---------- reading a store's email reply ----------
// A reply that only says "we are checking" must not close the loop with the customer.
const INTERIM = /\b(will (check|update|revert|look|share|confirm|get back|arrange|process|inform|resolve|do)|checking|looking into|under (process|review|verification|observation)|in process|being processed|working on|we are (checking|verifying|looking|coordinating)|shortly|at the earliest|kindly allow|need (some )?(more )?time|pending (from|with|at)|awaiting|forwarded (to|the)|escalated (it )?to|following up|dekh (rahe|lenge|ke)|check kar|process (ho|chal) raha|update (de|kar) denge|kar denge|ho jayega)\b/i;
const RESOLVED = /\b(resolved|has been (done|completed|resolved|processed|delivered|replaced|refunded|credited|issued|updated|exchanged|closed|fixed|sorted|cancelled|blocked|re-?issued|arranged|shared)|refund (has been |is )?(processed|initiated|credited|done|completed)|credit note (has been |is )?(issued|shared|generated|given)|replacement (done|given|delivered|sent|arranged)|(item|order|product|goods|material) (has been |is |was )?(delivered|replaced|exchanged|picked up|collected)|issue (is |has been )?(fixed|sorted|closed|resolved)|done from our (end|side)|card (has been |is )?(issued|blocked|re-?issued|activated|updated)|ho gaya|kar diya|de diya)\b/i;

/** First part of an email reply, without the quoted history. */
export const replyText = (body) => String(body || '').split(/\n-{2,}|\nFrom:|\nOn .+ wrote:|\n>/)[0].trim();

/** 'resolved' only when the reply reads like a resolution and not like "we'll check"; otherwise 'update'. */
export function classifyStoreReply(body) {
  const t = replyText(body);
  if (RESOLVED.test(t) && !INTERIM.test(t)) return 'resolved';
  return 'update';
}

/** A date the store promised in a reply or on a call ("by tomorrow", "within 2 days", "by 18/10"), as YYYY-MM-DD. */
export function promisedDate(body, from = new Date()) {
  const t = replyText(body).toLowerCase();
  const day = (d) => d.toLocaleDateString('en-CA');
  const base = new Date(from);
  if (/\b(today|aaj|by eod|end of (the )?day)\b/.test(t)) return day(base);
  if (/\b(tomorrow|kal tak|kal)\b/.test(t)) {
    base.setDate(base.getDate() + 1);
    return day(base);
  }
  let m = t.match(/within (\d{1,2}) (working |business )?days?/);
  if (m) return day(new Date(addWorkingDays(from, Number(m[1]))));
  m = t.match(/\b(?:by|on|before|till|until)\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (m) {
    const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    const days = (d - new Date(day(base))) / 864e5;
    if (!isNaN(d) && days >= 0 && days <= 60) return day(d);
  }
  return null;
}

// Throws when a case cannot move to `to`; never changes the case.
export function validateStatus(c, to) {
  if (!TRANSITIONS[c.status]?.includes(to)) throw fail(`Cannot move a case from ${c.status} to ${to}`);
  if (to === 'Escalated') {
    const blocker = c.escalateTo?.kind ? null : escalationBlocker(c); // the agent picked where it goes
    if (blocker) throw fail(blocker);
    const t = targetFor(c);
    if (t.kind === 'store' && !t.code) throw fail('Select the store before escalating');
  }
  if (to === 'Closed' && (!c.caseType || !c.category)) throw fail('Categorise the case (type + category) before closing');
}

export function applyStatus(c, to, by, note) {
  const from = c.status;
  if (from === to) return;
  validateStatus(c, to);
  if (to === 'Escalated') {
    const wf = workflowFor(c);
    const t = targetFor(c);
    c.escalatedAt = now();
    c.escalationLevel = 1;
    c.dueAt = addWorkingDays(c.escalatedAt, wf?.tatDays || ESCALATION_L1_WORKING_DAYS); // TAT of the case type's workflow
    c.resolutionType = 'Store';
    c.workflowKey = wf?.key || null;
    c.escalatedTo = { kind: t.kind, code: t.code, name: t.name, email: t.email, contact: t.contact };
    c.firstDueAt = c.dueAt; // for the on-time report (dueAt moves with each level)
    c.promisedAt = null;
    c.storeReplyReview = null;
    delete c.escalateTo;
  }
  if (to === 'Resolved') c.storeReplyReview = null;
  if (to === 'Closed') {
    if (from === 'Pending' || from === 'Waiting') c.resolutionType = 'ROT';
    c.closedAt = now();
  }
  if (to === 'Pending' && from === 'Closed') c.closedAt = null;
  c.status = to;
  c.statusAt = now();
  c.reminded = {}; // reminders are per status visit
  log(c, { by, type: 'status', from, to, text: note || '' });
  emit('status', { c, from, to, by, note });
}

// Push a new case and link whatever produced it (missed call, lead, SparkTG call).
export function createCase(body, by, { status, statusNote, note, callTxnId } = {}) {
  const c = newCase(body, by);
  if (note) log(c, { by, type: 'note', text: note });
  db().cases.push(c);

  if (c.source.missedCallId) {
    const m = db().missedCalls.find((x) => x.id === c.source.missedCallId);
    if (m) Object.assign(m, { status: 'Called back', calledBackAt: now(), calledBackBy: by, caseId: c.id });
  }
  if (c.source.leadId) {
    const l = db().leads.find((x) => x.id === c.source.leadId);
    if (l) {
      l.status = 'Concern raised';
      l.log.push({ at: now(), by, outcome: 'Concern raised', note: `Case ${c.id} created` });
    }
  }
  emit('case:created', { c, by, callTxnId }); // calls.js links the SparkTG call
  let warning;
  try {
    if (status && status !== 'Pending') applyStatus(c, status, by, statusNote);
  } catch (e) {
    warning = e.message; // case is still saved as Pending
  }
  save();
  return { c, warning };
}

export function createMissedCall({ phone, at, reason, txnId }) {
  at = at && !isNaN(new Date(at)) ? new Date(at).toISOString() : now();
  const m = {
    id: store.nextId('missed', 'MC-', 5),
    phone: String(phone || ''),
    at,
    reason: reason || 'Agent busy on another call',
    dueAt: new Date(new Date(at).getTime() + MISSED_CALL_TAT_MIN * 60000).toISOString(),
    status: 'Open',
    attempts: [],
    caseId: null,
    txnId: txnId || null,
    assignedTo: '',
  };
  db().missedCalls.push(m);
  emit('missed:created', { m });
  save();
  return m;
}

// Attach a SparkTG call (by transaction id) to a case: duration, disposition, recording.
export async function linkCall(c, txnId, by) {
  txnId = String(txnId).trim();
  c.calls ||= [];
  let entry = c.calls.find((x) => x.txnId === txnId);
  if (!entry) {
    entry = { txnId, linkedAt: now(), linkedBy: by, status: 'fetching' };
    c.calls.push(entry);
    save();
  }
  try {
    const raw = await sparktg.pollWithRetry(txnId);
    if (!raw) Object.assign(entry, { status: 'not found', error: 'SparkTG has no record for this call yet — try Refresh in a minute' });
    else attachCallInfo(c, txnId, sparktg.normalizeCall(raw), raw, 'SparkTG');
  } catch (e) {
    Object.assign(entry, { status: 'error', error: e.message });
  }
  save();
  return entry;
}

// Put a SparkTG call's details on a case (once) and note it on the timeline.
export function attachCallInfo(c, txnId, info, raw, by) {
  c.calls ||= [];
  let entry = c.calls.find((x) => x.txnId === txnId);
  if (!entry) {
    entry = { txnId, linkedAt: now(), linkedBy: by };
    c.calls.push(entry);
  }
  if (!info) {
    Object.assign(entry, { status: 'ended', error: 'SparkTG not connected — no call details' });
    return;
  }
  const first = entry.status !== 'found';
  Object.assign(entry, { status: 'found', info, raw, error: null, fetchedAt: now() });
  if (first) {
    const bits = [info.direction, info.disposition, info.durationSec != null && `${info.durationSec}s`, info.agent && `agent ${info.agent}`].filter(Boolean);
    log(c, { by: 'SparkTG', type: 'call', text: `Call ${txnId} linked${bits.length ? ' · ' + bits.join(' · ') : ''}` });
  }
}

// Store staff write from the store SPOC address or any @cpwi.in address.
export function storeForSender(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  const spoc = db().stores.find((s) => s.spocEmail && s.spocEmail.toLowerCase().split(/[,;\s]+/).includes(e));
  if (spoc) return spoc;
  // team contacts and escalation-matrix contacts reply for their cases too
  const listed = (v) => String(v || '').toLowerCase().split(/[,;\s]+/).includes(e);
  const team = Object.entries(teams()).find(([, t]) => listed(t.email));
  if (team) return { code: null, team: team[0] };
  const matrix = Object.values(db().settings?.escalationMatrix || {}).flat();
  if (matrix.some((l) => listed(l?.email))) return { code: null, internal: true };
  return e.endsWith('@cpwi.in') ? { code: null, internal: true } : null;
}

/**
 * One incoming email → a new Pending case, or threaded onto an existing case when the subject carries its number.
 * Used by the manual "Log email" form and by the Microsoft 365 mailbox poller.
 */
/** The case a mailbox message already belongs to (imported before), if any. */
export function caseForMessage(m) {
  return db().cases.find((c) => (m.id && c.source?.graphIds?.includes(m.id)) || (m.messageId && (c.source?.messageId === m.messageId || c.source?.messageIds?.includes(m.messageId)))) || null;
}

/** Case a mail continues: case number in the subject, or the same email conversation (as in VMM). */
export function threadTarget({ subject = '', conversationId }) {
  const ref = subject.match(/LWS-\d{6}/i);
  return (ref && findCase(ref[0].toUpperCase())) || (conversationId && db().cases.find((c) => c.source?.conversationIds?.includes(conversationId))) || null;
}

export function intakeEmail({ fromEmail = '', fromName = '', subject = '', body = '', receivedAt, attachments = [], messageId, hasAttachments, graphId, conversationId }, by = 'System') {
  const withFiles = Boolean(hasAttachments || attachments.length);
  const remember = (c) => {
    c.source ||= {};
    if (graphId) c.source.graphIds = [...new Set([...(c.source.graphIds || []), graphId])];
    if (messageId) c.source.messageIds = [...new Set([...(c.source.messageIds || []), messageId])];
    if (conversationId) c.source.conversationIds = [...new Set([...(c.source.conversationIds || []), conversationId])];
    // replies to the customer go into their latest mail's thread
    if (graphId && fromEmail && (!c.email || fromEmail.toLowerCase() === String(c.email).toLowerCase())) c.source.lastInboundGraphId = graphId;
  };
  const existing = threadTarget({ subject, conversationId });
  if (existing) {
    remember(existing);
    log(existing, { by, type: 'email-in', text: body, from: fromEmail, subject });
    existing.attachments = [...(existing.attachments || []), ...attachments];
    const staff = storeForSender(fromEmail);
    emit('email:threaded', { c: existing, fromEmail, staff, body, hasAttachments: withFiles });
    if (!staff && existing.status === 'Waiting') applyStatus(existing, 'Pending', by, 'Customer replied by email');
    save();
    return { threaded: true, case: existing };
  }

  // Customer phone in the mail body lets us find the member even when they write from a new address.
  const phoneInBody = (body.match(/(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})/) || [])[1]?.replace(/\D/g, '') || '';
  const refs = extractRefs(`${subject}\n${body}`);
  const member =
    findMemberByEmail(fromEmail) ||
    findMemberByPhone(phoneInBody)?.member ||
    (refs.cardNo && db().members.find((m) => m.cardNo && m.cardNo.toLowerCase() === refs.cardNo.toLowerCase())) ||
    null;
  const c = newCase(
    {
      channel: 'Email',
      name: fromName || member?.ownerName || '',
      email: fromEmail,
      phone: member?.phone || phoneInBody,
      businessName: member?.businessName || '',
      cardNo: member?.cardNo || refs.cardNo,
      memberId: member?.id || null,
      callerType: member ? 'Registered With Lots' : 'Not Registered',
      store: '', // the store must come from the mail itself; the member's home store is only a hint
      orderRef: refs.orderRef,
      subject,
      description: body,
      assignedTo: '',
      source: { emailFrom: fromEmail, receivedAt: receivedAt || now(), messageId, hasAttachments: withFiles, homeStore: member?.homeStore || '' },
    },
    'System'
  );
  c.attachments = attachments;
  remember(c);
  log(c, { by, type: 'email-in', text: body, from: fromEmail, subject });
  db().cases.push(c);
  emit('case:created', { c, by });
  save();
  return { threaded: false, case: c };
}
