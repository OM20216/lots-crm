import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { STATUSES } from '../taxonomy.js';
import { Due, Empty, Select, StatusBadge, ago, fmtDate, storeLabel, useMeta, usePicklists } from '../ui.jsx';

const PAGE = 50;
const n = (v) => Number(v || 0).toLocaleString('en-IN');
const localIso = (d) => d.toLocaleDateString('en-CA');

export default function Reports() {
  const nav = useNavigate();
  const { stores, agents } = useMeta();
  const { list } = usePicklists();

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 29 * 86400000);

  const [from, setFrom] = useState(localIso(thirtyDaysAgo));
  const [to, setTo] = useState(localIso(today));
  const [status, setStatus] = useState('');
  const [store, setStore] = useState('');
  const [channel, setChannel] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [q, setQ] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Reset to page 1 whenever filters change
  const handleFromChange = (v) => {
    setFrom(v);
    setPage(1);
  };
  const handleToChange = (v) => {
    setTo(v);
    setPage(1);
  };
  const handlePreset = (days, isMonthStart = false) => {
    const end = new Date();
    const start = isMonthStart
      ? new Date(end.getFullYear(), end.getMonth(), 1)
      : new Date(end.getTime() - (days - 1) * 86400000);
    setFrom(localIso(start));
    setTo(localIso(end));
    setPage(1);
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr('');

    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (status) query.set('status', status);
    if (store) query.set('store', store);
    if (channel) query.set('channel', channel);
    if (assignedTo) query.set('assignedTo', assignedTo);
    if (q) query.set('q', q);
    query.set('limit', String(PAGE));
    query.set('offset', String((page - 1) * PAGE));

    api
      .page('/cases?' + query.toString())
      .then((res) => {
        if (!live) return;
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (!live) return;
        setErr(e.message || 'Failed to load cases');
        setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [from, to, status, store, channel, assignedTo, q, page]);

  const total = data?.total || 0;
  const cases = data?.items || [];
  const pages = Math.max(1, Math.ceil(total / PAGE));

  // Export URLs with current date range and filters
  const exportParams = new URLSearchParams();
  if (from) exportParams.set('from', from);
  if (to) exportParams.set('to', to);
  if (status) exportParams.set('status', status);
  if (store) exportParams.set('store', store);
  if (channel) exportParams.set('channel', channel);
  if (assignedTo) exportParams.set('assignedTo', assignedTo);
  if (q) exportParams.set('q', q);

  const excelHref = `/api/cases/export?${exportParams.toString()}&format=xlsx`;
  const csvHref = `/api/cases/export?${exportParams.toString()}`;

  const hasExtraFilters = status || store || channel || assignedTo || q;
  const clearFilters = () => {
    setStatus('');
    setStore('');
    setChannel('');
    setAssignedTo('');
    setQ('');
    setSearchTerm('');
    setPage(1);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Filter cases by date range and view or export report data.
          </p>
        </div>
        <div className="head-actions">
          <a className="btn" href={csvHref} download={`lots-cases-${from}-to-${to}.csv`}>
            Export CSV
          </a>
          <a className="btn primary" href={excelHref} download={`lots-cases-${from}-to-${to}.xlsx`}>
            Download Excel
          </a>
        </div>
      </div>

      {/* Calendar & Date Range Card */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label>
            <div className="ct-label">From</div>
            <input type="date" value={from} onChange={(e) => handleFromChange(e.target.value)} />
          </label>
          <label>
            <div className="ct-label">To</div>
            <input type="date" value={to} onChange={(e) => handleToChange(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 2 }}>
            <button
              type="button"
              className="btn small"
              onClick={() => handlePreset(1)}
              title="Today only"
            >
              Today
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => handlePreset(7)}
              title="Last 7 days"
            >
              7 Days
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => handlePreset(30)}
              title="Last 30 days"
            >
              30 Days
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => handlePreset(0, true)}
              title="This month"
            >
              This Month
            </button>
          </div>
          <span className="muted small" style={{ marginLeft: 'auto', paddingBottom: 6 }}>
            {loading ? 'Loading…' : `${n(total)} case${total === 1 ? '' : 's'} in this range`}
          </span>
        </div>

        {/* Filters for drill-down */}
        <div className="filters even" style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
          <form
            style={{ flex: 1, minWidth: 200 }}
            onSubmit={(e) => {
              e.preventDefault();
              setQ(searchTerm);
              setPage(1);
            }}
          >
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search case no., phone, customer…"
            />
          </form>
          <Select
            value={status}
            options={STATUSES}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            placeholder="Any status"
          />
          <Select
            value={store}
            options={stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short}` }))}
            onChange={(v) => {
              setStore(v);
              setPage(1);
            }}
            placeholder="Any store"
          />
          <Select
            value={channel}
            options={list('Channel')}
            onChange={(v) => {
              setChannel(v);
              setPage(1);
            }}
            placeholder="Any channel"
          />
          <Select
            value={assignedTo}
            options={agents}
            onChange={(v) => {
              setAssignedTo(v);
              setPage(1);
            }}
            placeholder="Any agent"
          />
          {hasExtraFilters && (
            <button type="button" className="link" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Cases Table Below Calendar */}
      <section className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="muted small">
            {loading
              ? 'Loading cases…'
              : `${n(total)} case${total === 1 ? '' : 's'}${pages > 1 ? ` · page ${n(page)} of ${n(pages)}` : ''}`}
          </span>
          {pages > 1 && (
            <div className="row">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                ← Previous
              </button>
              <button className="btn" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
                Next →
              </button>
            </div>
          )}
        </div>

        {err ? (
          <Empty>{err}</Empty>
        ) : loading && cases.length === 0 ? (
          <Empty>Loading cases…</Empty>
        ) : cases.length === 0 ? (
          <Empty>No cases found for the selected date range.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Customer</th>
                  <th>Type / category</th>
                  <th>Store</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
                    <td>
                      <Link to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.id}
                      </Link>
                      {c.vtigerCaseNo && <div className="muted small">{c.vtigerCaseNo}</div>}
                    </td>
                    <td>
                      {c.businessName || c.name || '—'}
                      <div className="muted small">{c.phone || c.email}</div>
                    </td>
                    <td>
                      {c.caseType || <span className="badge st-waiting">To categorise</span>}
                      <div className="muted small">{[c.category, c.subCategory].filter(Boolean).join(' › ')}</div>
                    </td>
                    <td>{storeLabel(stores, c.store)}</td>
                    <td className="small">{c.channel}</td>
                    <td>
                      <StatusBadge status={c.status} /> {c.status === 'Escalated' && <Due iso={c.dueAt} />}
                    </td>
                    <td className="small">{c.assignedTo || '—'}</td>
                    <td className="small">{fmtDate(c.createdAt)}</td>
                    <td className="small">{ago(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && cases.length > 0 && (
          <div className="row between" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <span className="muted small">
              Page {n(page)} of {n(pages)} ({n(total)} total)
            </span>
            <div className="row">
              <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                ← Previous
              </button>
              <button className="btn" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
                Next →
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
