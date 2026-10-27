import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { BreakdownRows, TrendChart } from '../components/TrendChart.jsx';
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
  const [trend, setTrend] = useState(null);
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);
  useEffect(() => {
    let live = true;
    api
      .get('/reports?days=14')
      .then((d) => live && setTrend(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!stats) return <Empty>Loading…</Empty>;

  return (
    <>
      <div className="page-head">
        <h1>Good to see you, {agent}</h1>
        <span className="muted">Refreshes every 30 seconds</span>
      </div>

      <h2 className="section-title">Needs attention now</h2>
      <div className="tiles">
        <Tile label="Escalations overdue" value={stats.overdueEscalations} to="/followups" alert={stats.overdueEscalations > 0} sub="L1 TAT 1 working day" />
        <Tile label="Store follow-ups due today" value={stats.notFollowedUpToday} to="/followups" alert={stats.notFollowedUpToday > 0} sub="SOP: call the store daily" />
        <Tile label="Store replies to check" value={stats.storeRepliesToReview} to="/followups" alert={stats.storeRepliesToReview > 0} sub={stats.promisesMissed ? `${stats.promisesMissed} promised dates missed` : 'Not a resolution yet?'} />
      </div>

      <h2 className="section-title">Open cases by status</h2>
      <div className="tiles">
        {STATUSES.filter((s) => s !== 'Closed').map((s) => (
          <Tile key={s} label={<StatusBadge status={s} />} value={stats.byStatus[s]} to={`/cases?status=${s}`} sub={STATUS_HELP[s]} />
        ))}
      </div>

      <div className="two-col">
        <section className="card">
          <h3>Last 14 days</h3>
          {trend ? <TrendChart byDay={trend.byDay} days={14} /> : <div className="muted small">Counting…</div>}
        </section>
        <section className="card">
          <h3>By channel</h3>
          {trend ? <BreakdownRows data={trend.byChannel} /> : <div className="muted small">Counting…</div>}
        </section>
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
