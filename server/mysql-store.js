// MySQL persistence for the CRM data model.
//
// The CRM works on an in-memory object (same shape as the old db.json). All of it is loaded from MySQL at start,
// and every change is written back within ~150 ms. Changes are detected automatically: records are wrapped in
// Proxies that flag their record as dirty on any write (also inside nested arrays such as a case timeline).
// Objects that enter the data "raw" (a new case pushed, a call entry added) are also re-checked for a few minutes,
// because the code that created them may keep changing them through its own reference.
//
// Only ONE CRM server may use a database at a time (the in-memory copy is the working copy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { CALLER_TYPES, CASE_TREE, CHANNELS, CONFIRMATION_OUTCOMES, CUSTOMER_GROUPS, FOLLOWUP_OUTCOMES, SURVEY_OUTCOMES, LEAD_OUTCOMES, LEAD_TYPES, MISSED_REASONS, PRODUCT_CATEGORIES, STATUSES, STATUS_HELP } from '../src/taxonomy.js';
import { requirementsFor } from '../src/requirements.js';

const SCHEMA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const RAW_WATCH_MS = 10 * 60 * 1000;

// Error text can contain the server address or user name — never show those in the CRM.
const redact = (msg) => {
  let m = String(msg || '');
  for (const secret of [process.env.MYSQL_HOST, process.env.MYSQL_USER, process.env.MYSQL_PASSWORD]) if (secret) m = m.split(secret).join('***');
  return m;
};

export const configured = () => Boolean(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE);

// ---------- column mapping (record → table row) ----------
const dt = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 23).replace('T', ' '); // UTC
};
const s = (v, n = 200) => (v == null || v === '' ? null : String(v).slice(0, n));
const int = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

const TABLES = {
  cases: {
    table: 'cases', key: 'id', order: 'created_at, id',
    row: (c) => ({
      id: c.id, created_at: dt(c.createdAt), updated_at: dt(c.updatedAt), channel: s(c.channel, 40), caller_type: s(c.callerType, 40),
      member_id: s(c.memberId, 20), name: s(c.name), phone: s(c.phone, 20), email: s(c.email), business_name: s(c.businessName),
      card_no: s(c.cardNo, 50), store: s(c.store, 10), case_type: s(c.caseType, 40), category: s(c.category, 80), sub_category: s(c.subCategory, 120),
      status: s(c.status, 20), resolution_type: s(c.resolutionType, 10), escalation_level: int(c.escalationLevel), escalated_at: dt(c.escalatedAt),
      due_at: dt(c.dueAt), closed_at: dt(c.closedAt), assigned_to: s(c.assignedTo, 80), created_by: s(c.createdBy, 80),
    }),
  },
  members: {
    table: 'members', key: 'id', order: 'id',
    row: (m) => ({
      id: m.id, card_no: s(m.cardNo, 50), business_name: s(m.businessName), owner_name: s(m.ownerName), phone: s(m.phone, 20), alt_phone: s(m.altPhone, 20),
      email: s(m.email), gstin: s(m.gstin, 20), customer_group: s(m.customerGroup, 80), customer_type: s(m.customerType, 80), home_store: s(m.homeStore, 10),
      status: s(m.status, 20), created_at: dt(m.createdAt),
    }),
  },
  missedCalls: {
    table: 'missed_calls', key: 'id', order: 'missed_at, id',
    row: (m) => ({ id: m.id, phone: s(m.phone, 20), missed_at: dt(m.at), due_at: dt(m.dueAt), status: s(m.status, 40), assigned_to: s(m.assignedTo, 80), case_id: s(m.caseId, 20), txn_id: s(m.txnId, 64) }),
  },
  leads: {
    table: 'leads', key: 'id', order: 'created_at, id',
    row: (l) => ({ id: l.id, type: s(l.type, 60), name: s(l.name), business_name: s(l.businessName), phone: s(l.phone, 20), store: s(l.store, 10), status: s(l.status, 40), case_id: s(l.caseId, 20), assigned_to: s(l.assignedTo, 80), created_at: dt(l.createdAt) }),
  },
  calls: {
    table: 'calls', key: 'id', order: 'started_at, id',
    row: (r) => ({
      id: s(r.id, 64), direction: s(r.direction, 10), phone: s(r.phone, 20), agent: s(r.agent, 80), started_at: dt(r.startedAt), ended_at: dt(r.endedAt),
      connected: r.connected == null ? null : r.connected ? 1 : 0, disposition: s(r.info?.disposition, 60), duration_sec: int(r.info?.durationSec), case_id: s(r.caseId, 20), member_id: s(r.memberId, 20),
    }),
  },
  outbox: {
    table: 'outbox', key: 'id', order: 'sent_at, id',
    row: (o) => ({ id: o.id, sent_at: dt(o.at), to_addr: s(o.to, 500), subject: s(o.subject, 500), kind: s(o.kind, 60), status: s(o.status, 20), case_id: s(o.caseId, 20) }),
  },
  stores: {
    table: 'stores', key: 'code', order: 'code',
    row: (x) => ({ code: x.code, short_name: s(x.short, 10), name: s(x.name, 100), spoc_name: s(x.spocName, 100), spoc_email: s(x.spocEmail, 300), spoc_phone: s(x.spocPhone, 40) }),
  },
};
const KV_KEYS = ['counters', 'agents', 'agentEmails', 'agentShifts', 'settings', 'automationState', 'automationLog', 'sparktgEvents', 'schemaVersion', 'teams', 'picklists', 'dependencies', 'supportTickets'];
const SCHEMA_VERSION = 2; // v2: readable detail tables — existing data is copied into them once

// ---------- readable detail tables (derived from each record, rewritten when the record changes) ----------
const txt = (v, n = 60000) => (v == null || v === '' ? null : String(v).slice(0, n));
const DETAILS = {
  cases: [
    {
      table: 'case_timeline', key: 'case_id',
      cols: ['case_id', 'seq', 'at', 'by_agent', 'type', 'from_status', 'to_status', 'subject', 'text'],
      rows: (c) => (c.timeline || []).map((t, i) => [c.id, i + 1, dt(t.at), s(t.by, 80), s(t.type, 30), s(t.from, 20), s(t.to, 20), s(t.subject, 500), txt(t.text)]),
    },
    {
      table: 'case_calls', key: 'case_id',
      cols: ['case_id', 'txn_id', 'status', 'direction', 'disposition', 'duration_sec', 'agent', 'recording_url', 'linked_at'],
      rows: (c) =>
        [...new Map((c.calls || []).filter((k) => k.txnId).map((k) => [k.txnId, k])).values()].map((k) => [
          c.id, s(k.txnId, 64), s(k.status, 30), s(k.info?.direction, 20), s(k.info?.disposition, 60), int(k.info?.durationSec), s(k.info?.agent || k.linkedBy, 80), s(k.info?.recordingUrl, 500), dt(k.linkedAt),
        ]),
    },
    {
      table: 'case_attachments', key: 'case_id',
      cols: ['case_id', 'file', 'name', 'size_bytes', 'content_type', 'at'],
      rows: (c) => [...new Map((c.attachments || []).filter((a) => a.file).map((a) => [a.file, a])).values()].map((a) => [c.id, s(a.file, 255), s(a.name, 255), int(a.size), s(a.contentType, 100), dt(a.at)]),
    },
  ],
  members: [
    {
      table: 'member_addon_cards', key: 'member_id',
      cols: ['member_id', 'seq', 'name', 'phone', 'card_no'],
      rows: (m) => (m.addOnCards || []).map((a, i) => [m.id, i + 1, s(a.name), s(a.phone, 20), s(a.cardNo, 50)]),
    },
  ],
  leads: [
    {
      table: 'lead_log', key: 'lead_id',
      cols: ['lead_id', 'seq', 'at', 'by_agent', 'outcome', 'note'],
      rows: (l) => (l.log || []).map((x, i) => [l.id, i + 1, dt(x.at), s(x.by, 80), s(x.outcome, 60), txt(x.note)]),
    },
  ],
  missedCalls: [
    {
      table: 'missed_call_attempts', key: 'missed_call_id',
      cols: ['missed_call_id', 'seq', 'at', 'by_agent', 'outcome', 'txn_id'],
      rows: (m) => (m.attempts || []).map((x, i) => [m.id, i + 1, dt(x.at), s(x.by, 80), s(x.outcome, 200), s(x.txnId, 64)]),
    },
  ],
};

async function insertRows(conn, table, cols, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await conn.query(`INSERT INTO \`${table}\` (${cols.map((c) => '`' + c + '`').join(',')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')}`, chunk.flat());
  }
}

// Rewrite the detail rows of the records that changed.
async function syncDetails(conn, recsByCollection) {
  for (const [name, recs] of Object.entries(recsByCollection)) {
    for (const d of DETAILS[name] || []) {
      const ids = recs.map((r) => r.id).filter(Boolean);
      for (let i = 0; i < ids.length; i += 500) {
        const part = ids.slice(i, i + 500);
        await conn.query(`DELETE FROM \`${d.table}\` WHERE \`${d.key}\` IN (${part.map(() => '?').join(',')})`, part);
      }
      await insertRows(conn, d.table, d.cols, recs.flatMap((r) => d.rows(r)));
    }
  }
}

let lastLogAt = ''; // newest automation_log entry already in MySQL (ISO)

async function syncKvTables(conn, keys) {
  if (keys.some((k) => ['agents', 'agentEmails', 'agentShifts'].includes(k))) {
    await conn.query('DELETE FROM agents');
    const rows = (raw.agents || []).map((a) => [s(a, 80), s(raw.agentEmails?.[a]), s(raw.agentShifts?.[a], 20)]);
    if (rows.length) await insertRows(conn, 'agents', ['name', 'sparktg_email', 'shift'], rows);
  }
  if (keys.includes('automationLog')) {
    const fresh = (raw.automationLog || []).filter((e) => e.at > lastLogAt);
    if (fresh.length) {
      await insertRows(conn, 'automation_log', ['at', 'text', 'case_id'], fresh.map((e) => [dt(e.at), s(e.text, 1000), s(e.caseId, 20)]));
      lastLogAt = fresh[fresh.length - 1].at;
    }
  }
}

// SOP lists from the CRM's code → reference tables (rewritten at every start so they always match the CRM).
async function seedReference() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM ref_case_categories');
    let n = 0;
    const cats = [];
    for (const [type, categories] of Object.entries(CASE_TREE))
      for (const [category, subs] of Object.entries(categories))
        for (const sub of subs) {
          const req = requirementsFor(sub);
          cats.push([type, category, sub, ++n, req?.docs ? 1 : 0, req ? req.items.join(' | ') : null]);
        }
    await insertRows(conn, 'ref_case_categories', ['case_type', 'category', 'sub_category', 'sort', 'needs_documents', 'requirements'], cats);

    await conn.query('DELETE FROM ref_customer_types');
    n = 0;
    await insertRows(conn, 'ref_customer_types', ['customer_group', 'customer_type', 'sort'], Object.entries(CUSTOMER_GROUPS).flatMap(([g, types]) => types.map((t) => [g, t, ++n])));

    await conn.query('DELETE FROM ref_values');
    const lists = {
      status: STATUSES.map((x) => [x, STATUS_HELP[x]]),
      channel: CHANNELS.map((x) => [x, null]),
      caller_type: CALLER_TYPES.map((x) => [x, null]),
      product_category: PRODUCT_CATEGORIES.map((x) => [x, null]),
      lead_type: LEAD_TYPES.map((x) => [x, null]),
      lead_outcome: [...new Set([...LEAD_OUTCOMES, ...CONFIRMATION_OUTCOMES, ...FOLLOWUP_OUTCOMES, ...SURVEY_OUTCOMES])].map((x) => [x, CONFIRMATION_OUTCOMES.includes(x) && !LEAD_OUTCOMES.includes(x) ? 'Confirmation calls' : null]),
      missed_reason: MISSED_REASONS.map((x) => [x, null]),
    };
    await insertRows(conn, 'ref_values', ['list', 'value', 'sort', 'description'], Object.entries(lists).flatMap(([list, vals]) => vals.map(([v, d], i) => [list, v, i + 1, d])));
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- change tracking ----------
const proxyOf = new WeakMap(); // raw object → proxy
const rawOf = new WeakMap(); // proxy → raw object
const collectionOf = new WeakMap(); // raw record → collection name
const dirtyRecords = new Set();
const dirtyKv = new Set();
const watched = new Map(); // raw record → { until, json } — records that may be changed through a raw reference
let scheduleFlush = () => {};

function unwrap(v) {
  if (!v || typeof v !== 'object') return v;
  if (rawOf.has(v)) return rawOf.get(v);
  // arrays built from existing data ([...a], a.slice()) hold proxies — keep the stored data raw
  if (Array.isArray(v)) for (let i = 0; i < v.length; i++) if (v[i] && rawOf.has(v[i])) v[i] = rawOf.get(v[i]);
  return v;
}

function markDirty(root) {
  if (typeof root === 'string') dirtyKv.add(root);
  else dirtyRecords.add(root);
  scheduleFlush();
}

function watchRaw(root) {
  if (typeof root === 'string') return; // kv values are rewritten whole anyway
  const w = watched.get(root);
  if (w) w.until = Date.now() + RAW_WATCH_MS;
  else watched.set(root, { until: Date.now() + RAW_WATCH_MS, json: null });
}

function wrap(target, root) {
  if (!target || typeof target !== 'object') return target;
  if (rawOf.has(target)) return target; // already a proxy
  let p = proxyOf.get(target);
  if (p) return p;
  p = new Proxy(target, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      return v && typeof v === 'object' ? wrap(v, root) : v;
    },
    set(t, k, v) {
      const raw = unwrap(v);
      if (raw && typeof raw === 'object' && raw === v) watchRaw(root); // a raw object entered this record
      t[k] = raw;
      markDirty(root);
      return true;
    },
    deleteProperty(t, k) {
      delete t[k];
      markDirty(root);
      return true;
    },
  });
  proxyOf.set(target, p);
  rawOf.set(p, target);
  return p;
}

// A record collection (cases, members, …): each element is its own root.
function wrapCollection(name, arr) {
  unwrap(arr);
  for (const rec of arr) collectionOf.set(rec, name);
  return new Proxy(arr, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (v && typeof v === 'object' && typeof k === 'string' && /^\d+$/.test(k)) return wrap(v, v);
      return v;
    },
    set(t, k, v) {
      const raw = unwrap(v);
      t[k] = raw;
      if (raw && typeof raw === 'object' && /^\d+$/.test(String(k))) {
        collectionOf.set(raw, name);
        markDirty(raw);
        if (raw === v) watchRaw(raw);
      }
      return true;
    },
  });
}

function wrapRoot(data) {
  const colls = {};
  for (const name of Object.keys(TABLES)) colls[name] = wrapCollection(name, data[name]);
  return new Proxy(data, {
    get(t, k, r) {
      if (k in colls) return colls[k];
      const v = Reflect.get(t, k, r);
      return v && typeof v === 'object' && KV_KEYS.includes(k) ? wrap(v, k) : v;
    },
    set(t, k, v) {
      const raw = unwrap(v);
      t[k] = raw;
      if (k in TABLES) {
        colls[k] = wrapCollection(k, raw); // e.g. outbox trimmed with slice(): rows stay in MySQL as history
        for (const rec of raw) if (!collectionOf.has(rec)) markDirty(rec);
      } else if (KV_KEYS.includes(k)) markDirty(k);
      return true;
    },
  });
}

// ---------- MySQL ----------
let pool;
let root;
let raw;
export const state = { backend: 'mysql', connected: false, lastFlush: null, lastError: null, writes: 0 };

function poolConfig() {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: process.env.MYSQL_SSL_VERIFY !== 'false' } : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    timezone: 'Z',
    dateStrings: true,
    multipleStatements: false,
  };
}

async function ensureSchema() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8').replace(/^\s*--.*$/gm, '');
  for (const stmt of sql.split(';').map((x) => x.trim()).filter(Boolean)) await pool.query(stmt);
}

const parseDoc = (d) => (typeof d === 'string' ? JSON.parse(d) : d);

/** Load everything. `emptyDb()` gives defaults; `legacyFile` is imported once if the database is empty. */
export async function load(emptyDb, legacyFile) {
  pool = mysql.createPool(poolConfig());
  await pool.query('SELECT 1');
  state.connected = true;
  await ensureSchema();
  await seedReference();
  const [[last]] = await pool.query('SELECT MAX(at) AS at FROM automation_log');
  lastLogAt = last?.at ? last.at.replace(' ', 'T') + 'Z' : '';

  const data = emptyDb();
  const [[{ n }]] = await pool.query('SELECT (SELECT COUNT(*) FROM cases) + (SELECT COUNT(*) FROM kv) + (SELECT COUNT(*) FROM members) AS n');
  let imported = false;
  if (Number(n) === 0 && legacyFile && fs.existsSync(legacyFile)) {
    Object.assign(data, JSON.parse(fs.readFileSync(legacyFile, 'utf8')));
    imported = true;
  } else {
    for (const [name, t] of Object.entries(TABLES)) {
      const [rows] = await pool.query(`SELECT doc FROM \`${t.table}\` ORDER BY ${t.order}`);
      if (rows.length || name !== 'stores') data[name] = rows.map((r) => parseDoc(r.doc));
    }
    const [kv] = await pool.query('SELECT k, v FROM kv');
    for (const r of kv) if (KV_KEYS.includes(r.k)) data[r.k] = parseDoc(r.v);
  }

  raw = data;
  root = wrapRoot(data);
  scheduleFlush = debounce(flush, 150);

  if (imported || Number(n) === 0 || (data.schemaVersion || 0) < SCHEMA_VERSION) {
    // first run, or new tables added: write everything (defaults, the imported db.json, or detail rows for existing data)
    raw.schemaVersion = SCHEMA_VERSION;
    for (const name of Object.keys(TABLES)) for (const rec of data[name]) markDirty(rec);
    for (const k of KV_KEYS) markDirty(k);
    await flush();
  }
  setInterval(() => flush().catch(() => {}), 5000); // catches raw-reference changes without a save()
  return { data: root, imported };
}

function debounce(fn, ms) {
  let t = null;
  return () => {
    if (t) return;
    t = setTimeout(() => {
      t = null;
      fn().catch(() => {});
    }, ms);
  };
}

let flushing = null;
let again = false;

/** Write every changed record / value. Safe to call often; concurrent calls are merged. */
export async function flush() {
  if (!pool || !root) return;
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    // records changed through a raw reference
    const now = Date.now();
    for (const [rec, w] of watched) {
      const json = JSON.stringify(rec);
      if (w.json !== null && w.json !== json) dirtyRecords.add(rec);
      if (w.json === null) dirtyRecords.add(rec);
      w.json = json;
      if (w.until < now) watched.delete(rec);
    }
    const recs = [...dirtyRecords];
    const keys = [...dirtyKv];
    dirtyRecords.clear();
    dirtyKv.clear();
    if (!recs.length && !keys.length) return;

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      // group by table, upsert in batches of 200 rows
      const byTable = {};
      for (const rec of recs) {
        const name = collectionOf.get(rec);
        const t = TABLES[name];
        if (!t || rec[t.key] == null) continue;
        (byTable[name] ||= []).push({ ...t.row(rec), doc: JSON.stringify(rec) });
      }
      for (const [name, rows] of Object.entries(byTable)) {
        const t = TABLES[name];
        const cols = Object.keys(rows[0]);
        const update = cols.filter((c) => c !== t.key).map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(',');
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          await conn.query(
            `INSERT INTO \`${t.table}\` (${cols.map((c) => '`' + c + '`').join(',')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')} ON DUPLICATE KEY UPDATE ${update}`,
            chunk.flatMap((row) => cols.map((c) => row[c]))
          );
        }
      }
      for (const k of keys) {
        await conn.query('INSERT INTO kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, JSON.stringify(raw[k] ?? null)]);
      }
      // readable detail tables
      const recsByCollection = {};
      for (const rec of recs) {
        const name = collectionOf.get(rec);
        if (DETAILS[name]) (recsByCollection[name] ||= []).push(rec);
      }
      await syncDetails(conn, recsByCollection);
      await syncKvTables(conn, keys);
      await conn.commit();
      state.writes += recs.length + keys.length;
      state.lastFlush = new Date().toISOString();
      state.lastError = null;
    } catch (e) {
      await conn?.rollback().catch(() => {});
      for (const r of recs) dirtyRecords.add(r); // retry on the next flush
      for (const k of keys) dirtyKv.add(k);
      state.lastError = redact(e.message);
      console.error('[mysql] write failed, will retry:', e.message);
      setTimeout(() => scheduleFlush(), 3000);
    } finally {
      conn?.release();
    }
  })();
  try {
    await flushing;
  } finally {
    flushing = null;
    if (again) {
      again = false;
      scheduleFlush();
    }
  }
}

export async function close() {
  await flush();
  await pool?.end();
}

export function pending() {
  return dirtyRecords.size + dirtyKv.size;
}
