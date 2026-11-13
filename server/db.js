// Data store. MySQL when MYSQL_HOST + MYSQL_DATABASE are set in .env (see mysql-store.js), otherwise a JSON file.
// Either way the rest of the CRM works on the same in-memory object and calls save() after changes.
import fs from 'node:fs';
import * as mysqlStore from './mysql-store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CRM_DATA_DIR lets a second copy (tests, training) run without touching the live data.
export const DATA_DIR = process.env.CRM_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const STORES = [
  { code: '101', short: 'NSP', name: 'Netaji Subhash Place', address: 'Netaji Subhash Place Metro, New Delhi, Delhi 110034', hours: '09:00 AM – 08:00 PM', spocName: '', spocEmail: '', spocPhone: '', b2c: true },
  { code: '102', short: 'ITH', name: 'Ithum, Noida', address: 'Plot No-A40, Sector-62, Ithum Tower, Noida, Near Fortis Hospital', hours: '07:00 AM – 09:00 PM', spocName: '', spocEmail: '', spocPhone: '', b2c: false },
  { code: '103', short: 'AKD', name: 'Akshardham', address: 'Parsvnath Mall – Akshardham, Sandwich Floor, Akshardham Metro Station, New Delhi 110096', hours: '09:00 AM – 09:00 PM', spocName: '', spocEmail: '', spocPhone: '', b2c: true },
  { code: '104', short: 'SRV', name: 'Sarita Vihar', address: 'NDRAVG Business Park, Opp. Mohan Estate Metro Station, Plot No. A, PD Plot, Sarita Vihar, Delhi', hours: '09:00 AM – 08:00 PM', spocName: '', spocEmail: '', spocPhone: '', b2c: false },
  { code: '105', short: 'DH', name: 'Duhai, Ghaziabad (Online)', address: 'Pillar No. 777, Khasra No. 570, NH 34, Meerut Rd, Duhai, Ghaziabad, UP 201206', hours: 'Online store', spocName: '', spocEmail: '', spocPhone: '', b2c: false },
  { code: '106', short: 'GNI', name: 'Greater Noida', address: 'Plot No. 5, Knowledge Park 1, Phase-I, Near Cloud Nine Hospital, Greater Noida, UP 201308', hours: '09:00 AM – 08:00 PM', spocName: '', spocEmail: '', spocPhone: '', b2c: false },
];

function emptyDb() {
  return {
    counters: { case: 0, member: 0, missed: 0, lead: 0, mail: 0, support: 0 },
    agents: ['Kajal', 'Navjot'],
    agentShifts: {},
    settings: {},
    automationState: {},
    automationLog: [],
    outbox: [],
    sparktgEvents: [],
    calls: [],
    agentEmails: {},
    // Agent contact card shown under Admin → Users and asked for on the sign-in screen:
    // { [agent name]: { fullName, sipId, phone } }. The email lives in agentEmails (SparkTG SSO uses it too).
    agentProfiles: {},
    teams: {}, // contact details per escalation team (src/workflows.js TEAMS)
    picklists: {}, // values added from the Picklists screen: { field: [{ value, by, at }] }
    dependencies: [], // pairs added from the Dependencies screen: [{ mainField, mainValue, subField, subValue, by, at }]
    supportTickets: [], // support tokens (questions for the help desk manager): [{ id, question, agent, status, replies }]
    users: {}, // sign-in (server/auth.js): { [agent name]: { role, hash, active, setAt, setBy } }
    stores: STORES,
    members: [],
    cases: [],
    missedCalls: [],
    leads: [],
  };
}

let db;
const useMysql = mysqlStore.configured();
export const backend = useMysql ? 'mysql' : 'file';

export async function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (useMysql) {
    // first connection to an empty database imports the existing db.json once
    const { data, imported } = await mysqlStore.load(emptyDb, DB_FILE);
    db = data;
    if (imported) {
      console.log(`[mysql] imported ${DB_FILE} into the database; the file is kept as a backup (renamed .imported)`);
      fs.renameSync(DB_FILE, DB_FILE + '.imported');
    }
    return db;
  }
  if (!fs.existsSync(DB_FILE) && fs.existsSync(DB_FILE + '.imported')) {
    // The data lives in MySQL now — never start silently on a new, empty file.
    throw new Error('the CRM data was moved to MySQL, but the MySQL settings (MYSQL_HOST, MYSQL_DATABASE, …) were not found. They belong in the private secrets file (C:\\Users\\<you>\\.lots-crm\\secrets.env). Put them back and start again.');
  }
  if (fs.existsSync(DB_FILE)) {
    db = { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; // new keys get defaults
  } else {
    db = emptyDb();
    save();
  }
  return db;
}

export function status() {
  return useMysql
    ? { backend: 'mysql', database: process.env.MYSQL_DATABASE, ...mysqlStore.state, pending: mysqlStore.pending() } // no host / user: kept confidential
    : { backend: 'file', file: DB_FILE };
}

export async function close() {
  if (useMysql) await mysqlStore.close();
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// changes to contacts: MySQL tracks them per record; the file store (test copies) counts every save
let fileSaves = 0;
export const membersVersion = () => (useMysql ? mysqlStore.membersChanged() : fileSaves);
/** IDs of the contacts changed since the last call; null = not known (file store: rebuild the index). */
export const changedMembers = () => (useMysql ? mysqlStore.takeChangedMembers() : null);
/** Bulk imports: the new record is saved as usual, without the safety copy kept for records changed outside the CRM. */
export const unwatch = (rec) => useMysql && mysqlStore.unwatch(rec);

export function save() {
  if (useMysql) return mysqlStore.flush(); // changes are tracked; this just writes them now
  fileSaves++;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  // Windows antivirus / indexer can hold db.json for a moment (EPERM/EBUSY) — retry, then copy over it.
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, DB_FILE);
      return;
    } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      pause(50 * (i + 1));
    }
  }
  fs.copyFileSync(tmp, DB_FILE);
  fs.rmSync(tmp, { force: true });
}

export function get() {
  return db;
}

export function nextId(kind, prefix, pad = 6) {
  db.counters[kind] = (db.counters[kind] || 0) + 1;
  return prefix + String(db.counters[kind]).padStart(pad, '0');
}
