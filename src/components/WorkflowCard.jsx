import { Link } from 'react-router-dom';
import { TEAMS, escalationBlocker, escalationTarget, workflowFor, workflowSteps } from '../workflows.js';
import { fmtDate, useMeta } from '../ui.jsx';
import { matrixRowFor } from '../escalationMatrix.js';

const tatText = (d) => (d ? `TAT ${d} working day${d > 1 ? 's' : ''}` : 'Resolve on the call');
// HO escalation matrix: "First Time Resolution 4 working hours → Level 1 1 working day → Level 2 2 working days"
const stagesText = (row) => row.stages.map((s) => `${s.label} ${s.tatText}`).join(' → ');

/** The HO escalation matrix row for the case as it is on screen (null = the sheet has no row for it). */
export function useHoRow(c) {
  const { hoMatrix } = useMeta();
  return c ? matrixRowFor(c, hoMatrix?.rows || []) : null;
}

const matrixTarget = (row) => ({ kind: 'matrix', code: row.key, name: `${row.row} (HO matrix)`, email: row.stages[0].to.join(', '), contact: '' });

/** Who an escalation goes to: saved on the case once escalated, else the HO matrix row, else worked out from the workflow. */
export function useEscalationTarget(c) {
  const { stores, teams } = useMeta();
  const row = useHoRow(c);
  if (!c) return null;
  if (c.status === 'Escalated' && c.escalatedTo) return c.escalatedTo;
  if (row) return matrixTarget(row);
  return (c.target?.kind !== 'matrix' && c.target) || escalationTarget(c, stores, teams || TEAMS);
}

/** One-line workflow preview, used on the New case form. */
export function WorkflowHint({ c }) {
  const { stores, teams } = useMeta();
  const wf = workflowFor(c);
  const row = useHoRow(c);
  if (!wf) return null;
  const t = escalationTarget(c, stores, teams || TEAMS);
  if (row)
    return (
      <div className="wf-hint">
        <strong>Workflow: {wf.title}</strong> · escalates to <strong>{row.stages[0].to.join(', ')}</strong> (HO escalation matrix – {row.row})
        <div className="muted small">{stagesText(row)}</div>
      </div>
    );
  return (
    <div className="wf-hint">
      <strong>Workflow: {wf.title}</strong> · owner <span className="wf-owner">{TEAMS[wf.owner]?.name}</span> · {tatText(wf.tatDays)}
      {wf.owner !== 'careDesk' && <> · escalates to <strong>{t.name}</strong>{!t.email && <span className="over"> (no email set)</span>}</>}
      {wf.note && <div className="muted small">{wf.note}</div>}
    </div>
  );
}

/** Step checklist for the case page: auto steps tick themselves, others the agent ticks. */
export default function WorkflowCard({ c, onTick }) {
  const wf = workflowFor(c);
  const target = useEscalationTarget(c);
  const row = useHoRow(c);
  if (!wf) return (
    <section className="card">
      <h2>Workflow</h2>
      <div className="muted small">Select the case type and category to see this case's workflow.</div>
    </section>
  );
  const steps = workflowSteps(c, wf);
  const done = steps.filter((s) => s.done).length;
  const blocker = c.status === 'Pending' || c.status === 'Waiting' || c.status === 'Closed' ? escalationBlocker(c) : null;

  return (
    <section className="card workflow-card">
      <div className="row between">
        <h2>Workflow · {wf.title}</h2>
        <span className="muted small">
          {done}/{steps.length} done
        </span>
      </div>
      <div className="wf-meta small">
        {target?.kind === 'matrix' && row ? (
          <>
            HO escalation matrix – {row.row}: {stagesText(row)}
          </>
        ) : (
          <>
            Owner <span className="wf-owner">{TEAMS[wf.owner]?.name}</span> · {tatText(wf.tatDays)}
          </>
        )}
        {wf.owner !== 'careDesk' && target && (
          <>
            {' '}
            · {c.status === 'Escalated' ? 'with' : 'escalates to'} <strong>{target.name}</strong>
            {target.contact && ` (${target.contact})`}
            {target.email ? ` · ${target.email}` : <> · <span className="over">no email</span> <Link to="/settings">add</Link></>}
          </>
        )}
      </div>
      {wf.note && <div className="muted small">{wf.note}</div>}
      <div className="wf-progress">
        <div style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="wf-steps">
        {steps.map((s) => (
          <li key={s.id} className={`${s.done ? 'done' : ''} ${s.isNext ? 'next' : ''}`}>
            <label>
              <input
                type="checkbox"
                checked={s.done}
                disabled={s.auto || c.status === 'Closed'}
                onChange={(e) => onTick({ checkStep: s.id, done: e.target.checked, stepLabel: s.label })}
              />
              <span>{s.label}</span>
            </label>
            <span className="muted small">
              {s.auto ? (s.done ? 'auto' : 'ticks itself') : s.done && s.by ? `${s.by} · ${fmtDate(s.at)}` : ''}
              {s.isNext && <strong className="wf-next"> next</strong>}
            </span>
            {s.hint && <div className="muted small wf-hint-line">{s.hint}</div>}
          </li>
        ))}
      </ol>
      {blocker && <div className="notice small">{blocker}</div>}
    </section>
  );
}
