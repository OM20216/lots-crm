// Vtiger contacts → CRM contacts, read through Vtiger's webservice with the access key in the private secrets file
// (VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY). Runs on the server as a background job: lakhs of contacts take about
// an hour, it does not depend on a browser tab, and it continues where it stopped (the last Vtiger record read).
import crypto from 'node:crypto';
import { vtigerRows } from '../src/vtigerContacts.js';

const PAGE = 200; // Vtiger returns at most 200 records per query
const BATCH = 2000; // contacts saved per step

export const configured = () => Boolean(process.env.VTIGER_URL && process.env.VTIGER_USERNAME && process.env.VTIGER_ACCESS_KEY);
const env = (k) => String(process.env[k] || '').trim();
const endpoint = () => new URL(env('VTIGER_URL')).origin + '/webservice.php';
// never let a credential reach a log, an error or the browser
const redact = (msg) => [env('VTIGER_ACCESS_KEY'), env('VTIGER_USERNAME')].filter(Boolean).reduce((m, s) => m.split(s).join('***'), String(msg));

let session = null;
let fields = null; // Vtiger field name → label (the labels are the CSV column names the converter knows)

async function call(params, post = false) {
  const res = post ? await fetch(endpoint(), { method: 'POST', body: new URLSearchParams(params) }) : await fetch(endpoint() + '?' + new URLSearchParams(params));
  if (!res.ok) throw new Error(`Vtiger answered ${res.status}`);
  const j = await res.json();
  if (!j.success) throw Object.assign(new Error(redact(j.error?.message || 'Vtiger error')), { code: j.error?.code });
  return j.result;
}

async function login() {
  const { token } = await call({ operation: 'getchallenge', username: env('VTIGER_USERNAME') });
  const accessKey = crypto.createHash('md5').update(token + env('VTIGER_ACCESS_KEY')).digest('hex');
  session = (await call({ operation: 'login', username: env('VTIGER_USERNAME'), accessKey }, true)).sessionName;
}

/** A query; logs in (again) when needed and retries a few times on network trouble. */
async function query(q) {
  for (let attempt = 1; ; attempt++) {
    try {
      if (!session) await login();
      return await call({ operation: 'query', sessionName: session, query: q });
    } catch (e) {
      if (/SESSION|AUTH/i.test(e.code || '')) session = null;
      if (attempt >= 4 || e.code === 'INVALID_USER_CREDENTIALS') throw new Error(redact(e.message));
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function describe() {
  if (fields) return fields;
  if (!session) await login();
  const d = await call({ operation: 'describe', sessionName: session, elementType: 'Contacts' });
  fields = Object.fromEntries(d.fields.map((f) => [f.name, f.label]));
  return fields;
}

export async function contactCount() {
  const r = await query('SELECT count(*) FROM Contacts;');
  return Number(r[0]?.count || 0);
}

/** Next contacts after record `afterId` (in record order), as CRM contacts. */
async function nextContacts(afterId, stores) {
  const map = await describe();
  const where = afterId ? ` WHERE id > '${String(afterId).replace(/[^0-9x]/g, '')}'` : '';
  const records = await query(`SELECT * FROM Contacts${where} ORDER BY id LIMIT ${PAGE};`);
  // owner / user fields hold internal ids (e.g. "19x5"), not names: left out
  const skip = new Set(['assigned_user_id', 'created_user_id', 'modifiedby', 'record_currency_id', 'id']);
  const names = Object.keys(map).filter((n) => !skip.has(n));
  const rows = [names.map((n) => map[n]), ...records.map((r) => names.map((n) => (r[n] == null ? '' : String(r[n]))))];
  return { members: records.length ? vtigerRows(rows, stores).members : [], lastId: records.length ? records[records.length - 1].id : afterId, read: records.length };
}

// ----- the background job -----
// state (kept in settings, so it survives a restart): { status, total, read, added, updated, noNumber, skipped, lastId, startedAt, finishedAt, error, by }
let running = false;
let stopAsked = false;

/**
 * Start or continue the import. `ctx` = { getState, setState, importMembers, stores }:
 * the CRM's own import function does the saving, with the same checks as Contacts → Import CSV.
 */
export async function start(ctx, by, { fresh = false } = {}) {
  if (!configured()) throw new Error('Vtiger is not set up: VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY are needed in the private secrets file.');
  if (running) return ctx.getState();
  const old = ctx.getState() || {};
  const keep = !fresh && old.lastId && old.status !== 'done';
  const total = await contactCount();
  ctx.setState({
    status: 'running',
    total,
    read: keep ? old.read : 0,
    added: keep ? old.added : 0,
    updated: keep ? old.updated : 0,
    noNumber: keep ? old.noNumber : 0,
    skipped: keep ? old.skipped : 0,
    skippedRows: keep ? old.skippedRows || [] : [],
    lastId: keep ? old.lastId : '',
    startedAt: keep ? old.startedAt : new Date().toISOString(),
    finishedAt: null,
    error: null,
    by,
  });
  running = true;
  stopAsked = false;
  run(ctx)
    .catch(() => {})
    .finally(() => (running = false));
  return ctx.getState();
}

export const stop = () => {
  stopAsked = true;
};
export const isRunning = () => running;

async function run(ctx) {
  let cursor = ctx.getState().lastId; // last Vtiger record read
  let pending = []; // read, not saved yet
  let unsaved = 0;
  // save what was read, then move the "continue from here" point (lastId) — never past contacts that are not saved
  const commit = (extra = {}) => {
    const s = { ...ctx.getState() };
    if (pending.length) {
      const r = ctx.importMembers(pending);
      s.added += r.added;
      s.updated += r.updated;
      s.noNumber += r.noNumber;
      s.skipped += r.skipped;
      s.skippedRows = [...(s.skippedRows || []), ...r.skippedRows].slice(0, 50);
    }
    s.read += unsaved;
    s.lastId = cursor;
    s.reading = 0;
    pending = [];
    unsaved = 0;
    ctx.setState({ ...s, ...extra });
  };
  try {
    for (;;) {
      if (stopAsked) return commit({ status: 'stopped' });
      const page = await nextContacts(cursor, ctx.stores());
      if (!page.read) return commit({ status: 'done', finishedAt: new Date().toISOString() });
      pending.push(...page.members);
      unsaved += page.read;
      cursor = page.lastId;
      if (pending.length >= BATCH) commit();
      else ctx.setState({ ...ctx.getState(), reading: unsaved }); // progress only
      await new Promise((r) => setImmediate(r)); // let the CRM answer agents between pages
    }
  } catch (e) {
    try {
      commit({ status: 'error', error: redact(e.message) });
    } catch (e2) {
      ctx.setState({ ...ctx.getState(), status: 'error', error: redact(e2.message) });
    }
  }
}
