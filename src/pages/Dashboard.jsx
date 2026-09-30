import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { STATUSES, STATUS_HELP } from '../taxonomy.js';
import { Empty, StatusBadge, storeLabel, useMeta } from '../ui.jsx';

function Tile({ label, value, to, alert, sub }) {
  return (
    <Link to={to} className={`tile ${alert ? 'alert' : ''}`}>
      <div className="tile-value">{value ?? '—'}</div>
      <div className="tile-label">{label}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </Link>
  );
}

export default function Dashboard() {
  const { stats, stores, agent, refreshStats } = useMeta();
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);
  if (!stats) return <Empty>Loading…</Empty>;

  return (
    <>
      <div className="page-head">
        <h1>Good to see you, {agent}</h1>
        <span className="muted">Refreshes every 30 seconds</span>
      </div>

      <h2 className="section-title">Needs attention now</h2>
      <div className="tiles">
        <Tile label="Missed calls to call back" value={stats.missedOpen} to="/missed" alert={stats.missedBreached > 0} sub={stats.missedBreached ? `${stats.missedBreached} past 30-min TAT` : 'TAT 30 min'} />
        <Tile label="Pending emails" value={stats.pendingEmails} to="/emails" alert={stats.pendingEmails > 0} sub="Check every 5 min" />
        <Tile label="Escalations overdue" value={stats.overdueEscalations} to="/followups" alert={stats.overdueEscalations > 0} sub="L1 TAT 1 working day" />
        <Tile label="Outbound leads due" value={stats.leadsDue} to="/leads" sub="New + call-backs + confirmations" />
        <Tile label="Unassigned open cases" value={stats.unassigned} to="/cases?assignedTo=-" alert={stats.unassigned > 0} sub="Auto-assign needs an agent on shift" />
        <Tile label="Automated actions today" value={stats.today.automated} to="/automation" sub="Categorised, assigned, emailed, chased" />
      </div>

      <h2 className="section-title">Open cases by status</h2>
      <div className="tiles">
        {STATUSES.filter((s) => s !== 'Closed').map((s) => (
          <Tile key={s} label={<StatusBadge status={s} />} value={stats.byStatus[s]} to={`/cases?status=${s}`} sub={STATUS_HELP[s]} />
        ))}
      </div>

      <div className="three-col">
        <section className="card">
          <h3>Today</h3>
          <div className="big-num">{stats.today.total}</div>
          <div className="muted small">cases created · {stats.today.closedRot} resolved on call (ROT)</div>
          <table className="table compact">
            <tbody>
              {Object.entries(stats.today.byChannel).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{v}</td>
                </tr>
              ))}
              {Object.entries(stats.today.byType).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>Escalated by store</h3>
          {Object.keys(stats.escalatedByStore).length === 0 ? (
            <div className="muted small">Nothing with stores.</div>
          ) : (
            <table className="table compact">
              <tbody>
                {Object.entries(stats.escalatedByStore).map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <Link to={`/followups#${k}`}>{storeLabel(stores, k)}</Link>
                    </td>
                    <td className="num">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h3>Top open categories</h3>
          {stats.topCategories.length === 0 ? (
            <div className="muted small">No open cases.</div>
          ) : (
            <table className="table compact">
              <tbody>
                {stats.topCategories.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="num">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
