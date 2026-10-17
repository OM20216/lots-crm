import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS, WORKFLOWS } from '../workflows.js';
import { useMeta } from '../ui.jsx';

const list = (v) => (v === undefined ? null : Array.isArray(v) ? v.join(', ') : v);
const TYPES = ['Inquiry', 'Issues or Complaint', 'Issues and Complaint (NR)', 'Request'];

// Reference: the workflow of every case type (owner team, TAT, steps), from src/workflows.js.
export default function Workflows() {
  const { teams } = useMeta();
  const [type, setType] = useState('Issues or Complaint');
  const shown = WORKFLOWS.filter((w) => w.match.caseType === type);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Case workflows</h1>
          <span className="muted">Each case type has its own owner team, TAT and steps. The case page shows them as a checklist.</span>
        </div>
      </div>
      <div className="row wrap">
        {TYPES.map((t) => (
          <button key={t} className={`btn ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="wf-grid">
        {shown.map((w) => {
          const team = { ...TEAMS[w.owner], ...(teams?.[w.owner] || {}) };
          return (
            <section className="card" key={w.key}>
              <h2>{w.title}</h2>
              <div className="small">
                Owner <span className="wf-owner">{team.name}</span> · {w.tatDays ? `TAT ${w.tatDays} working day${w.tatDays > 1 ? 's' : ''}` : 'Resolve on the call (ROT)'}
              </div>
              <div className="muted small">
                {list(w.match.category) && <>Category: {list(w.match.category)}. </>}
                {list(w.match.subCategory) && <>Sub-category: {list(w.match.subCategory)}. </>}
                {w.requires?.length > 0 && <>Needs {w.requires.map((r) => (r === 'orderRef' ? 'order / invoice no.' : r)).join(', ')} before escalating.</>}
              </div>
              {w.note && <div className="muted small">{w.note}</div>}
              <ol className="wf-steps compact">
                {w.steps.map((s) => (
                  <li key={s.id}>
                    {s.label} {s.auto && <span className="muted small">(auto)</span>}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      <section className="card">
        <h2>Teams</h2>
        <p className="muted small">
          Escalations go to these teams by email. Add their contact details in <Link to="/settings">Stores &amp; settings</Link>.
        </p>
        <table className="table compact">
          <tbody>
            {Object.entries(TEAMS).map(([k, t]) => {
              const v = { ...t, ...(teams?.[k] || {}) };
              return (
                <tr key={k}>
                  <td>
                    <strong>{v.name}</strong>
                  </td>
                  <td className="small">{v.note}</td>
                  <td className="small">{k === 'store' || k === 'homeStore' || k === 'careDesk' ? '—' : v.email || <span className="over">no email</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
