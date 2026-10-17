import { useState } from 'react';
import { api, currentAgent } from '../api.js';
import { fmtDate, useLoad, useMeta } from '../ui.jsx';

/** Live link to the Excel on OneDrive / SharePoint: the CRM re-reads it when LOTS saves a change. */
function LiveLink({ link, onChange }) {
  const [url, setUrl] = useState('');
  const [every, setEvery] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      setUrl('');
      onChange();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };
  if (!link?.url)
    return (
      <div className="mx-link">
        <strong className="small">Live link to the Excel</strong>
        <span className="muted small"> · LOTS keeps the matrix on OneDrive / SharePoint; the CRM re-reads it whenever they save a change.</span>
        <div className="row wrap">
          <input className="mx-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Share link of the Excel (OneDrive / SharePoint → Share → Copy link)" />
          <span className="small">
            check every <input className="tat" type="number" min="5" value={every} onChange={(e) => setEvery(Number(e.target.value) || 10)} /> min
          </span>
          <button className="btn sm primary" disabled={!url.trim() || busy} onClick={() => run(() => api.put('/matrix-link', { url, every }))}>
            Link
          </button>
        </div>
        {!link?.microsoft && <div className="muted small">Needs the Microsoft 365 sign-in (Automation page, same as the mailbox). You can link now; it starts reading once signed in.</div>}
        {err && <div className="error small">{err}</div>}
      </div>
    );
  return (
    <div className={`mx-link ${link.error ? 'bad' : 'good'}`}>
      <div className="row between wrap">
        <span className="small">
          <strong>🔗 Linked Excel</strong> {link.file && <>· {link.webUrl ? <a href={link.webUrl} target="_blank" rel="noreferrer">{link.file}</a> : link.file}</>} · checked every {link.every} min
          {link.checkedAt && <> · last check {fmtDate(link.checkedAt)}</>}
        </span>
        <span className="row">
          <button className="btn sm" disabled={busy} onClick={() => run(() => api.post('/matrix-link/check', { force: true }))}>
            Read it now
          </button>
          <button className="btn sm" disabled={busy} onClick={() => confirm('Stop reading the linked Excel? The matrix stays as it is.') && run(() => api.del('/matrix-link'))}>
            Unlink
          </button>
        </span>
      </div>
      {link.error ? (
        <div className="error small">⚠ {link.error}</div>
      ) : (
        <div className="muted small">
          {link.modifiedAt && <>Last saved in Excel {fmtDate(link.modifiedAt)}{link.modifiedBy ? ` by ${link.modifiedBy}` : ''} · </>}
          {link.lastResult ? `Last update: ${link.lastResult}${link.lastChangeAt ? ` (${fmtDate(link.lastChangeAt)})` : ''}` : 'Not read yet'}
        </div>
      )}
      {err && <div className="error small">{err}</div>}
    </div>
  );
}

/** Upload LOTS's updated escalation matrix (Excel / CSV): see what changes, apply, undo. */
export default function MatrixImport() {
  const { reloadMeta } = useMeta();
  const [state, reload] = useLoad(() => api.get('/matrix-import'));
  const [prev, setPrev] = useState(null);
  const [mapping, setMapping] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const open = prev || state?.open?.[0] || null;

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/matrix-import?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'x-agent': currentAgent() }, body: file });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read the file');
      setPrev(data);
      setMapping({});
    } catch (e) {
      setMsg('⚠ ' + e.message);
    }
    setBusy(false);
  }

  async function run(fn, done) {
    setBusy(true);
    setMsg('');
    try {
      const out = await fn();
      setMsg(done(out));
      setPrev(null);
      reload();
      reloadMeta();
    } catch (e) {
      setMsg('⚠ ' + e.message);
    }
    setBusy(false);
  }

  const changed = open?.rows.filter((r) => r.status === 'changed') || [];
  const unknown = open?.rows.filter((r) => r.status === 'unknown') || [];
  const same = open?.rows.filter((r) => r.status === 'same') || [];
  const placed = unknown.filter((r) => mapping[r.sub1] && mapping[r.sub1] !== 'skip').length;

  return (
    <div className="mx-import">
      <LiveLink link={state?.link} onChange={() => (reload(), reloadMeta())} />
      <div className="row wrap">
        <label className={`btn sm primary ${busy ? 'disabled' : ''}`}>
          ⬆ Update from Excel
          <input type="file" accept=".xlsx,.csv" hidden disabled={busy} onChange={(e) => (upload(e.target.files[0]), (e.target.value = ''))} />
        </label>
        <span className="muted small">Or upload a copy (.xlsx / .csv): you see every change before it is saved. A sheet emailed from a cpwi.in address is applied by itself.</span>
      </div>
      {msg && <div className="small">{msg}</div>}

      {open && (
        <div className="mx-preview">
          <div className="row between">
            <strong>
              {open.file} {open.source === 'email' && <span className="flag amber">arrived by email</span>}
              {open.source === 'link' && <span className="flag amber">from the linked Excel</span>}
            </strong>
            <span className="muted small">
              {changed.length} row(s) with changes · {same.length} unchanged · {unknown.length} not recognised
            </span>
          </div>
          {changed.map((r) => (
            <div key={r.sub1} className="mx-row">
              <div>
                <strong>{r.label}</strong> <span className="muted small">sheet: {r.sub1}</span>
              </div>
              <table className="table compact mx-changes">
                <tbody>
                  {r.changes.map((c, i) => (
                    <tr key={i}>
                      <td>{c.stage}</td>
                      <td>{c.field}</td>
                      <td className="mx-from">{c.from || '—'}</td>
                      <td>→</td>
                      <td className="mx-to">
                        {c.to || '—'} {c.yellow && <span className="flag amber">yellow in the sheet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.notes?.length > 0 && <div className="hom-flag small">{r.notes.join(' · ')}</div>}
            </div>
          ))}
          {unknown.map((r) => (
            <div key={r.sub1} className="mx-row">
              <div>
                <strong>{r.sub1}</strong> <span className="flag red">not in the CRM</span> {r.yellow && <span className="flag amber">new row (yellow)</span>}
              </div>
              <select value={mapping[r.sub1] || 'skip'} onChange={(e) => setMapping({ ...mapping, [r.sub1]: e.target.value })}>
                <option value="skip">Don't apply this row</option>
                <optgroup label="It is this existing row">
                  {state?.choices?.rows.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="New row for a case type">
                  {state?.choices?.categories.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          ))}
          {open.missing?.length > 0 && <div className="muted small">In the CRM but not in this sheet (left as they are): {open.missing.join(', ')}</div>}
          {!changed.length && !unknown.length && <div className="notice ok small">Nothing changed: the CRM already matches this sheet.</div>}
          <div className="row end">
            <button className="btn sm" onClick={() => setPrev(null)} hidden={!prev}>
              Cancel
            </button>
            <button
              className="btn sm primary"
              disabled={busy || (!changed.length && !placed)}
              onClick={() => run(() => api.post(`/matrix-import/${open.id}/apply`, { mapping }), (s) => `Saved: ${s.applied.length} row(s) updated${s.left.length ? ` · not applied: ${s.left.join(', ')}` : ''}`)}
            >
              Apply {changed.length + placed} row(s)
            </button>
          </div>
        </div>
      )}

      {state?.history?.length > 0 && (
        <details className="mx-history">
          <summary className="small">Updates from Excel ({state.history.length})</summary>
          <table className="table compact">
            <tbody>
              {state.history.slice(0, 10).map((h) => (
                <tr key={h.id}>
                  <td className="small">{fmtDate(h.appliedAt || h.at)}</td>
                  <td className="small">
                    {h.file} · {h.appliedBy}
                  </td>
                  <td className="small">
                    {h.applied.length} row(s){h.left?.length ? ` · not applied: ${h.left.join(', ')}` : ''}
                  </td>
                  <td>
                    {h.undone ? (
                      <span className="muted small">undone by {h.undone.by}</span>
                    ) : !h.canUndo ? null : (
                      <button className="btn sm" disabled={busy} onClick={() => confirm('Put the matrix back as it was before this update?') && run(() => api.post(`/matrix-import/${h.id}/undo`), () => 'Undone')}>
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
