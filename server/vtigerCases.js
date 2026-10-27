// Vtiger Cases → CRM cases, read through the shared Vtiger webservice client. Runs on the server as a background
// job, in pages of 200 records (Vtiger's limit) and saves every 2,000. State lives in settings.vtigerCaseImport, so a
// stopped or restarted import continues after the last Vtiger record read. Cases already in the CRM (same Vtiger id)
// are left untouched: work done in the CRM is never overwritten by the import.
import { configured, redact, query } from './vtigerApi.js';
import { toCase } from '../src/vtigerCases.js';

export { configured };

const PAGE = 200; // Vtiger returns at most 200 records per query
const BATCH = 2000; // cases saved per step
const CONTACT_LOOKUP = 200; // Vtiger contacts resolved per query (cases hold a contact record id, the CRM a Contact Id)

export async function caseCount() {
  const r = await query('SELECT count(*) FROM Cases;');
  return Number(r[0]?.count || 0);
}

/** Vtiger user id → name, for the case owner (kept in source.ownerName; imported cases are not assigned to CRM agents). */
async function ownerNames() {
  try {
    const users = await query('SELECT id, first_name, last_name FROM Users;');
    return new Map(users.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim()]));
  } catch {
    return new Map(); // the owner stays as an id on the case
  }
}

async function nextCases(afterId) {
  const where = afterId ? ` WHERE id > '${String(afterId).replace(/[^0-9x]/g, '')}'` : '';
  const records = await query(`SELECT * FROM Cases${where} ORDER BY id LIMIT ${PAGE};`);
  return { records, lastId: records.length ? records[records.length - 1].id : afterId };
}

/**
 * A case holds the Vtiger contact's record id ("4x762"); the CRM contact is found by its Contact Id ("CON141").
 * Look the ids of one page up in one query and remember them (a stopped import resolves only what it has not seen).
 */
async function resolveContacts(records, known) {
  const ids = [...new Set(records.map((r) => String(r.contact_id || '').trim()).filter((id) => id && !known.has(id)))];
  for (let i = 0; i < ids.length; i += CONTACT_LOOKUP) {
    const part = ids.slice(i, i + CONTACT_LOOKUP);
    try {
      const list = part.map((id) => `'${id.replace(/[^0-9x]/g, '')}'`).join(',');
      const rows = await query(`SELECT id, contact_no FROM Contacts WHERE id IN (${list});`);
      for (const r of rows) known.set(r.id, r.contact_no || '');
    } catch {
      /* the lookup failed: import the case without the link, as before */
    }
    for (const id of part) if (!known.has(id)) known.set(id, ''); // contact deleted in Vtiger
  }
}

// ----- the background job -----
// state: { status, total, read, added, existing, linked, lastId, startedAt, finishedAt, error, by, reading }
let running = false;
let stopAsked = false;

/**
 * Start or continue the import. `ctx` = { getState, setState, importCases, caseIds, memberOf, stores }.
 * `max` stops after that many records (a trial run).
 */
export async function start(ctx, by, { fresh = false, max = 0 } = {}) {
  if (!configured()) throw new Error('Vtiger is not set up: VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY are needed in the private secrets file.');
  if (running) return ctx.getState();
  const old = ctx.getState() || {};
  // continue after the last record read: a stopped import goes on, a finished one fetches only cases added in Vtiger since
  const keep = !fresh && old.lastId;
  const total = await caseCount();
  ctx.setState({
    status: 'running',
    total,
    read: keep ? old.read : 0,
    added: keep ? old.added : 0,
    existing: keep ? old.existing : 0,
    linked: keep ? old.linked : 0,
    lastId: keep ? old.lastId : '',
    startedAt: keep ? old.startedAt : new Date().toISOString(),
    finishedAt: null,
    error: null,
    reading: 0,
    by,
  });
  running = true;
  stopAsked = false;
  run(ctx, Math.max(0, Number(max) || 0))
    .catch(() => {})
    .finally(() => (running = false));
  return ctx.getState();
}

export const stop = () => {
  stopAsked = true;
};
export const isRunning = () => running;

async function run(ctx, max) {
  let cursor = ctx.getState().lastId; // last Vtiger record read
  let pending = [];
  let unsaved = 0; // read, not saved yet
  let duplicates = 0;
  const seen = ctx.caseIds(); // Vtiger ids already in the CRM
  const owners = await ownerNames();
  const stores = ctx.stores();
  const contacts = new Map(); // Vtiger contact record id ("4x762") → Contact Id ("CON141"), per page
  const memberOf = (contactId) => {
    const contactNo = contacts.get(contactId);
    return contactNo ? ctx.memberOf(contactNo) : null;
  };

  // save what was read, then move the "continue from here" point — never past cases that are not saved
  const commit = (extra = {}) => {
    const s = { ...ctx.getState() };
    if (pending.length) {
      const r = ctx.importCases(pending);
      s.added += r.added;
      s.linked += r.linked;
    }
    s.read += unsaved;
    s.existing += duplicates;
    s.lastId = cursor;
    s.reading = 0;
    pending = [];
    unsaved = 0;
    duplicates = 0;
    ctx.setState({ ...s, ...extra });
  };

  try {
    for (;;) {
      if (stopAsked) return commit({ status: 'stopped', finishedAt: new Date().toISOString() });
      if (max && ctx.getState().read + unsaved >= max) return commit({ status: 'stopped', finishedAt: new Date().toISOString() });
      const page = await nextCases(cursor);
      if (!page.records.length) return commit({ status: 'done', finishedAt: new Date().toISOString() });
      await resolveContacts(page.records, contacts);

      let lastProcessed = cursor;
      let reachedMax = false;
      for (const r of page.records) {
        lastProcessed = r.id;
        const c = toCase(r, { stores, memberOf, ownerOf: (id) => owners.get(id) });
        const id = c.vtigerId;
        if (id && seen.has(id)) duplicates++;
        else {
          if (id) seen.add(id);
          pending.push(c);
        }
        unsaved++;
        if (max && ctx.getState().read + unsaved >= max) {
          reachedMax = true;
          break;
        }
      }
      cursor = lastProcessed;
      if (pending.length >= BATCH || reachedMax) commit(reachedMax ? { status: 'stopped', finishedAt: new Date().toISOString() } : {});
      else ctx.setState({ ...ctx.getState(), reading: unsaved }); // progress only
      if (reachedMax) return;
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
