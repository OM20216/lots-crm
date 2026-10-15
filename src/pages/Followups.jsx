import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SCRIPTS } from '../knowledge.js';
import { Due, Empty, ago, copy, useLoad, useMeta } from '../ui.jsx';
import { TEAMS } from '../workflows.js';

const CRM_TEMPLATE = (spoc, reason, who = 'store') => `Had a discussion with the ${who} contact person, ${spoc || '[Name]'}. As per the update, the case is still pending due to ${reason || '[reason]'}. A follow-up email has been sent to the ${who}.`;

const today = () => new Date().toLocaleDateString('en-CA');
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
// SOP: call the store daily for every pending case (cases escalated today don't need it yet)
export const needsFollowupToday = (c) => c.escalatedAt < startOfToday() && !(c.lastFollowupAt && c.lastFollowupAt >= startOfToday());

function Flags({ c }) {
  const day = today();
  return (
    <>
      {(c.escalationLevel || 1) > 1 && <span className="flag red">Level {c.escalationLevel}</span>}
      {c.storeReplyReview && <span className="flag amber">Store replied — check</span>}
      {c.promisedAt && <span className={`flag ${c.promisedAt < day ? 'red' : 'blue'}`}>{c.promisedAt < day ? 'Promise missed' : 'Promised'} {new Date(c.promisedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
      {needsFollowupToday(c) && <span className="flag amber">Not followed up today</span>}
    </>
  );
}

export default function Followups() {
  const [tab, setTab] = useState('pending');
  return (
    <>
      <div className="page-head">
        <h1>Follow-ups</h1>
        <span className="muted">Call every store and team daily for all pending cases · record each call in the CRM</span>
      </div>
      <div className="tabs">
        <button className={`btn ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          Pending cases
        </button>
        <button className={`btn ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>
          Report
        </button>
      </div>
      {tab === 'pending' ? <Pending /> : <Report />}
    </>
  );
}

function Pending() {
  const { stores, teams, agent, refreshStats } = useMeta();
  const [cases, reload] = useLoad(() => api.get('/cases?status=Escalated'));
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [promised, setPromised] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [err, setErr] = useState('');

  if (!cases) return <Empty>Loading…</Empty>;

  const shown = onlyDue ? cases.filter(needsFollowupToday) : cases;
  const counts = {
    due: cases.filter(needsFollowupToday).length,
    review: cases.filter((c) => c.storeReplyReview).length,
    missed: cases.filter((c) => c.promisedAt && c.promisedAt < today()).length,
    above: cases.filter((c) => (c.escalationLevel || 1) > 1).length,
  };

  // One group per store or team holding escalated cases (the case type's workflow decides which)
  const groups = new Map();
  for (const c of shown) {
    const t = c.escalatedTo || { kind: 'store', code: c.store };
    const key = `${t.kind}:${t.code || ''}`;
    if (!groups.has(key)) {
      const st = t.kind === 'store' && stores.find((x) => x.code === t.code);
      const team = t.kind === 'team' && { ...TEAMS[t.code], ...(teams?.[t.code] || {}) };
      groups.set(key, {
        key,
        isTeam: t.kind === 'team',
        title: team ? team.name : st ? `${st.code} ${st.name}` : 'Store not set',
        short: team ? team.name : st?.short || 'store',
        spocName: team ? team.contact : st?.spocName,
        spocPhone: team ? team.phone : st?.spocPhone,
        spocEmail: team ? team.email : st?.spocEmail,
        cases: [],
      });
    }
    groups.get(key).cases.push(c);
  }
  const byStore = [...groups.values()]
    .map((g) => ({ ...g, cases: g.cases.sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '')) }))
    .sort((a, b) => a.isTeam - b.isTeam || a.title.localeCompare(b.title));

  async function logFollowup(c, s) {
    setErr('');
    try {
      await api.patch('/cases/' + c.id, { note: CRM_TEMPLATE(s.spocName, reason, s.isTeam ? 'team' : 'store'), noteType: 'store-followup', ...(promised ? { promisedAt: promised } : {}) });
    } catch (e) {
      return setErr(`${c.id}: ${e.message}`);
    }
    setOpen(null);
    setReason('');
    setPromised('');
    reload();
    refreshStats();
  }

  function followupMail(s, list) {
    const ids = list.map((c) => c.id).join(', ');
    const body = `Dear Sir,\n\nAs per our discussion over the call regarding the pending cases (${ids}), we kindly request you to share an update on the same at the earliest.\n\nAccording to the existing escalation matrix, the TAT for Level 1 is 1 working day.\n\nRegards,\n${agent}\nCustomer Care – LOTS Wholesale Solutions`;
    return `mailto:${s.spocEmail || ''}?subject=${encodeURIComponent('Follow-up: pending cases – ' + s.short)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <>
      <div className="card script">
        <strong>Call script:</strong> {SCRIPTS[5].text.replace('[Your Name]', agent)}
      </div>
      <div className="card filters">
        <label className="row">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only cases not followed up today
        </label>
        <span className="small">
          <span className="flag amber">{counts.due} not followed up today</span>
          <span className="flag amber">{counts.review} store replies to check</span>
          <span className="flag red">{counts.missed} promises missed</span>
          <span className="flag red">{counts.above} above Level 1</span>
        </span>
      </div>
      {err && <div className="error">{err}</div>}
      {byStore.length === 0 && <Empty>{onlyDue && cases.length ? 'Every escalated case has been followed up today.' : 'No cases are escalated.'}</Empty>}
      {byStore.map((s) => {
        const list = s.cases;
        return (
          <section className="card" key={s.key} id={s.key}>
            <div className="row between">
              <div>
                <h2>
                  {s.title} {s.isTeam && <span className="tag">team</span>} <span className="count">{list.length}</span>
                </h2>
                <div className="muted small">
                  Contact: {s.spocName || 'not set'} · {s.spocPhone || '—'} · {s.spocEmail || '—'} {!s.spocEmail && <Link to="/settings">set up</Link>}
                </div>
              </div>
              <a className="btn" href={followupMail(s, list)}>
                Email follow-up for all {list.length}
              </a>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Customer</th>
                  <th>Concern</th>
                  <th>Escalated</th>
                  <th>TAT</th>
                  <th>Last call to store</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/cases/${c.id}`}>{c.id}</Link>
                      <div>
                        <Flags c={c} />
                      </div>
                    </td>
                    <td>
                      {c.businessName || c.name}
                      <div className="muted small">{c.phone}</div>
                    </td>
                    <td className="small">
                      {c.category} › {c.subCategory}
                    </td>
                    <td className="small">{ago(c.escalatedAt)}</td>
                    <td>
                      <Due iso={c.dueAt} />
                    </td>
                    <td className="small">{c.lastFollowupAt ? ago(c.lastFollowupAt) : <span className="muted">none yet</span>}</td>
                    <td>
                      {open === c.id ? (
                        <div className="followup-box">
                          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pending due to…" autoFocus />
                          <label className="small">
                            Store promised the resolution by <input type="date" value={promised} min={today()} onChange={(e) => setPromised(e.target.value)} />
                          </label>
                          <div className="small muted">{CRM_TEMPLATE(s.spocName, reason, s.isTeam ? 'team' : 'store')}</div>
                          <div className="row">
                            <button className="btn sm" onClick={() => setOpen(null)}>
                              Cancel
                            </button>
                            <button className="btn sm" onClick={() => copy(CRM_TEMPLATE(s.spocName, reason, s.isTeam ? 'team' : 'store'))}>
                              Copy
                            </button>
                            <button className="btn primary sm" onClick={() => logFollowup(c, s)}>
                              Save to case
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn sm" onClick={() => (setOpen(c.id), setReason(''), setPromised(c.promisedAt && c.promisedAt >= today() ? c.promisedAt : ''))}>
                          Log follow-up call
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {cases.some((c) => !c.escalatedTo && !c.store) && <div className="notice">Some escalated cases have no store set — open them from All cases and select a store.</div>}
    </>
  );
}

// Escalation performance per store / team (for LOTS management)
function Report() {
  const [days, setDays] = useState(30);
  const [r] = useLoad(() => api.get('/escalation-report?days=' + days), [days]);
  const pct = (v) => (v == null ? '—' : v + '%');
  const num = (v) => (v == null ? '—' : v);
  const rows = r ? [...r.rows, { key: 'total', name: 'All stores and teams', ...r.total, total: true }] : [];
  return (
    <section className="card">
      <div className="row between">
        <h2>Escalations by store and team</h2>
        <select style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>
      {!r ? (
        <Empty>Loading…</Empty>
      ) : r.rows.length === 0 ? (
        <Empty>No escalations in this period.</Empty>
      ) : (
        <table className="table report-table">
          <thead>
            <tr>
              <th>Store / team</th>
              <th className="num">Escalated</th>
              <th className="num">Resolved</th>
              <th className="num" title="Resolved within the first TAT">On time</th>
              <th className="num" title="Working days from escalation to the store's resolution">Avg days</th>
              <th className="num">Open now</th>
              <th className="num">Overdue</th>
              <th className="num">Above L1</th>
              <th className="num">Promises missed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key}>
                <td>{x.total ? <strong>{x.name}</strong> : <>{x.name} {x.kind === 'team' && <span className="tag">team</span>}</>}</td>
                <td className="num">{x.escalated}</td>
                <td className="num">{x.resolved}</td>
                <td className="num">
                  <span className={x.onTimePct != null && x.onTimePct < 80 ? 'over' : ''}>{pct(x.onTimePct)}</span>
                </td>
                <td className="num">{num(x.avgDays)}</td>
                <td className="num">{x.open}</td>
                <td className="num">{x.overdue ? <span className="over">{x.overdue}</span> : 0}</td>
                <td className="num">{x.aboveL1}</td>
                <td className="num">{x.promisesMissed ? <span className="over">{x.promisesMissed}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="muted small">On time = resolved within the first TAT (Level 1). Days are working days; Sundays and the holidays in Stores &amp; settings are not counted.</div>
    </section>
  );
}
