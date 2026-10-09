import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SCRIPTS } from '../knowledge.js';
import { Due, Empty, ago, copy, useLoad, useMeta } from '../ui.jsx';
import { TEAMS } from '../workflows.js';

const CRM_TEMPLATE = (spoc, reason, who = 'store') => `Had a discussion with the ${who} contact person, ${spoc || '[Name]'}. As per the update, the case is still pending due to ${reason || '[reason]'}. A follow-up email has been sent to the ${who}.`;

export default function Followups() {
  const { stores, teams, agent, refreshStats } = useMeta();
  const [cases, reload] = useLoad(() => api.get('/cases?status=Escalated'));
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');

  if (!cases) return <Empty>Loading…</Empty>;

  // One group per store or team holding escalated cases (the case type's workflow decides which)
  const groups = new Map();
  for (const c of cases) {
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
    await api.patch('/cases/' + c.id, { note: CRM_TEMPLATE(s.spocName, reason, s.isTeam ? 'team' : 'store'), noteType: 'store-followup' });
    setOpen(null);
    setReason('');
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
      <div className="page-head">
        <h1>Follow-ups</h1>
        <span className="muted">Call every store and team daily for all pending cases · record each call in the CRM</span>
      </div>
      <div className="card script">
        <strong>Call script:</strong> {SCRIPTS[5].text.replace('[Your Name]', agent)}
      </div>
      {byStore.length === 0 && <Empty>No cases are escalated.</Empty>}
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
                <th>Last update</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/cases/${c.id}`}>{c.id}</Link>
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
                  <td className="small">{ago(c.updatedAt)}</td>
                  <td>
                    {open === c.id ? (
                      <div className="followup-box">
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pending due to…" autoFocus />
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
                      <button className="btn sm" onClick={() => (setOpen(c.id), setReason(''))}>
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
