// Call log fed by the SparkTG dialer widget (show_dialer / hide_dialer), enriched from the SparkTG API after the call.
import * as core from './core.js';
import * as sparktg from './sparktg.js';

const { db, save, now, phoneKey } = core;

core.on('case:created', ({ c, by, callTxnId }) => {
  if (!callTxnId) return;
  if (linkCaseToCall(c, callTxnId)) return;
  if (sparktg.configured()) core.linkCall(c, callTxnId, by); // typed-in id with no widget record: poll SparkTG
  else c.calls.push({ txnId: String(callTxnId).trim(), linkedAt: now(), linkedBy: by, status: 'not linked', error: 'SparkTG is not configured yet — use Refresh once it is' });
});

// SparkTG dispositions that mean nobody spoke. Confirmed on real records (2026-09-30): answered = "ANSWER", unanswered = "NOANSWER".
// Note: SparkTG "duration" includes ringing time, so an unanswered call can show 20-45 s.
const NOT_CONNECTED = /miss|abandon|no.?answer|unanswer|not.?answer|noans|busy|fail|cancel|reject|unreach/i;

export function isConnected(r) {
  if (!r.info) return null; // not known yet
  if (NOT_CONNECTED.test(String(r.info.disposition || ''))) return false;
  if (r.info.durationSec != null && Number(r.info.durationSec) === 0) return false;
  return true;
}

const fmtDur = (s) => (s == null ? '' : `${Math.floor(Number(s) / 60)}m ${Math.round(Number(s) % 60)}s`);

/** One widget event. `status` is 'started' (show_dialer) or 'ended' (hide_dialer). */
export function callEvent(body, agent) {
  const id = String(body.callId || '').trim();
  if (!id) throw core.fail('callId is required');
  const calls = db().calls;
  let r = calls.find((x) => x.id === id);
  if (!r) {
    const phone = phoneKey(body.phone) || body.phone || '';
    const match = core.findMemberByPhone(phone);
    r = {
      id,
      direction: body.direction || 'inbound',
      phone,
      calledTo: body.calledTo || '',
      callerName: body.name || '',
      memberId: match?.member.id || null,
      businessName: match?.member.businessName || '',
      agent,
      agentEmail: body.agentEmail || '',
      startedAt: now(),
      endedAt: null,
      status: 'live',
      widget: body.widget || null, // raw show_dialer data from the SparkTG widget
      caseId: null,
      missedCallId: null,
      leadId: null,
    };
    calls.push(r);
    autoLinkMissedCall(r);
  }
  const ctx = body.context || {};
  for (const k of ['caseId', 'missedCallId', 'leadId']) if (ctx[k] && !r[k]) r[k] = ctx[k];
  if (body.phone && !r.phone) r.phone = phoneKey(body.phone) || body.phone;

  if (body.status === 'ended' && !r.endedAt) {
    r.endedAt = now();
    r.status = 'ended';
    if (body.widget) r.widgetEnd = body.widget;
    enrich(r).catch((e) => console.error('[calls] enrich', e.message));
  }
  save();
  return r;
}

// Calling back a number that has an open missed call counts as the call-back, whichever screen it was dialled from.
function autoLinkMissedCall(r) {
  if (r.direction !== 'outbound' || r.missedCallId || !r.phone) return;
  const m = db().missedCalls.find((x) => x.status === 'Open' && phoneKey(x.phone) === phoneKey(r.phone));
  if (m) r.missedCallId = m.id;
}

async function enrich(r) {
  if (sparktg.configured()) {
    try {
      const raw = await sparktg.pollWithRetry(r.id, { tries: 6, delayMs: 3000 });
      if (raw) setRecord(r, raw);
      else r.status = 'no SparkTG record';
    } catch (e) {
      r.status = 'enrich failed';
      r.error = e.message;
    }
  } else r.status = 'ended';
  applyOutcome(r);
  save();
}

function setRecord(r, raw) {
  Object.assign(r, { raw, info: sparktg.normalizeCall(raw), status: 'enriched' });
  // The widget can't tell a call dialled on its own keypad from an incoming one; SparkTG's callType can.
  const dir = String(r.info.direction || '').toLowerCase();
  const real = dir.startsWith('in') ? 'inbound' : dir.startsWith('out') ? 'outbound' : null;
  if (real && real !== r.direction) {
    r.directionFromWidget = r.direction;
    r.direction = real;
    if (real === 'outbound') autoLinkMissedCall(r);
  }
}

// SparkTG does not always send hide_dialer (call ended) to the widget. Calls still "live" after a minute are
// looked up directly: once SparkTG has the finished record, the call is over and is processed like any other.
let sweeping = false;
export async function sweepLiveCalls() {
  if (sweeping || !sparktg.configured()) return;
  sweeping = true;
  try {
    const t = Date.now();
    for (const r of db().calls.filter((x) => x.status === 'live' && t - new Date(x.startedAt).getTime() > 60000)) {
      if (t - new Date(r.startedAt).getTime() > 6 * 3600000) {
        r.status = 'no SparkTG record';
        continue;
      }
      try {
        const raw = await sparktg.pollRecentCall(r.id);
        if (!raw) continue; // still going, or not finalised yet
        r.endedAt ||= now();
        r.endedBy = 'SparkTG lookup (no hide_dialer)';
        setRecord(r, raw);
        applyOutcome(r);
      } catch (e) {
        console.error('[calls] sweep', r.id, e.message);
      }
    }
  } finally {
    sweeping = false;
    save();
  }
}

// Once the call's outcome is known, update everything it belongs to.
export function applyOutcome(r) {
  const connected = isConnected(r);
  r.connected = connected;
  const agent = r.agent || 'SparkTG';
  const dur = fmtDur(r.info?.durationSec);

  // one call can raise several cases ("anything else?" → next concern)
  for (const id of r.caseIds || (r.caseId ? [r.caseId] : [])) {
    const c = core.findCase(id);
    if (c) core.attachCallInfo(c, r.id, r.info, r.raw, agent);
  }

  if (r.missedCallId) {
    const m = db().missedCalls.find((x) => x.id === r.missedCallId);
    if (m) {
      m.attempts.push({ at: now(), by: agent, outcome: connected === false ? `Not connected${r.info?.disposition ? ' (' + r.info.disposition + ')' : ''}` : `Connected ${dur}`.trim(), txnId: r.id });
      if (connected !== false && m.status === 'Open') Object.assign(m, { status: 'Called back', calledBackAt: now(), calledBackBy: agent });
    }
  }

  if (r.leadId) {
    const l = db().leads.find((x) => x.id === r.leadId);
    if (l) {
      l.log.push({ at: now(), by: agent, outcome: connected === false ? 'Not reachable (auto)' : 'Call connected', note: `SparkTG call ${r.id} ${dur}`.trim() });
      if (connected === false && ['New', 'Call back'].includes(l.status)) l.status = 'Not reachable';
    }
  }

  // Customer rang back by themselves → their open missed call is answered.
  if (r.direction === 'inbound' && connected) {
    for (const m of db().missedCalls.filter((x) => x.status === 'Open' && phoneKey(x.phone) === phoneKey(r.phone))) {
      Object.assign(m, { status: 'Customer called back', calledBackAt: now(), calledBackBy: agent });
      m.attempts.push({ at: now(), by: agent, outcome: 'Customer called again and was answered', txnId: r.id });
    }
  }

  // Inbound call nobody answered → missed-call list (30-min TAT, auto-assigned).
  if (r.direction === 'inbound' && connected === false && !r.caseId && r.phone && !db().missedCalls.some((m) => m.txnId === r.id)) {
    const m = core.createMissedCall({ phone: r.phone, at: r.startedAt, reason: `Missed on SparkTG${r.info?.disposition ? ': ' + r.info.disposition : ''}`, txnId: r.id });
    r.createdMissedCallId = m.id;
  }
}

/** Case created during/after a call: tie them together (details arrive when enrichment finishes). */
export function linkCaseToCall(c, txnId) {
  const r = db().calls.find((x) => x.id === String(txnId).trim());
  if (!r) return false;
  r.caseId ||= c.id;
  r.caseIds = [...new Set([...(r.caseIds || (r.caseId ? [r.caseId] : [])), c.id])];
  if (r.info) core.attachCallInfo(c, r.id, r.info, r.raw, r.agent || 'SparkTG');
  else c.calls.push({ txnId: r.id, linkedAt: now(), linkedBy: r.agent, status: r.endedAt ? 'fetching' : 'live call' });
  // a missed call raised from this call no longer needs a call-back
  if (r.createdMissedCallId) {
    const m = db().missedCalls.find((x) => x.id === r.createdMissedCallId);
    if (m?.status === 'Open') Object.assign(m, { status: 'Called back', caseId: c.id });
  }
  return true;
}

// Call logs: the whole history, or a date range (from / to, local dates), one day (date), a search (number, name, agent, case)
const dayOf = (r) => new Date(r.startedAt).toLocaleDateString('en-CA');
function inRange(list, { date, from, to } = {}) {
  if (date) return list.filter((r) => dayOf(r) === date);
  if (from) list = list.filter((r) => dayOf(r) >= from);
  if (to) list = list.filter((r) => dayOf(r) <= to);
  return list;
}
export function listCalls({ date, from, to, q, agent, direction, outcome, recording, offset = 0, limit = 200 } = {}) {
  let list = inRange(db().calls, { date, from, to });
  if (q) {
    const s = String(q).trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    list = list.filter((r) =>
      [r.phone, r.businessName, r.callerName, r.agent, r.id, r.caseId, ...(r.caseIds || [])].some((v) => v && (String(v).toLowerCase().includes(s) || (digits.length >= 4 && String(v).replace(/\D/g, '').includes(digits))))
    );
  }
  if (agent) list = list.filter((r) => r.agent === agent);
  if (direction) list = list.filter((r) => r.direction === direction);
  if (outcome === 'connected') list = list.filter((r) => r.connected === true);
  if (outcome === 'not-connected') list = list.filter((r) => r.connected === false);
  if (outcome === 'no-case') list = list.filter((r) => !r.caseId && r.connected !== false);
  if (recording === 'yes') list = list.filter((r) => r.info?.recordingUrl);
  const start = Math.max(0, Number(offset) || 0);
  const n = Math.min(500, Math.max(1, Number(limit) || 200));
  const page = [...list]
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))) // newest first
    .slice(start, start + n)
    .map(({ raw, ...r }) => r);
  return { calls: page, total: list.length, offset: start, more: start + n < list.length };
}

export function callStats(range = {}) {
  const list = inRange(db().calls, range);
  const talk = (arr) => {
    const d = arr.map((r) => Number(r.info?.durationSec)).filter((n) => Number.isFinite(n) && n > 0);
    return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : 0;
  };
  const block = (arr) => ({
    total: arr.length,
    inbound: arr.filter((r) => r.direction === 'inbound').length,
    outbound: arr.filter((r) => r.direction === 'outbound').length,
    connected: arr.filter((r) => r.connected === true).length,
    notConnected: arr.filter((r) => r.connected === false).length,
    withCase: arr.filter((r) => r.caseId).length,
    avgTalkSec: talk(arr.filter((r) => r.connected === true)), // ring time of unanswered calls excluded
  });
  const agents = [...new Set(list.map((r) => r.agent).filter(Boolean))];
  return { all: block(list), byAgent: Object.fromEntries(agents.map((a) => [a, block(list.filter((r) => r.agent === a))])) };
}
