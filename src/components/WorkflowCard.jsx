import { Link } from 'react-router-dom';
import { TEAMS, escalationBlocker, escalationTarget, workflowFor, workflowSteps } from '../workflows.js';
import { fmtDate, useMeta } from '../ui.jsx';

const tatText = (d) => (d ? `TAT ${d} working day${d > 1 ? 's' : ''}` : 'Resolve on the call');

/** Who an escalation goes to: saved on the case once escalated, else worked out from the workflow. */
export function useEscalationTarget(c) {
  const { stores, teams } = useMeta();
  if (!c) return null;
  if (c.status === 'Escalated' && c.escalatedTo) return c.escalatedTo;
  return c.target || escalationTarget(c, stores, teams || TEAMS);
}

/** One-line workflow preview, used on the New case form. */
export function WorkflowHint({ c }) {
  const { stores, teams } = useMeta();
  const wf = workflowFor(c);
  if (!wf) return null;
  const t = escalationTarget(c, stores, teams || TEAMS);
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
        Owner <span className="wf-owner">{TEAMS[wf.owner]?.name}</span> · {tatText(wf.tatDays)}
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
