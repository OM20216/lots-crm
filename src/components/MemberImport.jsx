import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';
import { isVtiger, norm, vtigerRows } from '../vtigerContacts.js';

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

  function storeCode(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    const hit = stores.find((x) => x.code === s || x.short.toLowerCase() === s || x.name.toLowerCase().includes(s) || s.includes(x.short.toLowerCase()));
    return hit ? hit.code : v;
  }

  async function onFile(e) {
    setErr('');
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const rows = parseCsv((await f.text()).replace(/^﻿/, ''));
    if (rows.length < 2) return setErr('The file has no data rows.');
    const headers = rows[0].map(norm);
    if (isVtiger(headers)) {
      const v = vtigerRows(rows, stores);
      return setPreview({ ...v, file: f.name, vtiger: true, noNumber: v.members.filter((m) => !m.phone && !m.cardNo).length });
    }
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
    const unused = rows[0].filter((_, i) => !Object.values(map).includes(i));
    setPreview({ members, map: Object.keys(map), unused, file: f.name, noNumber: members.filter((m) => !m.phone && !m.cardNo).length });
  }

  const [progress, setProgress] = useState(null);
  async function doImport() {
    const list = preview.members;
    const sum = { added: 0, updated: 0, noNumber: 0, skipped: 0, skippedRows: [], total: 0 };
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        setProgress({ done: i, of: list.length });
        const r = await api.post('/members/import', list.slice(i, i + BATCH));
        for (const k of ['added', 'updated', 'noNumber', 'skipped']) sum[k] += r[k] || 0;
        sum.skippedRows = [...sum.skippedRows, ...r.skippedRows].slice(0, 50);
        sum.total = r.total;
      }
      setResult(sum);
      setPreview(null);
      onDone?.();
    } catch (e2) {
      setErr(`${e2.message}. ${sum.added + sum.updated} contacts were saved before this; import the file again to continue (saved ones are updated, not doubled).`);
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className="card">
      <h2>Import contacts</h2>
      <VtigerImport onDone={onDone} />
      <h3 className="vt-or">Or from a CSV file</h3>
      <p className="muted small">
        A Vtiger Contacts export (every field comes in) or a member master from Excel, as CSV. Contacts already in the CRM (same Vtiger contact, card no. or mobile) are updated, new ones are added. Large files are sent in parts of {BATCH.toLocaleString('en-IN')}.
      </p>
      <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} />
      {err && <div className="error">{err}</div>}
      {preview && (
        <div className="notice">
          <strong>{preview.members.length.toLocaleString('en-IN')}</strong> contacts in {preview.file}
          {preview.vtiger ? ' (Vtiger export)' : ''}. Columns recognised: {preview.map.join(', ')}.
          {preview.noNumber > 0 && <div className="small">{preview.noNumber.toLocaleString('en-IN')} have no valid mobile or card number (e.g. “?????”) and will be left out.</div>}
          {preview.unused.length > 0 && <div className="small muted">Ignored columns: {preview.unused.join(', ')}</div>}
          <div className="small">
            First row: {preview.members[0].businessName} · {preview.members[0].phone} · card {preview.members[0].cardNo || '—'} · store {preview.members[0].homeStore || '—'}
          </div>
          <div className="row end">
            <button className="btn" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={doImport} disabled={!!progress}>
              {progress ? `Importing… ${progress.done.toLocaleString('en-IN')} of ${progress.of.toLocaleString('en-IN')}` : `Import ${(preview.members.length - preview.noNumber).toLocaleString('en-IN')} contacts`}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="notice ok">
          Imported: {result.added.toLocaleString('en-IN')} added, {result.updated.toLocaleString('en-IN')} updated
          {result.noNumber > 0 ? `, ${result.noNumber.toLocaleString('en-IN')} left out (no valid mobile or card no.)` : ''}. {result.total.toLocaleString('en-IN')} contacts in the CRM.
          {result.skipped > 0 && (
            <div className="error">
              {result.skipped} row(s) skipped because their number already belongs to another contact:
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
