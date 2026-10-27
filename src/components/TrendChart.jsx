// Small CSS-only charts for the dashboard and the Report page (no chart library).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Counts per key as labelled bars, biggest first. */
export function BreakdownRows({ data, label }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="muted small">Nothing in this period.</div>;
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rep-rows">
      {entries.map(([k, v]) => (
        <div className="rep-row" key={k}>
          <span className="rep-row-label">{label ? label(k) : k === '-' ? '—' : k}</span>
          <span className="rep-row-bar">
            <i style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="num">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Created and closed per day (per month for the 1-year view). */
export function TrendChart({ byDay, days }) {
  let buckets;
  if (days > 90) {
    const months = new Map();
    for (const d of byDay) {
      const key = d.date.slice(0, 7);
      if (!months.has(key)) months.set(key, { label: MONTHS[Number(key.slice(5, 7)) - 1], created: 0, closed: 0 });
      const b = months.get(key);
      b.created += d.created;
      b.closed += d.closed;
    }
    buckets = [...months.values()];
  } else {
    buckets = byDay.map((d) => ({ label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, ...d }));
  }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.created, b.closed)));
  return (
    <>
      <div className="trend">
        {buckets.map((b, i) => (
          <div className="trend-day" key={i} title={`${b.label}: ${b.created} created · ${b.closed} closed`}>
            <span className="trend-bar" style={{ height: `${(b.created / max) * 100}%` }} />
            <span className="trend-bar closed" style={{ height: `${(b.closed / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="trend-x">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
      <div className="trend-legend">
        <span className="trend-dot" /> Created
        <span className="trend-dot closed" /> Closed
      </div>
    </>
  );
}
