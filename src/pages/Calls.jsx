import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Select, useLoad, useMeta } from '../ui.jsx';
import { CallButton } from '../components/Dialer.jsx';

const today = () => new Date().toLocaleDateString('en-CA');
const dur = (s) => (s == null || s === '' ? '—' : `${Math.floor(Number(s) / 60)}:${String(Math.round(Number(s) % 60)).padStart(2, '0')}`);
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA');
// quick ranges for the call history
const RANGES = [
  ['Today', () => ({ from: today(), to: today() })],
  ['Last 7 days', () => ({ from: daysAgo(6), to: today() })],
  ['Last 30 days', () => ({ from: daysAgo(29), to: today() })],
  ['All', () => ({ from: '', to: '' })],
];

// Call logs: every call taken or made through the CRM (SparkTG dialer and call events), with its recording.
export default function Calls() {
  const { agents } = useMeta();
  const [f, setF] = useState({ from: '', to: '', q: '', agent: '', direction: '', outcome: '', recording: '' });
  const [search, setSearch] = useState('');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const [page, reload] = useLoad(() => api.get('/calls?' + qs), [qs]);
  const [more, setMore] = useState([]);
  useEffect(() => setMore([]), [page]);
  const list = page ? [...page.calls, ...more] : null;
  async function loadMore() {
    const r = await api.get('/calls?' + qs + (qs ? '&' : '') + 'offset=' + list.length);
    setMore((m) => [...m, ...r.calls]);
  }
  const range = new URLSearchParams(Object.entries({ from: f.from, to: f.to }).filter(([, v]) => v)).toString();
  const [stats] = useLoad(() => api.get('/calls/stats?' + range), [range, page]);
  const [raw, setRaw] = useState(null);
  const active = RANGES.find(([, r]) => r().from === f.from && r().to === f.to)?.[0];

  const s = stats?.all;
  return (
    <>
      <div className="page-head">
        <h1>Call logs</h1>
        <div className="head-actions">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setF({ ...f, q: search.trim() });
            }}
          >
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, name, agent or case no.…" />
          </form>
          <button className="btn" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>

      {s && (
        <div className="tiles">
          <div className="tile">
            <div className="tile-value">{s.total}</div>
            <div className="tile-label">{active === 'Today' ? 'Calls today' : active === 'All' || !active ? 'Calls' : `Calls · ${active.toLowerCase()}`}</div>
            <div className="tile-sub">
              {s.inbound} in · {s.outbound} out
            </div>
          </div>
          <div className="tile">
            <div className="tile-value">{s.connected}</div>
            <div className="tile-label">Connected</div>
            <div className="tile-sub">avg talk {dur(s.avgTalkSec)}</div>
          </div>
          <div className={`tile ${s.notConnected ? 'alert' : ''}`}>
            <div className="tile-value">{s.notConnected}</div>
            <div className="tile-label">Not connected</div>
            <div className="tile-sub">Missed inbound go to Missed calls</div>
          </div>
          <div className="tile">
            <div className="tile-value">{s.withCase}</div>
            <div className="tile-label">Linked to a case</div>
          </div>
        </div>
      )}

      {stats && Object.keys(stats.byAgent).length > 0 && (
        <section className="card">
          <h3>By agent</h3>
          <table className="table compact">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Calls</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th>Outbound target (SOP 80–100 / day)</th>
                <th className="num">Connected</th>
                <th className="num">Not connected</th>
                <th className="num">With case</th>
                <th className="num">Avg talk</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.byAgent).map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="num">{b.total}</td>
                  <td className="num">{b.inbound}</td>
                  <td className="num">{b.outbound}</td>
                  <td>
                    <div className={`target ${b.outbound >= 80 ? 'met' : ''}`} title={`${b.outbound} of 80–100 outbound calls`}>
                      <span style={{ width: `${Math.min(100, (b.outbound / 80) * 100)}%` }} />
                    </div>
                    <span className="small muted">{b.outbound >= 80 ? (b.outbound > 100 ? 'above target' : 'target met') : `${80 - b.outbound} to go`}</span>
                  </td>
                  <td className="num">{b.connected}</td>
                  <td className="num">{b.notConnected}</td>
                  <td className="num">{b.withCase}</td>
                  <td className="num">{dur(b.avgTalkSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="card filters">
        <div className="seg">
          {RANGES.map(([label, r]) => (
            <button key={label} type="button" className={active === label ? 'on' : ''} onClick={() => setF({ ...f, ...r() })}>
              {label}
            </button>
          ))}
        </div>
        <label className="row small">
          From <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </label>
        <label className="row small">
          To <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </label>
        <Select value={f.agent} options={agents} onChange={(v) => setF({ ...f, agent: v })} placeholder="All agents" />
        <Select
          value={f.direction}
          options={[
            { value: 'inbound', label: 'Inbound' },
            { value: 'outbound', label: 'Outbound' },
          ]}
          onChange={(v) => setF({ ...f, direction: v })}
          placeholder="Both directions"
        />
        <Select
          value={f.outcome}
          options={[
            { value: 'connected', label: 'Connected' },
            { value: 'not-connected', label: 'Not connected' },
            { value: 'no-case', label: 'Connected, no case logged' },
          ]}
          onChange={(v) => setF({ ...f, outcome: v })}
          placeholder="Any outcome"
        />
        <Select value={f.recording} options={[{ value: 'yes', label: 'With recording' }]} onChange={(v) => setF({ ...f, recording: v })} placeholder="With or without recording" />
        {(f.q || f.agent || f.direction || f.outcome || f.recording) && (
          <button
            className="link"
            onClick={() => {
              setSearch('');
              setF({ ...f, q: '', agent: '', direction: '', outcome: '', recording: '' });
            }}
          >
            Clear
          </button>
        )}
      </div>

      <section className="card">
        {!list ? (
          <Empty>Loading…</Empty>
        ) : list.length === 0 ? (
          <Empty>No calls for these filters. Every call agents take or make in the CRM dialer is logged here, with its recording.</Empty>
        ) : (
          <>
            <div className="muted small">
              Showing {list.length.toLocaleString('en-IN')} of {page.total.toLocaleString('en-IN')} calls, newest first
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th></th>
                  <th>Number</th>
                  <th>Agent</th>
                  <th>Outcome</th>
                  <th>Talk</th>
                  <th>Linked to</th>
                  <th>Recording</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="small nowrap">
                      {day(r.startedAt)}
                      <div className="muted">{time(r.startedAt)}</div>
                    </td>
                    <td title={r.direction}>{r.direction === 'inbound' ? '↙' : '↗'}</td>
                    <td>
                      <strong>{r.phone || '—'}</strong>
                      <div className="muted small">{r.businessName || r.callerName || 'not a member'}</div>
                    </td>
                    <td className="small">{r.agent}</td>
                    <td className="small">
                      {r.connected === true && <span className="due">Connected</span>}
                      {r.connected === false && <span className="over">Not connected</span>}
                      {r.connected == null && <span className="muted">{r.status}</span>}
                      {r.info?.disposition && <div className="muted">{r.info.disposition}</div>}
                    </td>
                    <td className="small">{dur(r.info?.durationSec)}</td>
                    <td className="small">
                      {(r.caseIds || (r.caseId ? [r.caseId] : [])).map((id) => (
                        <div key={id}>
                          <Link to={`/cases/${id}`}>{id}</Link>
                        </div>
                      ))}
                      {r.missedCallId && <div>missed call {r.missedCallId}</div>}
                      {r.createdMissedCallId && <div className="over">→ missed {r.createdMissedCallId}</div>}
                      {r.leadId && <div>lead {r.leadId}</div>}
                    </td>
                    <td>
                      {r.info?.recordingUrl ? (
                        <div className="rec">
                          <audio controls preload="none" src={`/api/calls/${encodeURIComponent(r.id)}/recording`} />
                          <a className="small" href={`/api/calls/${encodeURIComponent(r.id)}/recording?download=1`} download>
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="muted small">{r.connected === false ? 'not connected' : 'no recording'}</span>
                      )}
                    </td>
                    <td>
                      <div className="row wrap">
                        {!r.caseId && r.connected !== false && (
                          <Link className="btn sm primary" to={`/new?phone=${r.phone}&txn=${encodeURIComponent(r.id)}${r.direction === 'outbound' ? '&channel=Outbound call' : ''}`}>
                            Log case
                          </Link>
                        )}
                        <CallButton phone={r.phone} label="Call back" />
                        <button className="btn sm" onClick={async () => setRaw(await api.get('/calls/' + encodeURIComponent(r.id)))}>
                          Raw
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {page.more || more.length + page.calls.length < page.total ? (
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={loadMore}>
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {raw && (
        <section className="card">
          <div className="row between">
            <h3>Call {raw.id} — SparkTG record</h3>
            <button className="btn sm" onClick={() => setRaw(null)}>
              Close
            </button>
          </div>
          <p className="muted small">If a field shows blank above (outcome, talk time, recording), compare with this record and tell your developer which field name SparkTG uses.</p>
          <pre className="raw">{JSON.stringify({ mapped: raw.info, raw: raw.raw }, null, 2)}</pre>
        </section>
      )}
    </>
  );
}
