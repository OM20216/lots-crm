// Reads LOTS's escalation workbook (store tabs) into server/storeMatrix.json — the store escalation matrix as LOTS sent it.
//   node server/buildStoreMatrix.js "<workbook.xlsx>"
// Stores / tabs missing from the workbook (DH 105, GNI 106 Ecommerce) are made from NSP 101's row with the store's own
// mailboxes (st101.x → st105.x), marked "to confirm" (decided with the user, 17 Oct 2026).
// Later changes come in through Stores & settings (edit, upload, live link) and are saved over this file in the database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, cleanList } from '../src/escalationMatrix.js';
import { STORE_ROWS, STORE_TABS, parseStoreRowKey } from '../src/storeMatrix.js';
import { cleanEmails, parseTat, readFile, storeTableRows } from './matrixImport.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'storeMatrix.json');
const STORES = { '101': 'NSP', '102': 'Ithum', '103': 'AKD', '104': 'SV', '105': 'DH', '106': 'GNI' };
const PATTERN = '101'; // the store whose rows are copied for a missing tab

const file = process.argv[2];
if (!file) {
  console.error('Usage: node server/buildStoreMatrix.js "<workbook.xlsx>"');
  process.exit(1);
}
const sheets = await readFile(fs.readFileSync(file), path.basename(file));
const rows = storeTableRows(sheets);
const stores = {};
const notes = [];

for (const r of rows) {
  if (r.unknown) {
    notes.push(`not a row of the store matrix, left out: ${r.label}`);
    continue;
  }
  const { code, rowKey } = parseStoreRowKey(r.key);
  const stages = r.stages.map((s, i) => {
    const to = cleanEmails(s.to);
    const cc = cleanEmails(s.cc);
    const fixes = [...to.fixes, ...cc.fixes];
    const t = parseTat(s.tat);
    const stage = { to: cleanList(to.list), cc: cleanList(cc.list, to.list), tat: t.tat || { value: i + 1, unit: 'days' } };
    if (fixes.length) stage.fixed = `Corrected from the sheet: ${fixes.join('; ')}`;
    if (!t.tat) stage.toConfirm = `${t.problem}: ${i + 1} working day(s) like the other rows`;
    for (const b of [...to.bad, ...cc.bad]) notes.push(`${r.label} ${STAGES[i]}: “${b}” is not an email, left out`);
    if (!stage.to.length) notes.push(`${r.label} ${STAGES[i]}: no SPOC`);
    return stage.to.length ? stage : null;
  });
  (stores[code] ||= {})[rowKey] = { stages };
}

// tabs the workbook doesn't have: the pattern store's row with this store's mailboxes
const swap = (list, code) => list.map((e) => e.replace(new RegExp(`^st${PATTERN}\\.`, 'i'), `st${code}.`));
for (const code of Object.keys(STORES))
  for (const t of STORE_TABS) {
    const keys = STORE_ROWS.filter((r) => r.tab === t.tab).map((r) => r.key);
    if (keys.some((k) => stores[code]?.[k])) continue;
    for (const k of keys) {
      const base = stores[PATTERN]?.[k];
      if (!base) continue;
      (stores[code] ||= {})[k] = {
        stages: base.stages.map((s) => s && { to: swap(s.to, code), cc: swap(s.cc, code), tat: s.tat }), // without the pattern store's notes
        toConfirm: `${STORES[code]} ${code} has no ${t.label} tab in the workbook: made from ${STORES[PATTERN]} ${PATTERN}'s row with ${STORES[code]}'s own st${code} mailboxes`,
      };
    }
    notes.push(`${STORES[code]} ${code} – ${t.label}: not in the workbook, made from ${STORES[PATTERN]} ${PATTERN} (to confirm)`);
  }

const data = { source: path.basename(file), readAt: new Date().toISOString(), stores };
fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
const count = Object.values(stores).reduce((n, s) => n + Object.keys(s).length, 0);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${count} rows for ${Object.keys(stores).length} stores`);
for (const n of notes) console.log(' •', n);
process.exit(0);
