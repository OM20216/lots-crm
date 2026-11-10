import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { MISSED_REASONS } from '../taxonomy.js';
import { Due, Empty, Field, Select, fmtDate, useLoad, useMeta } from '../ui.jsx';
import { CallButton } from '../components/Dialer.jsx';
import { mobileError } from '../phone.js';

export default function MissedCalls() {
  const nav = useNavigate();
  const { refreshStats } = useMeta();
  const [list, reload] = useLoad(() => api.get('/missed-calls'));
  const [form, setForm] = useState({ phone: '', reason: MISSED_REASONS[0], at: '' });
  const [showAll, setShowAll] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!form.phone) return;
    await api.post('/missed-calls', { ...form, at: form.at ? new Date(form.at).toISOString() : undefined });
    setForm({ ...form, phone: '', at: '' });
    reload();
    refreshStats();
  }

  async function update(id, body) {
    await api.patch('/missed-calls/' + id, body);
    reload();
    refreshStats();
  }

  const rows = (list || []).filter((m) => showAll || m.status === 'Open');

  return (
    <>
      <div className="page-head">
        <h1>Missed calls</h1>
        <span className="muted">Every missed call must be called back within 30 minutes</span>
      </div>
      <form className="card row wrap" onSubmit={add}>
        <Field label="Phone">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, '').slice(0, 10) })} placeholder="10-digit mobile" />
          {mobileError(form.phone) && <div className="small err">{mobileError(form.phone)}</div>}
        </Field>
        <Field label="Reason">
          <Select value={form.reason} options={MISSED_REASONS} onChange={(v) => setForm({ ...form, reason: v })} />
        </Field>
        <Field label="Missed at (blank = now)">
          <input type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
        </Field>
        <button className="btn primary" disabled={!!mobileError(form.phone) || !form.phone}>Add missed call</button>
      </form>

      <section className="card">
        <div className="row between">
          <h2>{showAll ? 'All missed calls' : 'Open'}</h2>
          <label className="small">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show handled
          </label>
        </div>
        {!list ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No open missed calls. 🎉</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Missed at</th>
                <th>Reason</th>
                <th>TAT</th>
                <th>Attempts</th>
                <th>Status</th>
                <th>Agent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.phone}</strong>
                    <div className="muted small">{m.id}</div>
                  </td>
                  <td>{fmtDate(m.at)}</td>
                  <td className="small">{m.reason}</td>
                  <td>{m.status === 'Open' ? <Due iso={m.dueAt} /> : <span className="small">{fmtDate(m.calledBackAt)}</span>}</td>
                  <td className="small">
                    {m.attempts.map((a, i) => (
                      <div key={i}>
                        {fmtDate(a.at)} · {a.outcome} · {a.by}
                      </div>
                    ))}
                  </td>
                  <td>
                    {m.status}
                    {m.caseId && (
                      <div>
                        <Link to={`/cases/${m.caseId}`}>{m.caseId}</Link>
                      </div>
                    )}
                  </td>
                  <td className="small">{m.assignedTo || '—'}</td>
                  <td>
                    {m.status === 'Open' && (
                      <div className="row wrap">
                        <CallButton phone={m.phone} context={{ missedCallId: m.id }} label="Call back" />
                        <button className="btn primary sm" onClick={() => nav(`/new?phone=${m.phone}&missedId=${m.id}`)}>
                          Log case
                        </button>
                        <button className="btn sm" onClick={() => update(m.id, { attempt: 'Not reachable' })}>
                          Not reachable
                        </button>
                        <button className="btn sm" onClick={() => update(m.id, { attempt: 'No query (wrong / test call)', status: 'No query' })}>
                          No query
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
