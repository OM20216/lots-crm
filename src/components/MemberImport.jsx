import { useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';

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

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
    setPreview({ members, map: Object.keys(map), unused, file: f.name });
  }

  async function doImport() {
    try {
      const r = await api.post('/members/import', preview.members);
      setResult(r);
      setPreview(null);
      onDone?.();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <section className="card">
      <h2>Import member master (CSV)</h2>
      <p className="muted small">
        Export from your membership system / Excel as CSV. Members already in the CRM (same card no. or mobile) are updated, new ones are added. Needed: a mobile or card number column.
      </p>
      <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} />
      {err && <div className="error">{err}</div>}
      {preview && (
        <div className="notice">
          <strong>{preview.members.length}</strong> rows in {preview.file}. Columns recognised: {preview.map.join(', ')}.
          {preview.unused.length > 0 && <div className="small muted">Ignored columns: {preview.unused.join(', ')}</div>}
          <div className="small">
            First row: {preview.members[0].businessName} · {preview.members[0].phone} · card {preview.members[0].cardNo || '—'} · store {preview.members[0].homeStore || '—'}
          </div>
          <div className="row end">
            <button className="btn" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={doImport}>
              Import {preview.members.length} members
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="notice ok">
          Imported: {result.added} added, {result.updated} updated. {result.total} members in the CRM.
        </div>
      )}
    </section>
  );
}
