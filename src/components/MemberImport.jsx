import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';
import { isContactForm, isVtiger, mergeRepeats, norm, vtigerRows } from '../vtigerContacts.js';

// Column names seen in member-master exports → CRM fields.
const ALIASES = {
  businessName: ['business name', 'business', 'firm name', 'firm', 'shop name', 'company', 'company name', 'customer name', 'trade name'],
  ownerName: ['owner name', 'owner', 'contact person', 'name', 'member name', 'proprietor'],
  phone: ['mobile', 'mobile no', 'mobile number', 'phone', 'phone no', 'contact no', 'contact number', 'registered mobile'],
  altPhone: ['alternate mobile', 'alt mobile', 'alternate phone', 'landline', 'phone 2'],
  email: ['email', 'email id', 'e-mail', 'mail'],
  cardNo: ['card no', 'card number', 'membership no', 'membership number', 'member id', 'member no', 'card', 'customer id', 'customer code'],
  gstin: ['gstin', 'gst', 'gst no', 'gst number'],
  licenceType: ['licence', 'license', 'licence type', 'license type', 'document type'],
  customerGroup: ['customer group', 'group', 'segment', 'channel'],
  customerType: ['customer type', 'type', 'sub segment', 'business type'],
  homeStore: ['store', 'home store', 'store code', 'store name', 'registered store', 'site'],
  address: ['address', 'business address', 'registered address'],
  status: ['status', 'card status'],
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const BATCH = 2000; // contacts per request (lakhs of contacts are sent in parts)

const n = (v) => Number(v || 0).toLocaleString('en-IN');

// Vtiger contacts straight from Vtiger (the server reads them with the access key in the private secrets file).
function VtigerImport({ onDone }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const load = () =>
    api
      .get('/vtiger')
      .then(setInfo)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  const job = info?.job;
  const running = info?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (job?.status === 'done') onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);
  async function act(path, body) {
    setErr('');
    try {
      await api.post(path, body || {});
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  if (!info) return null;
  if (!info.configured)
    return (
      <div className="notice small">
        <strong>Import from Vtiger:</strong> not set up. Add VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY to the private secrets file on the CRM computer.
      </div>
    );
  const read = (job?.read || 0) + (job?.reading || 0);
  const pct = job?.total ? Math.min(100, Math.round((read / job.total) * 100)) : 0;
  const canContinue = job && ['stopped', 'error', 'done'].includes(job.status) && job.lastId;
  return (
    <div className="vt-import">
      <div className="row between">
        <strong>Import from Vtiger</strong>
        <span className="muted small">{job?.total ? `${n(job.total)} contacts in Vtiger` : 'Reads every contact from Vtiger, 200 at a time'}</span>
      </div>
      {job && (
        <>
          <div className="vt-bar">
            <div style={{ width: pct + '%' }} />
          </div>
          <div className="small">
            {running ? 'Importing… ' : job.status === 'done' ? 'Finished. ' : job.status === 'stopped' ? 'Stopped. ' : job.status === 'error' ? 'Stopped by an error. ' : ''}
            {n(read)} of {n(job.total)} read ({pct}%) · {n(job.added)} added · {n(job.updated)} updated · {n(job.noNumber)} without a mobile or card no.
            {job.skipped > 0 && ` · ${n(job.skipped)} skipped (number already belongs to another contact)`}
          </div>
          {job.error && <div className="error">{job.error}</div>}
          {job.skippedRows?.length > 0 && (
            <details className="small">
              <summary>Skipped contacts (first {job.skippedRows.length})</summary>
              <ul className="tight">
                {job.skippedRows.map((r, i) => (
                  <li key={i}>
                    {r.row}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {err && <div className="error">{err}</div>}
      <div className="row end">
        {running ? (
          <button className="btn" onClick={() => act('/vtiger/import/stop')}>
            Stop
          </button>
        ) : (
          <>
            {canContinue && (
              <button className="btn primary" onClick={() => act('/vtiger/import')}>
                {job.status === 'done' ? 'Get new contacts from Vtiger' : `Continue from ${n(job.read)}`}
              </button>
            )}
            <button
              className={canContinue ? 'btn' : 'btn primary'}
              onClick={() => (!job || window.confirm('Read all contacts from Vtiger again from the start? Contacts already in the CRM are updated, not doubled.')) && act('/vtiger/import', { fresh: true })}
            >
              {job ? 'Import again from the start' : 'Import all contacts from Vtiger'}
            </button>
          </>
        )}
      </div>
      <div className="muted small">Runs on the CRM server (about an hour for 3 lakh contacts); you can close this page. Contacts already in the CRM (same Vtiger contact, card no. or mobile) are updated, not doubled.</div>
    </div>
  );
}

export default function MemberImport({ onDone }) {
  const { stores } = useMeta();
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState(null);

  function storeCode(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    const hit = stores.find((x) => x.code === s || x.short.toLowerCase() === s || x.name.toLowerCase().includes(s) || s.includes(x.short.toLowerCase()));
    return hit ? hit.code : v;
  }

  // the file's contacts, in parts, through the server's import: dryRun = only count (the preview), otherwise save
  async function send(list, dryRun) {
    const sum = { added: 0, updated: 0, noNumber: 0, skipped: 0, skippedRows: [], casesLinked: 0, total: 0 };
    for (let i = 0; i < list.length; i += BATCH) {
      setProgress({ done: i, of: list.length, dryRun });
      const r = await api.post('/members/import' + (dryRun ? '?dryRun=1' : ''), list.slice(i, i + BATCH));
      for (const k of ['added', 'updated', 'noNumber', 'skipped', 'casesLinked']) sum[k] += r[k] || 0;
      sum.skippedRows = [...sum.skippedRows, ...(r.skippedRows || [])].slice(0, 50);
      sum.total = r.total;
    }
    return sum;
  }

  async function onFile(e) {
    setErr('');
    setResult(null);
    setPreview(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const rows = parseCsv((await f.text()).replace(/^﻿/, ''));
    if (rows.length < 2) return setErr('The file has no data rows.');
    const headers = rows[0].map(norm);
    let read;
    if (isContactForm(headers)) {
      // laid out like the contact form (a Vtiger export or LOTS's own sheet): every field of the contact is filled in
      read = { ...vtigerRows(rows, stores), form: true, vtiger: isVtiger(headers) };
    } else {
      const map = {};
      for (const [field, names] of Object.entries(ALIASES)) {
        const idx = headers.findIndex((h) => names.includes(h));
        if (idx >= 0) map[field] = idx;
      }
      if (map.phone === undefined && map.cardNo === undefined) return setErr('Could not find a mobile or card number column. Rename the header to “Mobile” or “Card No”.');
      const members = rows.slice(1).map((r) => {
        const m = Object.fromEntries(Object.entries(map).map(([field, i]) => [field, (r[i] || '').trim()]));
        if (m.homeStore) m.homeStore = storeCode(m.homeStore);
        if (m.status) m.status = /block|inactive|cancel/i.test(m.status) ? 'Blocked' : 'Active';
        if (!m.businessName) m.businessName = m.ownerName || '';
        return m;
      });
      read = { members, map: Object.keys(map), unused: rows[0].filter((_, i) => !Object.values(map).includes(i)) };
    }
    // the same contact twice in the file becomes one contact
    const { members, repeats } = mergeRepeats(read.members);
    const base = { ...read, members, rows: read.members.length, repeats, file: f.name };
    setPreview({ ...base, checking: true });
    try {
      // what would happen, checked against the CRM before anything is saved
      const check = await send(members, true);
      setPreview({ ...base, check });
    } catch (e2) {
      setPreview(null);
      setErr(e2.message);
    } finally {
      setProgress(null);
    }
  }

  async function doImport() {
    let sum = null;
    try {
      sum = await send(preview.members, false);
      setResult({ ...sum, repeats: preview.repeats });
      setPreview(null);
      onDone?.();
    } catch (e2) {
      setErr(`${e2.message}. Contacts sent before this were saved; import the file again to continue (saved ones are updated, not doubled).`);
    } finally {
      setProgress(null);
    }
  }

  const n = (v) => Number(v || 0).toLocaleString('en-IN');
  const c = preview?.check;
  return (
    <section className="card">
      <h2>Import contacts</h2>
      <VtigerImport onDone={onDone} />
      <h3 className="vt-or">Or from a CSV file</h3>
      <p className="muted small">
        A Vtiger Contacts export or a sheet with the contact form's column names (every field comes in), or a simple member list. <strong>No duplicates:</strong> a contact already in the CRM (same Vtiger contact, membership card no., or mobile when there is no card no.) is updated, not added again, and the same contact twice in the file becomes one. You see what will happen before anything is saved. Cases logged earlier with the contact's mobile, email or card no. are attached to it.
      </p>
      <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} disabled={!!progress} />
      {err && <div className="error">{err}</div>}
      {preview && (
        <div className="notice">
          <div>
            <strong>{n(preview.rows)}</strong> rows in {preview.file}
            {preview.vtiger ? ' (Vtiger export)' : preview.form ? ' (contact form columns: every field filled in)' : ''}.
          </div>
          {preview.repeats > 0 && <div className="small">{n(preview.repeats)} rows were the same contact again in this file (same Vtiger contact, card no., or mobile without a card no.): merged into one; the first row is kept, later ones only fill in empty fields.</div>}
          {preview.checking ? (
            <div className="small">Checking against the CRM… {progress ? `${n(progress.done)} of ${n(progress.of)}` : ''}</div>
          ) : (
            c && (
              <div className="imp-check">
                <span className="ok">{n(c.added)} new</span>
                <span>{n(c.updated)} already in the CRM: will be updated, not doubled</span>
                {c.skipped > 0 && <span className="bad">{n(c.skipped)} skipped (number or card no. belongs to another contact)</span>}
                {c.noNumber > 0 && <span className="muted">{n(c.noNumber)} left out: no valid mobile or card no.</span>}
              </div>
            )
          )}
          {c?.skippedRows?.length > 0 && (
            <details className="small">
              <summary>Rows that will be skipped (first {c.skippedRows.length})</summary>
              <ul className="tight">
                {c.skippedRows.map((r, i) => (
                  <li key={i}>
                    {r.row}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="small muted">Columns recognised: {preview.map.join(', ')}.</div>
          {preview.unused.length > 0 && <div className="small muted">Ignored columns: {preview.unused.join(', ')}</div>}
          <div className="row end">
            <button className="btn" onClick={() => setPreview(null)} disabled={!!progress}>
              Cancel
            </button>
            <button className="btn primary" onClick={doImport} disabled={!!progress || !c || c.added + c.updated === 0}>
              {progress && !progress.dryRun ? `Importing… ${n(progress.done)} of ${n(progress.of)}` : c ? `Import: ${n(c.added)} new, ${n(c.updated)} updated` : 'Checking…'}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="notice ok">
          Imported: {n(result.added)} added, {n(result.updated)} updated (no duplicates)
          {result.repeats > 0 ? `, ${n(result.repeats)} repeated rows merged` : ''}
          {result.noNumber > 0 ? `, ${n(result.noNumber)} left out (no valid mobile or card no.)` : ''}. {n(result.casesLinked)} earlier case(s) attached to their contact. {n(result.total)} contacts in the CRM.
          {result.skipped > 0 && (
            <div className="error">
              {n(result.skipped)} row(s) skipped because their number or card no. already belongs to another contact:
              <ul className="tight">
                {result.skippedRows.map((r, i) => (
                  <li key={i}>
                    {r.row}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
