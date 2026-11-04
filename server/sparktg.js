// SparkTG (telephonycloud.co.in) client. Credentials come from .env — see .env.example.

function cfg() {
  return {
    baseUrl: (process.env.SPARKTG_BASE_URL || 'https://telephonycloud.co.in').replace(/\/$/, ''),
    username: process.env.SPARKTG_USERNAME || '',
    password: process.env.SPARKTG_PASSWORD || '',
    // SparkTG shows the service id as a label ("1672 - server -id"); the API takes just the number.
    // A pasted label made every lookup return HTTP 400, so call outcomes (and missed calls) never arrived.
    svcId: String(process.env.SPARKTG_SVC_ID || '').trim().match(/\d+/)?.[0] || '',
  };
}

export function configured() {
  const c = cfg();
  return Boolean(c.username && c.password);
}

function authHeader() {
  const { username, password } = cfg();
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

async function get(pathname, params = {}) {
  if (!configured()) throw Object.assign(new Error('SparkTG is not configured — set SPARKTG_USERNAME and SPARKTG_PASSWORD in .env'), { status: 503 });
  const url = new URL(cfg().baseUrl + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: authHeader(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(`SparkTG ${pathname} returned HTTP ${res.status}`), { status: 502 });
  return res.json();
}

const asList = (raw) => (Array.isArray(raw) ? raw : raw?.data || raw?.records || []);
const txnOf = (r) => r?.xnid ?? r?.id ?? r?.callTxnId;

export async function recentCalls(txnId) {
  return asList(await get('/api/v1/agent-recent-calls', { recent_txn_id: txnId, 'svc-id': cfg().svcId }));
}

// Look up one call by its SparkTG transaction id. Returns null if the record isn't available yet —
// SparkTG can take a few seconds after the call ends to finalise it, so retry rather than treat null as "no such call".
export async function pollRecentCall(txnId) {
  const records = await recentCalls(txnId);
  return records.find((r) => String(txnOf(r)) === String(txnId)) || null;
}

export async function pollWithRetry(txnId, { tries = 5, delayMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await pollRecentCall(txnId);
    if (r) return r;
    if (i < tries - 1) await new Promise((ok) => setTimeout(ok, delayMs));
  }
  return null;
}

export async function fetchAgents() {
  const raw = await get('/api/v1/agents');
  return Array.isArray(raw) ? raw : asList(raw).length ? asList(raw) : [raw];
}

// SparkTG field names are not documented here, so we try the common spellings and keep the raw record.
// Check Settings → SparkTG → "Test connection" against a real call and adjust the lists if a field shows blank.
const pick = (r, keys) => {
  for (const k of keys) if (r?.[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
  return null;
};

export function normalizeCall(r) {
  if (!r) return null;
  return {
    txnId: txnOf(r) != null ? String(txnOf(r)) : null,
    phone: pick(r, ['cli', 'caller', 'caller_number', 'callerNumber', 'customer_number', 'customerNumber', 'from', 'src', 'phone', 'number', 'msisdn']),
    direction: pick(r, ['direction', 'call_direction', 'call_type', 'callType', 'type']),
    disposition: pick(r, ['disposition', 'call_status', 'callStatus', 'status', 'hangup_cause']),
    startedAt: pick(r, ['start_time', 'startTime', 'call_start', 'call_time', 'callTime', 'created_at', 'createdAt', 'time']),
    durationSec: pick(r, ['duration', 'billsec', 'talk_time', 'talkTime', 'call_duration', 'callDuration']),
    agent: pick(r, ['receivedBy', 'agent_name', 'agentName', 'agent', 'agent_id', 'agentId']),
    recordingUrl: pick(r, ['recording_url', 'recordingUrl', 'recording', 'recording_link', 'recordingLink', 'file']),
  };
}

// Stream a recording through the server so the SparkTG credentials never reach the browser.
export async function fetchRecording(url) {
  const headers = {};
  if (url.startsWith(cfg().baseUrl)) headers.Authorization = authHeader();
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw Object.assign(new Error(`Recording returned HTTP ${res.status}`), { status: 502 });
  return res;
}
