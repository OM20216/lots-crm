import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Due, fmtDate, useMeta } from '../ui.jsx';
import { CallButton } from './Dialer.jsx';
import { useSparkTG } from '../sparktg.jsx';

// Top-bar missed calls (SOP: no missed call left unattended, call back within 30 min).
// "Recent missed" = open, not tried yet · "2nd round" = open, already tried once without getting through.
// A NEW missed call opens the list by itself, highlights it and offers "Call now".

// Short two-note alert (no sound file needed). Browsers allow it once the agent has clicked on the page.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch {
    /* audio not available */
  }
}

export default function MissedBar() {
  const { refreshStats } = useMeta();
  const { callState } = useSparkTG();
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null); // 'recent' | 'second' | null
  const [fresh, setFresh] = useState([]); // ids of missed calls that just arrived
  const ref = useRef(null);
  const seen = useRef(null); // ids already known (null until the first load)

  const load = useCallback(
    () =>
      api
        .get('/missed-calls?open=1')
        .then((l) => {
          setList(l);
          const ids = l.map((m) => m.id);
          if (seen.current) {
            const added = l.filter((m) => !seen.current.has(m.id) && !m.attempts?.length).map((m) => m.id);
            if (added.length) {
              setFresh((f) => [...new Set([...added, ...f])]);
              setOpen('recent'); // pop the list open with the new call on top
              chime();
            }
          }
          seen.current = new Set([...(seen.current || []), ...ids]);
        })
        .catch(() => {}),
    []
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (callState?.ended) setTimeout(load, 70000); // a call-back's outcome arrives about a minute after the call
  }, [callState?.ended, load]);

  // close the panel on an outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(null);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const recent = list.filter((m) => !m.attempts?.length).sort((a, b) => fresh.includes(b.id) - fresh.includes(a.id));
  const second = list.filter((m) => m.attempts?.length);
  const overdue = (arr) => arr.some((m) => m.dueAt < new Date().toISOString());
  const rows = open === 'recent' ? recent : open === 'second' ? second : [];

  async function mark(m, body) {
    await api.patch('/missed-calls/' + m.id, body);
    load();
    refreshStats();
  }

  return (
    <div className="missedbar" ref={ref}>
      <button className={`missed-tile red ${recent.length ? 'has' : ''} ${overdue(recent) ? 'late' : ''} ${open === 'recent' ? 'on' : ''}`} onClick={() => setOpen(open === 'recent' ? null : 'recent')} title="Missed calls not called back yet (TAT 30 min)">
        <span>Recent missed</span>
        <strong>{recent.length}</strong>
      </button>
      <button className={`missed-tile amber ${second.length ? 'has' : ''} ${overdue(second) ? 'late' : ''} ${open === 'second' ? 'on' : ''}`} onClick={() => setOpen(open === 'second' ? null : 'second')} title="Tried once, not reached: call again">
        <span>2nd round</span>
        <strong>{second.length}</strong>
      </button>

      {open && (
        <div className="missed-panel">
          <div className="row between">
            <strong>{open === 'recent' ? 'Recent missed calls: call back within 30 min' : '2nd round: tried, not reached'}</strong>
            <Link to="/missed" className="small" onClick={() => setOpen(null)}>
              All missed calls →
            </Link>
          </div>
          {rows.length === 0 && <div className="muted small pad">Nothing here. 🎉</div>}
          {rows.map((m) => (
            <div className={`missed-row ${fresh.includes(m.id) ? 'fresh' : ''}`} key={m.id}>
              <div className="missed-who">
                <strong>
                  {fresh.includes(m.id) && <span className="new-badge">NEW</span>} {m.phone}
                </strong>
                <span className="small">{m.member ? `${m.member.businessName} · ${m.member.name || ''}` : 'Not a registered member'}</span>
                <span className="small muted">
                  {fmtDate(m.at)} · <Due iso={m.dueAt} /> · {m.assignedTo || 'unassigned'}
                  {m.attempts?.length ? ` · ${m.attempts.length} attempt(s): ${m.attempts[m.attempts.length - 1].outcome}` : ''}
                </span>
              </div>
              <div className="row wrap">
                <span className={fresh.includes(m.id) ? 'call-now' : ''} onClick={() => setFresh((f) => f.filter((x) => x !== m.id))}>
                  <CallButton phone={m.phone} context={{ missedCallId: m.id }} label={fresh.includes(m.id) ? 'Call now' : 'Call back'} />
                </span>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    setOpen(null);
                    nav(`/new?phone=${m.phone}&missedId=${m.id}`);
                  }}
                >
                  Log case
                </button>
                <button className="btn sm" onClick={() => mark(m, { attempt: 'Not reachable' })} title="Tried, not reached: moves to 2nd round">
                  Not reachable
                </button>
                <button className="btn sm" onClick={() => mark(m, { attempt: 'No query (wrong / test call)', status: 'No query' })}>
                  No query
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
