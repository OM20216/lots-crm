import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Due, fmtDate, useMeta } from '../ui.jsx';

const PSEUDO_TEAMS = ['careDesk', 'store', 'homeStore'];
const today = () => new Date().toLocaleDateString('en-CA');
const dmy = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Every store and team a case can be escalated to, for pickers. */
export function useTargets() {
  const { stores, teams, hoMatrix } = useMeta();
  return [
    ...(hoMatrix?.rows || []).map((r) => ({ value: `matrix:${r.key}`, label: `HO matrix: ${r.row}` })),
    ...stores.map((s) => ({ value: `store:${s.code}`, label: `Store ${s.code} ${s.short} – ${s.name}` })),
    ...Object.entries(teams || {})
      .filter(([k]) => !PSEUDO_TEAMS.includes(k))
      .map(([k, t]) => ({ value: `team:${k}`, label: t.name })),
  ];
}
export const splitTarget = (v) => {
  const [kind, ...rest] = String(v || '').split(':');
  return { kind, code: rest.join(':') };
};

/** Escalated case: who has it, level, deadline, promised date, store reply to check, re-assign, next level. */
export default function EscalationPanel({ c, onChange, onError, embedded = false }) {
  const targets = useTargets();
  const [mode, setMode] = useState(null); // 'reroute' | 'raise'
  const [pick, setPick] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (c.status !== 'Escalated') return null;

  const to = c.escalatedTo || { kind: 'store', code: c.store, name: `Store ${c.store}` };
  const level = c.escalationLevel || 1;
  const levels = c.levels || [];
  const next = levels[level - 1];
  const promiseMissed = c.promisedAt && c.promisedAt < today();
  const m = c.matrix || null; // First Time Resolution → Level 1 → Level 2 (HO matrix row, or the store's / team's row)
  const nextName = next?.label || (level === 1 ? 'Level 1' : 'Level 2');
  const nextTat = next ? next.tatText || `${next.tatDays || 1} working day${(next.tatDays || 1) > 1 ? 's' : ''}` : '';
  const dueText = (iso) => (iso ? (m?.stages[level - 1]?.tat?.unit === 'hours' ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : dmy(iso)) : '—');

  async function run(fn, done) {
    setBusy(true);
    try {
      onChange(await fn());
      setMode(null);
      setText('');
      setPick('');
      done?.();
    } catch (e) {
      onError(e.message);
    }
    setBusy(false);
  }

  return (
    <section className={embedded ? 'esc-embedded' : 'card esc-panel'}>
      <div className="row between">
        {embedded ? <strong>Escalation</strong> : <h2>Escalation</h2>}
        <span className={`esc-level l${Math.min(level, 4)}`}>{c.levelName}</span>
      </div>

      {m && (
        <div className="esc-stages">
          {m.stages.map((s, i) => (
            <div key={s.label} className={`esc-stage ${i === level - 1 ? 'now' : i < level - 1 ? 'done' : ''}`}>
              <strong>
                {s.label} · {s.tatText}
              </strong>
              {s.to.length ? s.to.join(', ') : <span className="over">email not set — <Link to="/settings">add</Link></span>}
              {s.cc.length > 0 && <div className="muted">cc {s.cc.join(', ')}</div>}
            </div>
          ))}
        </div>
      )}

      {c.storeReplyReview && (
        <div className="notice esc-review">
          <strong>Store replied — not a resolution yet?</strong>
          <div className="small muted">
            {c.storeReplyReview.from} · {fmtDate(c.storeReplyReview.at)}
          </div>
          <blockquote>{c.storeReplyReview.text || '(no text)'}</blockquote>
          <div className="row wrap">
            <button className="btn ok sm" disabled={busy} onClick={() => run(() => api.patch('/cases/' + c.id, { status: 'Resolved', note: `Store's reply is the resolution: ${c.storeReplyReview.text.slice(0, 300)}` }))}>
              It is the resolution → Resolved
            </button>
            <button className="btn sm" disabled={busy} onClick={() => run(() => api.patch('/cases/' + c.id, { storeReplyReviewed: true, note: 'Store reply checked: not resolved yet, keep following up', noteType: 'note' }))}>
              Not yet — keep escalated
            </button>
          </div>
        </div>
      )}

      <div className="esc-grid small">
        <span className="muted">With</span>
        <span>
          <strong>{m ? `${m.ho || m.store ? m.row : to.name} – ${m.stages[Math.min(level, m.stages.length) - 1]?.label}` : to.name}</strong>
          {!m && to.contact && ` · ${to.contact}`}{' '}
          {m?.stages[Math.min(level, m.stages.length) - 1]?.to.length ? <span className="muted">{m.stages[Math.min(level, m.stages.length) - 1].to.join(', ')}</span> : to.email ? <span className="muted">{to.email}</span> : <span className="over">no email — <Link to="/settings">add</Link></span>}
        </span>
        <span className="muted">Due</span>
        <span>
          {dueText(c.dueAt)} <Due iso={c.dueAt} />
        </span>
        <span className="muted">Promised by</span>
        <span>
          <input
            type="date"
            className={`esc-date ${promiseMissed ? 'bad' : ''}`}
            value={c.promisedAt || ''}
            onChange={(e) => run(() => api.patch('/cases/' + c.id, { promisedAt: e.target.value || null }))}
          />
          {promiseMissed && <span className="over"> missed</span>}
          <span className="muted"> · the date the store gave on a call or email</span>
        </span>
        <span className="muted">Next level</span>
        <span>
          {next ? (
            <>
              <strong>{nextName}</strong>{!m && `: ${next.name || next.email}`} <span className="muted">· TAT {nextTat} · automatic when the due date passes</span>
            </>
          ) : (
            <span className="muted">
              {levels.length || m ? 'Highest level reached: a daily reminder goes out while overdue' : 'No escalation matrix yet'} — <Link to="/settings">Escalation matrix</Link>
            </span>
          )}
        </span>
      </div>

      <div className="row wrap">
        <button className={`btn sm ${mode === 'reroute' ? 'active' : ''}`} onClick={() => setMode(mode === 'reroute' ? null : 'reroute')}>
          Re-assign to another store / team
        </button>
        {level < 3 && (
          <button className={`btn sm danger ${mode === 'raise' ? 'active' : ''}`} disabled={!next} title={next ? '' : 'Fill in the next level in Stores & settings → Escalation matrix first'} onClick={() => setMode(mode === 'raise' ? null : 'raise')}>
            Escalate to {nextName} now
          </button>
        )}
      </div>

      {mode === 'reroute' && (
        <div className="action-box">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Send it to…</option>
            {targets
              .filter((t) => t.value !== `${to.kind}:${to.code}`)
              .map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
          </select>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Why (e.g. store says this is an app order)" />
          <div className="muted small">Starts again at the first level with a fresh TAT; the escalation email goes to the new store / team.</div>
          <div className="row end">
            <button className="btn primary" disabled={!pick || busy} onClick={() => run(() => api.post(`/cases/${c.id}/reroute`, { ...splitTarget(pick), note: text }))}>
              Re-assign
            </button>
          </div>
        </div>
      )}
      {mode === 'raise' && next && (
        <div className="action-box">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason (e.g. store not responding to calls)" autoFocus />
          <div className="muted small">
            {m ? (
              <>
                Emails <strong>{next.to.join(', ')}</strong>
                {next.cc.length > 0 && <> with {next.cc.join(', ')} in copy</>}; new due date in {nextTat}.
              </>
            ) : (
              <>
                Emails {to.name} with <strong>{next.name || next.email}</strong> ({next.email}) in copy; new due date in {nextTat}.
              </>
            )}
          </div>
          <div className="row end">
            <button className="btn danger" disabled={!text.trim() || busy} onClick={() => run(() => api.post(`/cases/${c.id}/raise-level`, { reason: text }))}>
              Escalate to {nextName}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
