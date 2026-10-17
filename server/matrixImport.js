// Updated escalation matrix from LOTS (their Excel / CSV "CRM TABLE"): read it, compare with the CRM, apply.
// The sheet's rules: SUB1 names don't change, new rows and changed emails are highlighted in yellow.
// Used by Stores & settings → "Update from Excel", and automatically when the sheet arrives by email.
import ExcelJS from 'exceljs';
import * as core from './core.js';
import * as store from './db.js';
import * as teams from './teams.js';
import { STAGES, cleanList, tatText } from '../src/escalationMatrix.js';
import { CASE_TREE } from '../src/taxonomy.js';
import { STORE_TABS, parseStoreRowKey, storeRowKey } from '../src/storeMatrix.js';

const db = () => store.get();
const now = () => new Date().toISOString();
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i;
const norm = (v) => String(v || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9&]/g, '');
const pending = new Map(); // id → parsed import, until applied (also kept in settings.matrixImports)

// ---------- reading the file ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.map((r) => r.map((v) => ({ text: v, yellow: false })));
}

const isYellow = (cell) => {
  const argb = cell?.fill?.fgColor?.argb || cell?.fill?.bgColor?.argb;
  if (!argb || argb.length < 6) return false;
  const hex = argb.slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r > 200 && g > 190 && b < 140;
};

async function readFile(bytes, name) {
  if (/\.csv$/i.test(name)) {
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes); // Excel's "CSV" is often Windows-1252
    return [parseCsv(text)];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const cells = [];
      for (let c = 1; c <= Math.min(Math.max(r.cellCount, 11), 20); c++) {
        const cell = r.getCell(c);
        cells.push({ text: String(cell.text ?? '').trim(), yellow: isYellow(cell) });
      }
      rows[n - 1] = cells;
    });
    return Object.assign(Array.from(rows, (r) => r || []), { name: ws.name });
  });
}

// After SUB1 (and SUB 2 on the store tabs) the table always has the same 9 columns, whatever their headers say
// (the store tabs name them "First Time Resolution", "First,time,resolution", "Lavel 2 SPOC"…).
const STAGE_COLS = [0, 1, 2].flatMap((st) => ['to', 'cc', 'tat'].map((f) => [st, f]));

/** A store tab ("NSP Lots-App(Store 101)") → { tab, code }, or null. */
function storeTabOf(name) {
  const code = String(name || '').match(/store\s*(\d{3})/i)?.[1];
  const tab = code && STORE_TABS.find((t) => t.sheetName.test(name));
  return tab ? { tab: tab.tab, code } : null;
}

/** The table of one sheet: [{ sub1, sub2, yellow, stages: [{ to, cc, tat }] (raw text) }], or null. */
function sheetTable(rows) {
  const h = rows.findIndex((r) => r?.some((c) => norm(c.text) === 'sub1'));
  if (h < 0) return null;
  const sub1Col = rows[h].findIndex((c) => norm(c.text) === 'sub1');
  const sub2Col = norm(rows[h][sub1Col + 1]?.text).startsWith('sub') ? sub1Col + 1 : -1;
  const first = (sub2Col >= 0 ? sub2Col : sub1Col) + 1;
  if (!/firsttime|resolution/.test(norm(rows[h][first]?.text))) return null;
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const sub1 = (r?.[sub1Col]?.text || '').trim();
    if (!sub1) {
      if (out.length) break; // the table ends at the first empty SUB1
      continue;
    }
    if (/^in case you wish/i.test(sub1) || /^anything after/i.test(sub1)) break;
    const row = { sub1, sub2: sub2Col >= 0 ? (r[sub2Col]?.text || '').trim() : '', yellow: Boolean(r[sub1Col]?.yellow), stages: [0, 1, 2].map(() => ({ to: '', cc: '', tat: '', yellow: {} })) };
    STAGE_COLS.forEach(([st, f], i) => {
      const cell = r[first + i];
      row.stages[st][f] = cell?.text || '';
      if (cell?.yellow) row.stages[st].yellow[f] = true;
    });
    out.push(row);
  }
  return out;
}

/** The HO "CRM TABLE" (the CSV, or the workbook's sheet that isn't a store tab). */
function tableRows(sheets) {
  for (const rows of sheets) {
    if (storeTabOf(rows.name)) continue;
    const t = sheetTable(rows);
    if (t) return t;
  }
  return null;
}

/** The store tabs' rows, each placed on its store-matrix row: [{ key: 's101.app-tech', code, tab, label, … }]. */
function storeTableRows(sheets) {
  const out = [];
  for (const rows of sheets) {
    const at = storeTabOf(rows.name);
    if (!at) continue;
    const tab = STORE_TABS.find((t) => t.tab === at.tab);
    const seen = {};
    for (const r of sheetTable(rows) || []) {
      // by SUB1; SUB2 only tells apart the rows with the same SUB1 (its text varies between the store tabs)
      const same = tab.rows.filter((x) => norm(x.sheet[0]) === norm(r.sub1));
      const n = (seen[norm(r.sub1)] = (seen[norm(r.sub1)] || 0) + 1);
      const def = same.length > 1 ? same.find((x) => norm(x.sheet[1]) === norm(r.sub2)) || same[n - 1] : same[0];
      const label = `${rows.name.trim()}: ${r.sub1}${r.sub2 ? ` › ${r.sub2}` : ''}`;
      out.push(def ? { ...r, key: storeRowKey(at.code, `${at.tab}-${def.key}`), code: at.code, tab: at.tab, label } : { ...r, code: at.code, tab: at.tab, label, unknown: true });
    }
  }
  return out;
}

// ---------- cleaning a cell ----------
/** Addresses in a cell, with the usual typos fixed: "a@cpwi" → a@cpwi.in, "a@cpwi.in@cpwi" → a@cpwi.in. */
export function cleanEmails(raw) {
  const list = [];
  const fixes = [];
  const bad = [];
  for (const tok of String(raw || '').split(/[\s,;]+/).filter(Boolean)) {
    let t = tok.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    if (!t) continue;
    let m = t.match(/^([^@]+@cpwi\.in)@.+$/i);
    if (m) fixes.push(`${t} → ${m[1]}`), (t = m[1]);
    m = t.match(/^([^@]+)@(c[a-z.]*)$/i);
    if (m && 'cpwi.in'.startsWith(m[2].toLowerCase()) && m[2].toLowerCase() !== 'cpwi.in') fixes.push(`${t} → ${m[1]}@cpwi.in`), (t = `${m[1]}@cpwi.in`); // cut off: "a@cpwi", "a@cp", "a@c"
    if (EMAIL.test(t)) {
      if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t);
    } else bad.push(tok);
  }
  return { list, fixes, bad };
}

/** "1 working days", "Within 4 working Hours" → { value, unit }; missing or without a unit → problem. */
export function parseTat(raw) {
  const s = String(raw || '').trim();
  if (!s) return { problem: 'TAT empty in the sheet' };
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:working\s*)?(hours?|hrs?|days?)/i);
  if (m) return { tat: { value: Number(m[1]), unit: /^h/i.test(m[2]) ? 'hours' : 'days' } };
  return { problem: `TAT “${s}” has no unit (days / hours)` };
}

// ---------- matching rows ----------
/** Which CRM row a SUB1 is: HO matrix row, store or team. */
function matcher() {
  const map = new Map();
  const add = (k, key, label, kind) => k && !map.has(k) && map.set(k, { key, label, kind });
  for (const r of core.hoMatrix()) {
    add(norm(r.row), r.key, r.row, 'ho');
    add(norm(r.match.sub2 || r.match.category), r.key, r.row, 'ho');
  }
  for (const s of db().stores) for (const v of [`store ${s.short}`, s.short, s.name, `${s.code} ${s.short}`, `store ${s.code}`]) add(norm(v), `store:${s.code}`, `Store ${s.code} ${s.short}`, 'contact');
  for (const k of core.CONTACT_TEAMS) add(norm(core.teams()[k].name), `team:${k}`, core.teams()[k].name, 'contact'), add(norm(k), `team:${k}`, core.teams()[k].name, 'contact');
  return (sub1) => map.get(norm(sub1)) || null;
}

const currentStages = (key) => (key.includes(':') ? core.contactRow(key)?.stages : core.hoRow(key)?.stages) || [null, null, null]; // hoRow also finds store-matrix rows
const same = (a = [], b = []) => a.length === b.length && a.every((x) => b.some((y) => y.toLowerCase() === x.toLowerCase()));

/** New stages for a row from the sheet, keeping the CRM's value where the sheet is unclear; with notes. */
function merge(key, sheet) {
  const cur = currentStages(key);
  const notes = [];
  const changes = [];
  const stages = [0, 1, 2].map((i) => {
    const raw = cur[i] || { to: [], cc: [], tat: null };
    const c = { ...raw, to: cleanList(raw.to), cc: cleanList(raw.cc, raw.to) }; // as the CRM sends it (nobody in Cc who is in To)
    const s = sheet.stages[i];
    const L = STAGES[i];
    const to = cleanEmails(s.to);
    const cc = cleanEmails(s.cc);
    for (const f of [...to.fixes, ...cc.fixes]) notes.push(`${L}: corrected ${f}`);
    for (const b of [...to.bad, ...cc.bad]) notes.push(`${L}: “${b}” is not an email — left out`);
    let newTo = to.list;
    if (!newTo.length && c.to?.length) {
      newTo = c.to;
      notes.push(`${L}: SPOC empty in the sheet — kept ${c.to.join(', ')}`);
    }
    const newCc = cc.list.filter((e) => !newTo.some((t) => t.toLowerCase() === e.toLowerCase()));
    const t = parseTat(s.tat);
    let tat = t.tat;
    if (!tat) {
      tat = c.tat || { value: STAGES.indexOf(L) + 1, unit: 'days' };
      notes.push(`${L}: ${t.problem} — kept ${tatText(tat)}${c.tat ? '' : ' (the usual TAT)'}`);
    }
    if (!same(newTo, c.to || [])) changes.push({ stage: L, field: 'To', from: (c.to || []).join(', '), to: newTo.join(', '), yellow: Boolean(s.yellow.to) });
    if (!same(newCc, c.cc || [])) changes.push({ stage: L, field: 'Cc', from: (c.cc || []).join(', '), to: newCc.join(', '), yellow: Boolean(s.yellow.cc) });
    if (!c.tat || c.tat.value !== tat.value || c.tat.unit !== tat.unit) changes.push({ stage: L, field: 'TAT', from: c.tat ? tatText(c.tat) : '', to: tatText(tat), yellow: Boolean(s.yellow.tat) });
    const note = notes.filter((n) => n.startsWith(L + ':')).map((n) => n.slice(L.length + 2)).join('; ');
    return newTo.length ? { to: newTo, cc: newCc, tat, ...(note ? { fixed: note } : {}) } : null;
  });
  return { stages, changes, notes };
}

// ---------- preview / apply / undo ----------
/** Read a sheet and compare it with the CRM. Nothing changes yet. */
export async function preview(bytes, file, by, source = 'upload') {
  const sheets = await readFile(bytes, file);
  const rows = tableRows(sheets) || [];
  const storeRows = storeTableRows(sheets);
  if (!rows.length && !storeRows.length) throw core.fail('No “CRM TABLE” found: the file needs a header row with SUB1, First Time Resolution SPOC, … Level 2 TAT');
  const find = matcher();
  const out = rows.map((r) => {
    const m = find(r.sub1);
    if (!m) return { sub1: r.sub1, status: 'unknown', yellow: r.yellow, sheet: r };
    const { changes, notes } = merge(m.key, r);
    return { sub1: r.sub1, key: m.key, label: m.label, kind: m.kind, status: changes.length ? 'changed' : 'same', changes, notes, yellow: r.yellow, sheet: r };
  });
  for (const r of storeRows) {
    // a row LOTS added to a store tab: not placed automatically (the store matrix rows follow the case master)
    if (r.unknown) out.push({ sub1: r.label, status: 'skipped', kind: 'store', notes: ['Not a row of the CRM’s store matrix: add it on Stores & settings if it is needed'], yellow: r.yellow });
    else {
      const { changes, notes } = merge(r.key, r);
      out.push({ sub1: r.label, key: r.key, label: r.label, kind: 'store', status: changes.length ? 'changed' : 'same', changes, notes, yellow: r.yellow, sheet: r });
    }
  }
  const seen = new Set(out.map((r) => r.key).filter(Boolean));
  const missing = rows.length ? core.hoMatrix().filter((r) => !seen.has(r.key)).map((r) => r.row) : [];
  // store tabs the file doesn't have (e.g. DH 105): those rows are left as they are
  if (storeRows.length)
    for (const s of db().stores)
      for (const t of STORE_TABS) if (!storeRows.some((r) => r.code === s.code && r.tab === t.tab)) missing.push(`${s.code} ${s.short} – ${t.label}`);
  const imp = { id: `MX-${Date.now().toString(36)}`, at: now(), by, file, source, rows: out, missing, status: 'preview' };
  pending.set(imp.id, imp);
  return publicView(imp);
}

const publicView = (imp) => ({ ...imp, rows: imp.rows.map(({ sheet, ...r }) => r) });

/** Rows that need a decision: SUB1 the CRM doesn't know. Choices for the screen. */
export function mappingChoices() {
  return {
    rows: [...core.hoMatrix().map((r) => ({ value: r.key, label: `HO matrix: ${r.row}` })), ...core.contactRows().filter((r) => r.key !== '*').map((r) => ({ value: r.key, label: r.row }))],
    categories: Object.entries(CASE_TREE).flatMap(([type, cats]) => Object.keys(cats).map((cat) => ({ value: `new:${type}|${cat}`, label: `New HO row for ${type} › ${cat}` }))),
  };
}

/**
 * Apply an import: rows with changes are saved (HO rows, store / team rows). `mapping` places the rows
 * the CRM didn't recognise: { [sub1]: rowKey | 'new:<case type>|<category>' | 'skip' }.
 */
export function apply(id, by, mapping = {}) {
  const imp = pending.get(id);
  if (!imp) throw core.fail('This import is no longer open — upload the file again', 404);
  const d = db();
  d.settings ||= {};
  const before = { hoMatrix: structuredClone(d.settings.hoMatrix || {}), escalationRows: structuredClone(d.settings.escalationRows || {}), hoExtra: structuredClone(d.settings.hoExtra || []), storeMatrix: structuredClone(d.settings.storeMatrix || {}), spoc: Object.fromEntries(d.stores.map((s) => [s.code, s.spocEmail || ''])), teamEmail: Object.fromEntries(core.CONTACT_TEAMS.map((k) => [k, d.teams?.[k]?.email || ''])) };
  const stamp = { updatedAt: now(), updatedBy: `${by} · Excel “${imp.file}”` };
  const done = [];
  for (const r of imp.rows) {
    let key = r.key;
    let label = r.label;
    if (r.status === 'unknown') {
      const m = mapping[r.sub1];
      if (!m || m === 'skip') continue;
      if (m.startsWith('new:')) {
        // a new row LOTS inserted (SUB1 not in the CRM): a new HO row for that case-master category
        const [caseType, category] = m.slice(4).split('|');
        key = `x-${norm(r.sub1).slice(0, 30) || Date.now().toString(36)}`;
        d.settings.hoExtra = [...(d.settings.hoExtra || []).filter((x) => x.key !== key), { key, row: r.sub1.trim(), match: { caseType, category }, stages: [null, null, null], addedAt: now(), addedBy: by }];
      } else key = m;
      label = r.sub1;
    }
    if (!key) continue;
    const { stages, changes } = merge(key, r.sheet ?? imp.rows.find((x) => x.sub1 === r.sub1).sheet);
    if (!changes.length && r.status !== 'unknown') continue;
    if (!stages[0] && !key.startsWith('team:') && !key.startsWith('store:')) continue;
    if (parseStoreRowKey(key)) d.settings.storeMatrix = { ...(d.settings.storeMatrix || {}), [key]: { stages, ...stamp } };
    else if (key.includes(':')) {
      d.settings.escalationRows = { ...(d.settings.escalationRows || {}), [key]: { stages, ...stamp } };
      const [kind, code] = key.split(':');
      if (kind === 'store') d.stores.find((x) => x.code === code).spocEmail = stages[0]?.to.join(', ') || '';
      if (kind === 'team') d.teams = { ...(d.teams || {}), [code]: { ...(d.teams?.[code] || {}), email: stages[0]?.to.join(', ') || '' } };
    } else d.settings.hoMatrix = { ...(d.settings.hoMatrix || {}), [key]: { stages, ...stamp } };
    done.push({ key, label, changes: changes.length });
  }
  imp.status = 'applied';
  imp.appliedAt = now();
  imp.appliedBy = by;
  imp.applied = done;
  imp.left = imp.rows.filter((r) => r.status === 'skipped' || (r.status === 'unknown' && (!mapping[r.sub1] || mapping[r.sub1] === 'skip'))).map((r) => r.sub1);
  imp.before = before;
  // history with the matrix as it was before, so the update can be undone (also after a restart)
  d.settings.matrixImports = [{ ...summary(imp), before }, ...(d.settings.matrixImports || []).map((h, i) => (i < 4 ? h : { ...h, before: undefined }))].slice(0, 20);
  store.save();
  pending.delete(id);
  const lines = done.slice(0, 25).map((x) => `• ${x.label}: ${x.changes} change(s)`);
  if (done.length > 25) lines.push(`… and ${done.length - 25} more row(s)`);
  if (imp.left.length) lines.push(`Not recognised (not applied): ${imp.left.join(', ')}`);
  teams.configured() && teams.postCard({ title: `Escalation matrix updated from “${imp.file}”`, subtitle: `${done.length} row(s) changed · by ${by}`, lines }).catch(() => {});
  return summary(imp);
}

const summary = (imp) => ({ id: imp.id, at: imp.at, file: imp.file, source: imp.source, by: imp.by, appliedAt: imp.appliedAt, appliedBy: imp.appliedBy, applied: imp.applied || [], left: imp.left || [], undone: imp.undone || null });

/** Put the matrix back as it was before an import (only the last import applied since the CRM started). */
export function undo(id, by) {
  const d = db();
  const h = (d.settings?.matrixImports || []).find((x) => x.id === id);
  const before = h?.before;
  if (!before || h.undone) throw core.fail('This update can no longer be undone (only the last 5 can, once). Edit the rows by hand.', 400);
  d.settings.hoMatrix = before.hoMatrix;
  d.settings.escalationRows = before.escalationRows;
  d.settings.hoExtra = before.hoExtra;
  if (before.storeMatrix) d.settings.storeMatrix = before.storeMatrix;
  for (const s of d.stores) s.spocEmail = before.spoc[s.code] ?? s.spocEmail;
  for (const k of core.CONTACT_TEAMS) if (d.teams?.[k]) d.teams[k].email = before.teamEmail[k];
  h.undone = { at: now(), by };
  delete h.before;
  store.save();
  return history();
}

/**
 * Automatic: the matrix arrived by email from LOTS (cpwi.in), or the linked Excel changed. Rows the CRM recognises
 * are applied at once; new rows wait on Stores & settings for someone to say where they belong.
 * Returns the summary, or null if the file isn't an escalation matrix. `via` = who / what, e.g. "email from x@cpwi.in".
 */
export async function autoImport(bytes, file, from, source = 'email', via = `email from ${from}`) {
  if (!/\.(xlsx|csv)$/i.test(file)) return null;
  let p;
  try {
    p = await preview(bytes, file, via, source);
  } catch {
    return null; // not an escalation matrix
  }
  const unknown = p.rows.filter((r) => r.status === 'unknown');
  if (!p.rows.some((r) => r.status === 'changed') && !unknown.length) {
    pending.delete(p.id);
    return { applied: [], left: [], unchanged: true };
  }
  const s = apply(p.id, `Automatic (${via})`);
  if (unknown.length) {
    // keep the unrecognised rows open for a decision on the Settings page
    const again = await preview(bytes, file, via, source);
    pending.set(again.id, { ...pending.get(again.id), rows: pending.get(again.id).rows.filter((r) => r.status === 'unknown') });
    s.openId = again.id;
  }
  return s;
}

/** Updates applied, newest first (without the saved copies). */
export const history = () => (db().settings?.matrixImports || []).map(({ before, ...h }) => ({ ...h, canUndo: Boolean(before) && !h.undone }));

/** Imports still waiting for a decision (preview not applied), newest first. */
export const openImports = () => [...pending.values()].reverse().map(publicView);
