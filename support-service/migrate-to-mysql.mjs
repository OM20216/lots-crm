// One-off move of the support tokens from the JSON file into MySQL (support_tickets + support_messages).
// Safe to run again: ids already in MySQL are skipped. Keeps the JSON file as a backup (renamed).
//
// Run with the support service stopped:
//   powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 stop
//   node support-service\migrate-to-mysql.mjs
//   powershell -ExecutionPolicy Bypass -File scripts\support-service.ps1 start
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.LOTS_SUPPORT_ENV || path.join(os.homedir(), '.lots-crm', 'support.env');
try {
  process.loadEnvFile(envFile);
} catch {
  /* reported below */
}

if (!process.env.MYSQL_HOST || !process.env.MYSQL_DATABASE) {
  console.error(`MYSQL_HOST / MYSQL_DATABASE are missing in ${envFile} - nothing to move to.`);
  process.exit(1);
}
const dataDir = process.env.SUPPORT_DATA_DIR || path.join(os.homedir(), '.lots-crm', 'support');
const file = path.join(dataDir, 'tickets.json');
const num = (id) => Number(String(id || '').replace(/\D/g, '')) || 0;

let data = { tickets: [] };
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  console.log(`${file} not found or unreadable - either this is a fresh machine or the move already happened.`);
  process.exit(0);
}
const tickets = Array.isArray(data.tickets) ? data.tickets : [];
if (!tickets.length) {
  console.log('tickets.json holds no tokens - nothing to move.');
  process.exit(0);
}

const dt = (v) => {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toISOString().slice(0, 23).replace('T', ' ') : null;
};
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

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: process.env.MYSQL_SSL_VERIFY !== 'false' } : undefined,
  waitForConnections: true,
  connectionLimit: 2,
  multipleStatements: false,
  compress: true,
});

try {
  for (const sql of SCHEMA) await pool.query(sql);
  let added = 0;
  let skipped = 0;
  for (const t of tickets) {
    const n = num(t.id);
    if (!n) {
      skipped++;
      continue;
    }
    const [[dupe]] = await pool.query('SELECT num FROM support_tickets WHERE num = ?', [n]);
    if (dupe) {
      skipped++;
      continue;
    }
    await pool.query(
      'INSERT INTO support_tickets (num, agent, question, status, created_at, updated_at, closed_at, closed_by, context, notified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [n, t.agent || '', t.question || '', t.status === 'Closed' ? 'Closed' : t.status || 'Open', dt(t.createdAt), dt(t.updatedAt), dt(t.closedAt), t.closedBy || '', JSON.stringify(t.context || {}), JSON.stringify(t.notified || {})]
    );
    for (const r of t.replies || [])
      await pool.query('INSERT INTO support_messages (ticket_num, at, author, body, sender) VALUES (?, ?, ?, ?, ?)', [n, dt(r.at), r.by || '', r.text || '', r.from || '']);
    added++;
  }
  console.log(`Moved ${added} token(s) into MySQL (${process.env.MYSQL_DATABASE}); skipped ${skipped}.`);
  // keep the JSON file as a backup, but out of the service's way
  fs.renameSync(file, `${file}.pre-mysql`);
  console.log(`Backup kept: ${file}.pre-mysql`);
  const [[next]] = await pool.query('SELECT COALESCE(MAX(num), 0) + 1 AS next FROM support_tickets');
  console.log('Next token will be SUP-' + String(next.next).padStart(6, '0'));
} finally {
  await pool.end();
}
