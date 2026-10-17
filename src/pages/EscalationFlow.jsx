import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, { Background, Controls, Handle, MarkerType, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import './LotsFlow.css';
import { api } from '../api.js';
import { useMeta } from '../ui.jsx';

// Escalation workflow of the LOTS HO escalation matrix (src/escalationMatrix.js) as a flow chart:
// First Time Resolution → Level 1 → Level 2 → daily reminder, and how a reply closes the loop.
// Pick a row of the sheet: every box shows that row's SPOCs, copy list and TAT, and the cases there now.

function EscNode({ data, selected }) {
  return (
    <div className={`lf-node tone-${data.tone} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="t" className="lf-handle" />
      <Handle type="target" position={Position.Left} id="l" className="lf-handle" />
      <Handle type="target" position={Position.Right} id="rt" className="lf-handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="lf-handle" />
      <Handle type="source" position={Position.Right} id="r" className="lf-handle" />
      <Handle type="source" position={Position.Left} id="ls" className="lf-handle" />
      <div className="lf-node-icon">{data.icon}</div>
      <div className="lf-node-body">
        <div className="lf-node-title">
          {data.label}
          {data.start && <span className="lf-badge start">start</span>}
          {data.end && <span className="lf-badge end">end</span>}
          {data.tat && <span className="lf-badge tat">{data.tat}</span>}
          {data.auto && <span className="lf-badge auto">auto</span>}
        </div>
        {data.detail && <div className="lf-node-detail">{data.detail}</div>}
        {data.live && data.live.n != null && (
          <div className="lf-node-foot">
            <span className={`lf-live ${data.live.alert ? 'alert' : ''}`}>
              {data.live.n} <span>{data.live.label}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { esc: EscNode };
const n = (id, x, y, data) => ({ id, type: 'esc', position: { x, y }, data });
const S = { strokeWidth: 2, strokeDasharray: '6 6' };
const GREEN = '#22c55e', RED = '#ef4444', AMBER = '#f59e0b', GRAY = '#9ca3af';
const e = (source, target, label, color, { animated, from = 'b', to = 't' } = {}) => ({
  id: `e-${source}-${target}-${from}`,
  source,
  target,
  sourceHandle: from,
  targetHandle: to,
  label,
  style: color ? { ...S, stroke: color } : S,
  markerEnd: { type: MarkerType.ArrowClosed, color },
  animated,
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 4,
});

const names = (list) => (list || []).map((x) => x.split('@')[0]).join(', ');
const caseOf = (m) => [m.caseType, m.category, m.sub2].filter(Boolean).join(' › ');

/** Boxes for one row of the sheet. */
function buildNodes(row, live) {
  const st = row.stages;
  const stage = (i, x, y, icon, tone) =>
    n(`s${i}`, x, y, {
      icon,
      tone,
      label: st[i].label,
      tat: st[i].tatText,
      auto: i > 0,
      detail: `To ${names(st[i].to)}${st[i].cc.length ? ` · cc ${st[i].cc.length} people` : ''}`,
      live: live[`s${i}`],
      to: '/followups',
      stage: st[i],
      how:
        i === 0
          ? `The agent escalates the case: the escalation email goes to the SPOC with this list in copy, and the due date is ${st[0].tatText}${st[0].tat.unit === 'hours' ? ' (counted 9 AM – 9 PM, Monday–Saturday)' : ''}.`
          : `Automatic when the ${st[i - 1].label} TAT (${st[i - 1].tatText}) passes, or at once with “Escalate to ${st[i].label} now” on the case page. The email says which TAT was missed; new due date ${st[i].tatText}.`,
    });
  return [
    n('start', 380, 0, {
      icon: '▶️', label: 'Case escalated', tone: 'start', start: true,
      detail: caseOf(row.match),
      how: `Cases of this type (${caseOf(row.match)}) follow the “${row.row}” row of the HO escalation matrix. The agent clicks Escalate on the case page; the CRM picks the row from the case type.`,
      to: '/cases?status=Escalated',
    }),
    stage(0, 380, 160, '1️⃣', 'violet'),
    stage(1, 380, 400, '2️⃣', 'amber'),
    stage(2, 380, 640, '3️⃣', 'red'),
    n('remind', 380, 880, {
      icon: '⏰', label: 'Daily reminder to Level 2', tone: 'red', auto: true,
      detail: `Level 2 TAT (${st[2].tatText}) passed · same To / Cc · every working day`,
      how: 'After Level 2 there is no further level: the CRM sends Level 2 a reminder every working day until the case is resolved.',
      to: '/followups',
    }),
    n('daily', -60, 520, {
      icon: '🔁', label: 'Daily follow-up', tone: 'blue', auto: true,
      detail: 'Agent calls the SPOC every day · automatic morning email per row',
      how: 'Follow-ups lists every escalated case not called today. The morning email goes to the SPOCs of each case’s current stage, with the stage and due date of each case. Log the call with the date the SPOC promised.',
      to: '/followups',
    }),
    n('reply', 820, 300, {
      icon: '📨', label: 'SPOC replies by email', tone: 'violet', auto: true,
      detail: 'Replies from any address of the row are recognised',
      how: 'A reply reading like a resolution (“resolved”, “has been shared”, “processed”…) moves the case to Resolved. A date in the reply (“by tomorrow”, “within 2 days”) becomes the promised date.',
      to: '/followups',
    }),
    n('notyet', 820, 540, {
      icon: '🔎', label: '“We are checking” / unclear', tone: 'amber',
      detail: 'Stays escalated · flagged “replied — check” for an agent',
      live: live.review,
      how: 'The agent reads the reply: “It is the resolution → Resolved” or “Not yet — keep escalated”. A missed promised date is flagged on Follow-ups and the Dashboard.',
      to: '/followups',
    }),
    n('resolved', 1220, 300, {
      icon: '✅', label: 'Resolved', tone: 'green', auto: true,
      detail: 'Resolution emailed to the customer',
      how: 'The resolution email goes to the customer and a confirmation call is queued in Outbound calls.',
      to: '/cases?status=Resolved',
    }),
    n('confirm', 1220, 540, {
      icon: '🤝', label: 'Confirmation call', tone: 'amber', auto: true,
      detail: 'Is the customer satisfied?',
      how: 'Satisfied → the case is closed. Not satisfied → it goes back to the SPOC (escalated again, from First Time Resolution).',
      to: '/leads',
    }),
    n('closed', 1220, 780, { icon: '🏁', label: 'Case closed', tone: 'green', end: true, detail: 'Customer confirms', to: '/cases?status=Closed' }),
  ];
}

const EDGES = [
  e('start', 's0', 'escalate', RED, { animated: true }),
  e('s0', 's1', 'FTR TAT passed', RED),
  e('s1', 's2', 'Level 1 TAT passed', RED),
  e('s2', 'remind', 'Level 2 TAT passed', RED),
  e('remind', 's2', 'every working day', AMBER, { from: 'r', to: 'rt' }),
  e('s0', 'daily', null, GRAY, { from: 'ls', to: 't' }),
  e('s1', 'daily', null, GRAY, { from: 'ls', to: 't' }),
  e('s2', 'daily', null, GRAY, { from: 'ls', to: 't' }),
  e('s0', 'reply', 'reply', GREEN, { from: 'r', to: 'l' }),
  e('s1', 'reply', 'reply', GREEN, { from: 'r', to: 'l' }),
  e('s2', 'reply', 'reply', GREEN, { from: 'r', to: 'l' }),
  e('reply', 'resolved', 'reads like a resolution', GREEN, { animated: true, from: 'r', to: 'l' }),
  e('reply', 'notyet', 'not clear', AMBER),
  e('notyet', 'resolved', 'agent: it is the resolution', GREEN, { from: 'r', to: 'l' }),
  e('resolved', 'confirm'),
  e('confirm', 'closed', 'satisfied', GREEN, { animated: true }),
  e('confirm', 'start', 'not satisfied → escalate again', RED, { from: 'r', to: 'rt' }),
];

export default function EscalationFlow() {
  const nav = useNavigate();
  const { hoMatrix } = useMeta();
  const rows = hoMatrix?.rows || [];
  const [key, setKey] = useState('');
  const [cases, setCases] = useState([]);
  const [active, setActive] = useState(null);
  const row = rows.find((r) => r.key === key) || rows[0];

  useEffect(() => {
    const load = () => api.get('/cases?status=Escalated').then(setCases).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // cases of this row at each stage now
  const live = useMemo(() => {
    if (!row) return {};
    const mine = cases.filter((c) => c.escalatedTo?.kind === 'matrix' && c.escalatedTo.code === row.key);
    const at = (lvl) => mine.filter((c) => (c.escalationLevel || 1) === lvl);
    const nowIso = new Date().toISOString();
    const stat = (list) => ({ n: list.length, label: list.some((c) => c.dueAt < nowIso) ? `open · ${list.filter((c) => c.dueAt < nowIso).length} overdue` : 'open', alert: list.some((c) => c.dueAt < nowIso) });
    return {
      s0: stat(at(1)),
      s1: stat(at(2)),
      s2: stat(at(3)),
      review: { n: mine.filter((c) => c.storeReplyReview).length, label: 'replies to check', alert: mine.some((c) => c.storeReplyReview) },
    };
  }, [cases, row]);

  const nodes = useMemo(() => (row ? buildNodes(row, live) : []), [row, live]);
  const current = active && nodes.find((x) => x.id === active)?.data;
  if (!row) return <div className="empty">Loading the escalation matrix…</div>;

  return (
    <div className="lf-page">
      <div className="page-head">
        <div>
          <h1>Escalation flow</h1>
          <div className="muted small">
            LOTS HO escalation matrix ({hoMatrix.source}) as a flow, with live counts. Pick a case type; click a box for its people and what the CRM does. <span className="lf-badge auto">auto</span> = done by the CRM.
          </div>
        </div>
        <select value={row.key} onChange={(ev) => (setKey(ev.target.value), setActive(null))} className="ef-pick">
          {rows.map((r) => (
            <option key={r.key} value={r.key}>
              {r.row}
            </option>
          ))}
        </select>
      </div>
      <div className="lf-wrap">
        <div className="lf-container">
          <ReactFlow
            key={row.key}
            nodes={nodes}
            edges={EDGES}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setActive(node.id)}
            onPaneClick={() => setActive(null)}
            nodesDraggable={false}
            fitView
            minZoom={0.2}
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {current && (
          <aside className="lf-panel">
            <button className="lf-panel-close" onClick={() => setActive(null)} aria-label="Close">
              ×
            </button>
            <div className="lf-panel-title">
              {current.icon} {current.label}
            </div>
            {current.tat && <div className="lf-panel-tat">TAT: {current.tat}</div>}
            {current.detail && !current.stage && <p className="lf-panel-detail">{current.detail}</p>}
            {current.stage && (
              <>
                <div className="lf-panel-sub">SPOC (To)</div>
                <ul className="lf-panel-list">
                  {current.stage.to.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {current.stage.cc.length > 0 && (
                  <>
                    <div className="lf-panel-sub">Escalation (Cc)</div>
                    <ul className="lf-panel-list">
                      {current.stage.cc.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                {current.stage.toConfirm && <div className="hom-flag small">⚠ To confirm with LOTS: {current.stage.toConfirm}</div>}
                {current.stage.fixed && <div className="hom-flag small">✎ {current.stage.fixed}</div>}
              </>
            )}
            {current.live && current.live.n != null && (
              <div className={`lf-panel-live ${current.live.alert ? 'alert' : ''}`}>
                <strong>{current.live.n}</strong> {current.live.label}
              </div>
            )}
            {current.how && (
              <>
                <div className="lf-panel-sub">In this CRM {current.auto && <span className="lf-badge auto">auto</span>}</div>
                <p className="lf-panel-detail">{current.how}</p>
              </>
            )}
            {current.to && (
              <button className="btn primary block" onClick={() => nav(current.to)}>
                Open in CRM →
              </button>
            )}
            <button className="btn block ef-edit" onClick={() => nav('/settings')}>
              Edit the matrix (Stores &amp; settings)
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
