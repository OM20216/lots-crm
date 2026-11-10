// MySQL store for support tokens — the default. The notes live in the company's existing `lots`
// database (support_tickets + support_messages, two tables of their own that touch nothing from the
// CRM), so they survive this PC, a CRM restart and a CRM build failure. Needs the MYSQL_* settings in
// support.env (same values as the CRM's secrets.env). When they are missing, server.js uses the JSON
// file store instead (store.js).
import mysql from 'mysql2/promise';
import { makeSettings } from './store.js';

// the same UTC serialisation as the CRM's mysql-store.js (timezone 'Z' + dateStrings)
const dt = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toISOString().slice(0, 23).replace('T', ' ') : null;
};
const iso = (d) => {
  if (!d) return '';
  const s = String(d);
  return new Date(s.includes(' ') && !s.includes('Z') ? s.replace(' ', 'T') + 'Z' : s).toISOString();
};
// 'SUP-000123' → 123; the row number IS the counter, so a deleted token's number is never reused
const num = (id) => {
  const n = Number(String(id || '').replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ID = (n) => 'SUP-' + String(n).padStart(6, '0');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS support_tickets (
    num         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    agent       VARCHAR(80)  NULL,
    question    TEXT         NULL,
    status      VARCHAR(20)  NULL,
    created_at  DATETIME(3)  NULL,
    updated_at  DATETIME(3)  NULL,
    closed_at   DATETIME(3)  NULL,
    closed_by   VARCHAR(80)  NULL,
    context     JSON         NULL,
    notified    JSON         NULL,
    PRIMARY KEY (num)
  )`,
  `CREATE TABLE IF NOT EXISTS support_messages (
    num        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticket_num INT UNSIGNED NOT NULL,
    at         DATETIME(3)  NULL,
    author     VARCHAR(80)  NULL,
    body       TEXT         NULL,
    sender     VARCHAR(10)  NULL,
    PRIMARY KEY (num),
    KEY idx_support_messages_ticket (ticket_num, num)
  )`,
];

// what one support token looks like to the portals and the CRM (the same shape the JSON file had)
const ticketOf = (row, replies) => ({
  id: ID(row.num),
  question: row.question || '',
  agent: row.agent || '',
  status: row.status || 'Open',
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  context: row.context || { page: '', caseId: '' },
  replies: replies || [],
  notified: row.notified || {},
  closedAt: iso(row.closed_at),
  closedBy: row.closed_by || '',
});
const replyOf = (r) => ({ at: iso(r.at), by: r.author || '', text: r.body || '', from: r.sender || '' });

export function createMySqlStore({ dir, config }) {
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 3, // a few agents writing at once; tiny tables, nothing to sort
    timezone: 'Z',
    dateStrings: true,
    multipleStatements: false,
    compress: true, // the database is on a remote server, like the CRM's connection
  });
  const settingsStore = makeSettings(dir);

  // the two tables are created on the first database call ( CREATE TABLE IF NOT EXISTS is a safe re-run)
  let schemaReady = null;
  const ready = () => {
    if (!schemaReady) schemaReady = ensureSchema().catch((e) => (schemaReady = null, Promise.reject(e)));
    return schemaReady;
  };
  async function ensureSchema() {
    for (const sql of SCHEMA) await pool.query(sql);
  }

  const T = 'support_tickets', M = 'support_messages';
  const COLS = 't.num, t.agent, t.question, t.status, t.created_at, t.updated_at, t.closed_at, t.closed_by, t.context, t.notified';

  async function read(n) {
    const [rows] = await pool.query(`SELECT ${COLS} FROM ${T} t WHERE t.num = ?`, [n]);
    if (!rows.length) return null;
    const [msgs] = await pool.query(`SELECT at, author, body, sender FROM ${M} WHERE ticket_num = ? ORDER BY num`, [n]);
    return ticketOf(rows[0], msgs.map(replyOf));
  }

  // accepted patch fields (status / closedAt / closedBy / notified / updatedAt)
  async function updateRow(n, fields) {
    const toAdd = [];
    const add = (col, val) => toAdd.push([col, val]);
    if ('status' in fields) add('status', fields.status);
    if ('closedBy' in fields) add('closed_by', fields.closedBy);
    if ('updatedAt' in fields) add('updated_at', dt(fields.updatedAt));
    if ('closedAt' in fields) add('closed_at', dt(fields.closedAt));
    if ('notified' in fields) add('notified', JSON.stringify(fields.notified || {}));
    if (toAdd.length) await pool.query(`UPDATE ${T} SET ${toAdd.map(([c]) => `${c} = ?`).join(', ')} WHERE num = ?`, [...toAdd.map(([, v]) => v), n]);
  }

  return {
    backend: 'mysql',
    dir,
    ...settingsStore,
    async count() {
      await ready();
      const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM ${T}`);
      return n;
    },
    async list(agent) {
      await ready();
      const tickets = agent
        ? (await pool.query(`SELECT ${COLS} FROM ${T} t WHERE t.agent = ? ORDER BY t.num DESC`, [agent]))[0]
        : (await pool.query(`SELECT ${COLS} FROM ${T} t ORDER BY t.num DESC`))[0];
      const [msgs] = await pool.query(`SELECT ticket_num, at, author, body, sender FROM ${M} ORDER BY num`);
      const per = new Map();
      for (const m of msgs) {
        const list = per.get(m.ticket_num) || [];
        list.push(replyOf(m));
        per.set(m.ticket_num, list);
      }
      return tickets.map((row) => ticketOf(row, per.get(row.num) || []));
    },
    async get(id) {
      const n = num(id);
      if (!n) return null;
      await ready();
      return read(n);
    },
    async create(d) {
      await ready();
      const [r] = await pool.query(
        `INSERT INTO ${T} (agent, question, status, created_at, updated_at, context, notified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [d.agent, d.question, 'Open', dt(d.createdAt), dt(d.createdAt), JSON.stringify(d.context || {}), JSON.stringify({})]
      );
      return ticketOf({ num: r.insertId, question: d.question, agent: d.agent, status: 'Open', created_at: dt(d.createdAt), updated_at: dt(d.createdAt), context: d.context || {}, notified: {} }, []);
    },
    async saveReply(id, message, patch) {
      const n = num(id);
      if (!n) return null;
      await ready();
      if (!(await read(n))) return null;
      await pool.query(`INSERT INTO ${M} (ticket_num, at, author, body, sender) VALUES (?, ?, ?, ?, ?)`, [n, dt(message.at), message.by, message.text, message.from]);
      await updateRow(n, patch || {});
      return read(n);
    },
    async patch(id, fields) {
      const n = num(id);
      if (!n) return null;
      await ready();
      await updateRow(n, fields || {});
      return read(n);
    },
    async delete(id) {
      const n = num(id);
      if (!n) return false;
      await ready();
      const [r] = await pool.query(`DELETE FROM ${T} WHERE num = ?`, [n]);
      if (!r.affectedRows) return false;
      await pool.query(`DELETE FROM ${M} WHERE ticket_num = ?`, [n]);
      return true;
    },
  };
}
