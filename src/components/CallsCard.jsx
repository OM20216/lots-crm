import { useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../ui.jsx';

function fmtDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return sec;
  return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
}

function when(v) {
  const d = new Date(v);
  return isNaN(d) ? String(v) : fmtDate(d.toISOString());
}

// SparkTG calls linked to a case: link by transaction id, see outcome, play recording.
export default function CallsCard({ c, onChange }) {
  const [txnId, setTxnId] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function link(id) {
    setErr('');
    setBusy(id);
    try {
      onChange(await api.post(`/cases/${c.id}/calls`, { txnId: id }));
      setTxnId('');
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
  }

  const calls = c.calls || [];
  return (
    <div className="card">
      <h3>Calls (SparkTG)</h3>
      {calls.length === 0 && <div className="muted small">No call linked yet.</div>}
      {calls.map((k) => {
        const i = k.info || {};
        return (
          <div className="call" key={k.txnId}>
            <div className="row between">
              <strong className="small">{k.txnId}</strong>
              <span className={`small ${k.status === 'found' ? '' : 'over'}`}>{k.status === 'found' ? i.disposition || 'found' : k.status}</span>
            </div>
            {k.status === 'found' ? (
              <div className="small muted">
                {[i.direction, i.phone, i.startedAt && when(i.startedAt), i.durationSec != null && fmtDuration(i.durationSec), i.agent && `agent ${i.agent}`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : (
              <div className="small muted">{k.error || 'Fetching from SparkTG…'}</div>
            )}
            {i.recordingUrl && <audio controls preload="none" src={`/api/sparktg/recording/${c.id}/${encodeURIComponent(k.txnId)}`} />}
            {k.status !== 'found' && (
              <button className="btn sm" disabled={!!busy} onClick={() => link(k.txnId)}>
                {busy === k.txnId ? 'Checking…' : 'Refresh'}
              </button>
            )}
          </div>
        );
      })}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (txnId.trim()) link(txnId.trim());
        }}
      >
        <input value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="SparkTG call id" />
        <button className="btn sm" disabled={!!busy}>
          {busy && busy === txnId.trim() ? 'Linking…' : 'Link'}
        </button>
      </form>
      {busy && <div className="muted small">SparkTG can take a few seconds to finalise a call — retrying for up to ~15s.</div>}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
