import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, useMeta } from '../ui.jsx';
import MatrixImport from './MatrixImport.jsx';
import { shownText } from '../storeMatrix.js';
import { CASE_TREE } from '../taxonomy.js';

const caseOf = (m) => [m.caseType, m.category, m.sub2].filter(Boolean).join(' › ');
const tatOf = (t) => `${t.value} working ${t.unit === 'hours' ? 'hour' : 'day'}${t.value > 1 ? 's' : ''}`;
const STAGE_DAYS = [1, 2, 3]; // empty level in the editor starts with the Excel's usual TAT (1 / 2 / 3 working days)

// One stage being edited: To, Cc, TAT
function StageEdit({ s, set, fixedTo }) {
  return (
    <td>
      {fixedTo ? (
        <div className="muted small">{fixedTo}</div>
      ) : (
        <>
          <textarea rows={2} value={s.to} onChange={(e) => set({ to: e.target.value })} placeholder="To (SPOC emails, comma separated)" />
          <textarea rows={3} value={s.cc} onChange={(e) => set({ cc: e.target.value })} placeholder="Cc (escalation list)" />
          <span className="small">
            TAT <input className="tat" type="number" min="1" value={s.value} onChange={(e) => set({ value: Number(e.target.value) || 1 })} />
            <select value={s.unit} onChange={(e) => set({ unit: e.target.value })}>
              <option value="days">working days</option>
              <option value="hours">working hours</option>
            </select>
          </span>
        </>
      )}
    </td>
  );
}

/**
 * One row of an escalation matrix: First Time Resolution, Level 1, Level 2 with To / Cc / TAT, Edit, Sample to Teams.
 * `base` = API path ('/ho-matrix' or '/escalation-rows'); `isDefault` = the stores / teams default row (no First Time Resolution).
 */
function MatrixRow({ r, base, sub, isDefault, resetLabel, resetAsk, onSaved }) {
  const { integrations } = useMeta();
  const init = () => [0, 1, 2].map((i) => {
    const s = r.stages[i];
    return { to: s?.to?.join(', ') || '', cc: s?.cc?.join(', ') || '', value: s?.tat?.value || STAGE_DAYS[i], unit: s?.tat?.unit || 'days' };
  });
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(fn, ok) {
    setBusy(true);
    setMsg('');
    try {
      const out = await fn();
      if (ok) setMsg(ok(out));
      setEdit(null);
      onSaved();
    } catch (e) {
      setMsg('⚠ ' + e.message);
    }
    setBusy(false);
  }
  const save = () => run(() => api.put(`${base}/${encodeURIComponent(r.key)}`, { stages: edit.map((s) => ({ to: s.to, cc: s.cc, tat: { value: s.value, unit: s.unit } })) }), () => 'Saved');
  return (
    <tr className={r.edited ? 'hom-edited' : ''}>
      <td>
        <strong>{r.row}</strong>
        {sub && <div className="muted small">{sub}</div>}
        {r.edited && r.updatedBy && <div className="small hom-flag">Changed by {r.updatedBy}, {fmtDate(r.updatedAt)}</div>}
        <div className="row wrap hom-actions">
          {!edit && (
            <button className="btn sm primary" onClick={() => setEdit(init())}>
              Edit
            </button>
          )}
          {!edit && !isDefault && integrations?.teamsPreview && (
            <button className="btn sm" disabled={busy} title="Posts this row's First Time Resolution, Level 1 and Level 2 emails for a sample case" onClick={() => run(() => api.post(`${base}/${encodeURIComponent(r.key)}/sample`), (o) => `${o.count} sample emails posted to Teams`)}>
              Sample to Teams
            </button>
          )}
          {!edit && r.edited && (
            <button className="btn sm" disabled={busy} onClick={() => confirm(resetAsk) && run(() => api.del(`${base}/${encodeURIComponent(r.key)}`), () => 'Done')}>
              {resetLabel}
            </button>
          )}
        </div>
        {msg && <div className="small">{msg}</div>}
      </td>
      {edit ? (
        <>
          {edit.map((s, i) => (
            <StageEdit key={i} s={s} fixedTo={isDefault && i === 0 ? 'Each store’s / team’s own row' : ''} set={(p) => setEdit(edit.map((x, j) => (j === i ? { ...x, ...p } : x)))} />
          ))}
          <td>
            <div className="col">
              <button className="btn sm primary" disabled={busy} onClick={save}>
                Save
              </button>
              <button className="btn sm" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          {[0, 1, 2].map((i) => {
            const s = r.stages[i];
            if (isDefault && i === 0) return <td key={i} className="small muted">Each store’s / team’s own row</td>;
            if (!s || !s.to.length)
              return (
                <td key={i} className="small">
                  <span className="over">not set</span>
                  {i > 0 && !isDefault && <div className="muted">uses the default row</div>}
                </td>
              );
            return (
              <td key={i} className="small">
                <div className="hom-to">{s.to.join(', ')}</div>
                {s.cc.length > 0 && <div className="muted">cc {s.cc.join(', ')}</div>}
                <div className="hom-tat">TAT {tatOf(s.tat)}</div>
                {s.toConfirm && <div className="hom-flag">⚠ To confirm with LOTS: {s.toConfirm}</div>}
                {s.fixed && <div className="hom-flag">✎ {s.fixed}</div>}
              </td>
            );
          })}
          <td />
        </>
      )}
    </tr>
  );
}

const Head = ({ first }) => (
  <thead>
    <tr>
      <th>{first}</th>
      <th>First Time Resolution</th>
      <th>Level 1</th>
      <th>Level 2</th>
      <th></th>
    </tr>
  </thead>
);

/** HO escalation matrix (LOTS sheet): per case type, First Time Resolution → Level 1 → Level 2. */
export default function HoMatrixCard() {
  const { hoMatrix, workHours, reloadMeta } = useMeta();
  const [hours, setHours] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState('');
  const [newCaseType, setNewCaseType] = useState(Object.keys(CASE_TREE)[0] || '');
  const [newCategory, setNewCategory] = useState('');
  const [addErr, setAddErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!hoMatrix) return null;
  const wh = hours || workHours || { start: '09:00', end: '21:00' };
  const caseTypes = Object.keys(CASE_TREE);
  const categories = newCaseType ? Object.keys(CASE_TREE[newCaseType] || {}) : [];
  async function addRow(e) {
    e.preventDefault();
    setBusy(true);
    setAddErr('');
    try {
      await api.post('/ho-matrix/add', { row: newRow.trim(), caseType: newCaseType, category: newCategory });
      setNewRow('');
      setAdding(false);
      reloadMeta();
    } catch (e2) {
      setAddErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="row between">
        <h2>Escalation matrix (HO)</h2>
        <div className="row">
          <button className="btn sm" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add row'}</button>
          <Link className="btn sm" to="/escalation-flow">
            See as flow chart
          </Link>
        </div>
      </div>
      <p className="muted small">
        From <strong>{hoMatrix.source}</strong>. A case of these types is escalated to the <strong>First Time Resolution</strong> SPOC with the listed people in copy. If it is not resolved within the TAT, it goes to <strong>Level 1</strong>, then <strong>Level 2</strong>, automatically, each with its own SPOC, copy list and TAT
        (counted from when the case reaches that level). After Level 2's TAT, a reminder goes to Level 2 every working day. TATs count Monday–Saturday, without holidays.
      </p>
      <p className="muted small">Store, membership, app, e-commerce and BDA cases use the store matrix below; the rest use the store / team rows.</p>
      {adding && (
        <form className="row wrap" onSubmit={addRow} style={{ margin: '8px 0' }}>
          <input placeholder="Row name" value={newRow} onChange={(e) => setNewRow(e.target.value)} required />
          <select value={newCaseType} onChange={(e) => { setNewCaseType(e.target.value); setNewCategory(Object.keys(CASE_TREE[e.target.value] || {})[0] || ''); }}>
            {caseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn sm primary" disabled={busy || !newRow.trim()}>{busy ? 'Adding…' : 'Add'}</button>
          {addErr && <span className="error small">{addErr}</span>}
        </form>
      )}
      <MatrixImport />
      <div className="row small hom-hours">
        Working hours for TATs in hours:
        <input type="time" value={wh.start} onChange={(e) => setHours({ ...wh, start: e.target.value })} />–
        <input type="time" value={wh.end} onChange={(e) => setHours({ ...wh, end: e.target.value })} />
        {hours && (
          <button
            className="btn sm primary"
            onClick={() =>
              api
                .put('/work-hours', hours)
                .then(() => (setHours(null), setErr(''), reloadMeta()))
                .catch((e) => setErr(e.message))
            }
          >
            Save
          </button>
        )}
        {err && <span className="error">{err}</span>}
      </div>
      <div className="table-wrap">
        <table className="table hom-table">
          <Head first="Case type (sheet row)" />
          <tbody>
            {hoMatrix.rows.map((r) => (
              <MatrixRow key={r.key + (r.updatedAt || '')} r={r} base="/ho-matrix" sub={caseOf(r.match)} resetLabel="Back to the sheet" resetAsk={`Put “${r.row}” back as in the sheet?`} onSaved={reloadMeta} />
            ))}
          </tbody>
        </table>
      </div>
      {hoMatrix.crisis && (
        <div className="notice small">
          <strong>{hoMatrix.crisis.title}:</strong> {hoMatrix.crisis.people.join(', ')} · {hoMatrix.crisis.emails.join(', ')} <span className="muted">(from the sheet; contact them yourself, the CRM does not email them)</span>
        </div>
      )}
    </section>
  );
}

/** Stores and teams: same three stages; First Time Resolution = the store's / team's own email. */
export function ContactMatrixCard() {
  const { contactMatrix = [], reloadMeta } = useMeta();
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState('');
  const [addErr, setAddErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function addRow(e) {
    e.preventDefault();
    setBusy(true);
    setAddErr('');
    try {
      await api.post('/escalation-rows/add', { row: newRow.trim() });
      setNewRow('');
      setAdding(false);
      reloadMeta();
    } catch (e2) {
      setAddErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="row between">
        <h2>Escalation matrix – stores &amp; teams</h2>
        <button className="btn sm" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add row'}</button>
      </div>
      <p className="muted small">
        For the cases neither matrix covers (General Query, Festive Gifting, …), and for a store matrix case whose store isn’t set. Same as the HO matrix: the case goes to the store's / team's <strong>First Time Resolution</strong> email, then automatically to <strong>Level 1</strong> and <strong>Level 2</strong> when each TAT passes, each with
        its own To, Cc and TAT. After Level 2, a reminder every working day. A store or team without its own Level 1 / Level 2 uses the <strong>Default</strong> row. Press <strong>Edit</strong> to change any email or TAT; it applies at once, also to cases already escalated.
      </p>
      <p className="muted small">Refunds and new suppliers keep the SOP's 7 working days at First Time Resolution when that is longer than the row's TAT.</p>
      {adding && (
        <form className="row wrap" onSubmit={addRow} style={{ margin: '8px 0' }}>
          <input placeholder="Row name" value={newRow} onChange={(e) => setNewRow(e.target.value)} required />
          <button className="btn sm primary" disabled={busy || !newRow.trim()}>{busy ? 'Adding…' : 'Add'}</button>
          {addErr && <span className="error small">{addErr}</span>}
        </form>
      )}
      <div className="table-wrap">
        <table className="table hom-table">
          <Head first="Store / team" />
          <tbody>
            {contactMatrix.map((r) => (
              <MatrixRow
                key={r.key + (r.updatedAt || '') + JSON.stringify(r.stages)}
                r={r}
                base="/escalation-rows"
                isDefault={r.key === '*'}
                sub={r.key === '*' ? 'Level 1 / Level 2 for every store and team that has none of its own' : ''}
                resetLabel="Clear Cc and levels"
                resetAsk={`Clear the copy lists and levels of “${r.row}”? Its email stays.`}
                onSaved={reloadMeta}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Store escalation matrix (LOTS workbook, one tab per store and kind): pick a store and a tab; each row has its own
 * First Time Resolution, Level 1 and Level 2. Store, membership, app, e-commerce and BDA cases go to their row.
 */
export function StoreMatrixCard() {
  const { stores, reloadMeta } = useMeta();
  const [code, setCode] = useState(stores[0]?.code || '101');
  const [tab, setTab] = useState('app');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState('');
  const [addErr, setAddErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    api
      .get(`/store-matrix?store=${code}`)
      .then((d) => (setData(d), setErr('')))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  async function addRow(e) {
    e.preventDefault();
    setBusy(true);
    setAddErr('');
    try {
      await api.post('/store-matrix/add', { store: code, tab, row: newRow.trim() });
      setNewRow('');
      setAdding(false);
      load();
      reloadMeta();
    } catch (e2) {
      setAddErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.rows || []).filter((r) => r.tab === tab);
  const confirm = rows.find((r) => r.toConfirm)?.toConfirm;
  const note = rows.find((r) => r.note)?.note;
  return (
    <section className="card">
      <div className="row between">
        <h2>Escalation matrix – stores (per store and kind)</h2>
        <button className="btn sm" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add row'}</button>
      </div>
      <p className="muted small">
        From LOTS's workbook <strong>{data?.source || '…'}</strong>: one table per store for <strong>App</strong>, <strong>Ecommerce</strong>, <strong>BDA</strong> and <strong>Store related</strong>. A case goes to the row of its category ›
        sub-category › sub-category 2, for its store (membership: the member's home store), then to Level 1 and Level 2 by itself when each TAT passes. <strong>Edit</strong> changes a row at once, also for cases already escalated; the
        workbook (upload or live link above) updates them too.
      </p>
      {adding && (
        <form className="row wrap" onSubmit={addRow} style={{ margin: '8px 0' }}>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {stores.map((s) => <option key={s.code} value={s.code}>{s.code} {s.short}</option>)}
          </select>
          <select value={tab} onChange={(e) => setTab(e.target.value)}>
            <option value="app">App</option>
            <option value="web">Ecommerce</option>
            <option value="bda">BDA</option>
            <option value="store">Store related</option>
          </select>
          <input placeholder="Row name" value={newRow} onChange={(e) => setNewRow(e.target.value)} required />
          <button className="btn sm primary" disabled={busy || !newRow.trim()}>{busy ? 'Adding…' : 'Add'}</button>
          {addErr && <span className="error small">{addErr}</span>}
        </form>
      )}
      <div className="row wrap small hom-hours">
        Store
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          {stores.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} {s.short} – {s.name}
            </option>
          ))}
        </select>
        {(data?.tabs || []).map((t) => (
          <button key={t.tab} className={`btn sm ${tab === t.tab ? 'primary' : ''}`} onClick={() => setTab(t.tab)}>
            {t.label}
          </button>
        ))}
      </div>
      {err && <div className="error small">{err}</div>}
      {confirm && <div className="notice small hom-flag">⚠ To confirm with LOTS: {confirm}</div>}
      {note && !confirm && <div className="notice small">ⓘ {note}</div>}
      <div className="table-wrap">
        <table className="table hom-table">
          <Head first="Sheet row (SUB1 / SUB 2)" />
          <tbody>
            {rows.map((r) => (
              <MatrixRow
                key={r.key + (r.updatedAt || '')}
                r={{ ...r, row: shownText(r.sheet[0]) }}
                base="/store-matrix"
                sub={r.sheet[1] !== r.sheet[0] ? shownText(r.sheet[1]) : ''}
                resetLabel="Back to the workbook"
                resetAsk={`Put “${r.row}” back as in the workbook?`}
                onSaved={() => (load(), reloadMeta())}
              />
            ))}
            {data && !rows.length && (
              <tr>
                <td colSpan={5} className="muted small">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
