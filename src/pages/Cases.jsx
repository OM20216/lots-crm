import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUSES } from '../taxonomy.js';
import { Due, Empty, Select, StatusBadge, ago, storeLabel, useLoad, useMeta, usePicklists } from '../ui.jsx';
import CaseImport from '../components/CaseImport.jsx';

const PAGE = 50; // the imported cases number in lakhs: the browser gets one page at a time
const n = (v) => Number(v || 0).toLocaleString('en-IN');

export default function Cases() {
  const nav = useNavigate();
  const { stores, agents, isAdmin } = useMeta();
  const { list } = usePicklists();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [showImport, setShowImport] = useState(false);
  const filters = Object.fromEntries(params.entries());
  const page = Math.max(1, Number(params.get('page')) || 1);

  const query = new URLSearchParams(params);
  query.delete('page');
  query.set('limit', String(PAGE));
  query.set('offset', String((page - 1) * PAGE));
  const [data, reload, loadErr] = useLoad(() => api.page('/cases?' + query.toString()), [query.toString()]);
  const cases = data?.items;
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const setF = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete('page'); // a changed filter starts at the first page
    setParams(p);
  };
  const goPage = (n) => {
    const p = new URLSearchParams(params);
    if (n > 1) p.set('page', String(n));
    else p.delete('page');
    setParams(p);
  };

  // The whole filtered list, built on the server (lakhs of rows do not fit in the browser).
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');

  return (
    <>
      <div className="page-head">
        <h1>All cases</h1>
        {/* search beside Export CSV */}
        <div className="head-actions">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setF('q', q);
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case no., phone, name, email, card, order…" />
          </form>
          {isAdmin && (
            <button className={showImport ? 'btn primary' : 'btn'} onClick={() => setShowImport(!showImport)}>
              Import from Vtiger
            </button>
          )}
          <a className="btn" href={'/api/cases/export?' + exportParams.toString()} download>
            Export CSV
          </a>
        </div>
      </div>
      {showImport && isAdmin && (
        <section className="card">
          <CaseImport onDone={reload} />
        </section>
      )}
      <div className="card filters even">
        <Select value={filters.status} options={STATUSES} onChange={(v) => setF('status', v)} placeholder="Any status" />
        <Select value={filters.channel} options={list('Channel')} onChange={(v) => setF('channel', v)} placeholder="Any channel" />
        <Select value={filters.caseType} options={list('Case Type')} onChange={(v) => setF('caseType', v)} placeholder="Any type" />
        <Select value={filters.store} options={stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short}` }))} onChange={(v) => setF('store', v)} placeholder="Any store" />
        <Select value={filters.assignedTo} options={agents} onChange={(v) => setF('assignedTo', v)} placeholder="Any agent" />
        {params.toString() && (
          <button className="link" onClick={() => (setQ(''), setParams({}))}>
            Clear
          </button>
        )}
      </div>
      <section className="card">
        <div className="row between">
          <span className="muted small">
            {data ? `${n(total)} case${total === 1 ? '' : 's'}${pages > 1 ? ` · page ${n(page)} of ${n(pages)}` : ''}` : 'Loading…'}
          </span>
          {pages > 1 && (
            <div className="row">
              <button className="btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                ← Previous
              </button>
              <button className="btn" disabled={page >= pages} onClick={() => goPage(page + 1)}>
                Next →
              </button>
            </div>
          )}
        </div>
        {loadErr ? (
          <Empty>{loadErr}</Empty>
        ) : !cases ? (
          <Empty>Loading…</Empty>
        ) : cases.length === 0 ? (
          <Empty>No cases match.</Empty>
        ) : (
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
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/cases/${c.id}`)}>
                  <td>
                    <Link to={`/cases/${c.id}`}>{c.id}</Link>
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
                  <td className="small">{ago(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
