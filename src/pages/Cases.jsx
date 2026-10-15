import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUSES } from '../taxonomy.js';
import { Due, Empty, Select, StatusBadge, ago, storeLabel, useLoad, useMeta, usePicklists } from '../ui.jsx';

export default function Cases() {
  const nav = useNavigate();
  const { stores, agents } = useMeta();
  const { list } = usePicklists();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const filters = Object.fromEntries(params.entries());
  const [cases] = useLoad(() => api.get('/cases?' + params.toString()), [params.toString()]);

  const setF = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };

  function exportCsv() {
    const cols = ['id', 'createdAt', 'channel', 'callerType', 'name', 'phone', 'email', 'businessName', 'cardNo', 'store', 'caseType', 'category', 'subCategory', 'productCategory', 'orderRef', 'status', 'resolutionType', 'assignedTo', 'dueAt', 'closedAt', 'description'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...cases.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `lots-cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <>
      <div className="page-head">
        <h1>All cases</h1>
        <button className="btn" onClick={exportCsv} disabled={!cases?.length}>
          Export CSV
        </button>
      </div>
      <div className="card filters">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setF('q', q);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case no., phone, name, email, card, order…" />
        </form>
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
        {!cases ? (
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
