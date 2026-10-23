import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, Select, fmtDate, useLoad, useMeta } from '../ui.jsx';
import MailboxCard from '../components/MailboxCard.jsx';

// Email previews in Microsoft Teams: what the CRM would send, posted to the team channel (nobody is emailed)
function TeamsPreviewCard({ enabled, onToggle }) {
  const [st] = useLoad(() => api.get('/teams-preview'));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  async function run(what) {
    setBusy(what);
    setMsg(null);
    try {
      const r = await api.post('/teams-preview/' + what);
      setMsg({ ok: true, text: what === 'test' ? 'Test message posted — check the Teams channel.' : `${r.count} sample emails posted to Teams.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
    setBusy('');
  }
  if (!st) return null;
  return (
    <section className="card">
      <h2>Email previews in Microsoft Teams</h2>
      {!st.configured ? (
        <div className="notice">Not connected: put the Teams workflow link in the private secrets file as TEAMS_WEBHOOK_URL and restart.</div>
      ) : (
        <>
          <label className="switch-row">
            <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
            <span>
              <strong>Post every email to Teams instead of sending it</strong>
              <div className="muted small">The team sees exactly what each email says and who it would go to. No customer, store or team receives anything while this is on.</div>
            </span>
          </label>
          <div className="row wrap">
            <button className="btn" disabled={!!busy} onClick={() => run('test')}>
              {busy === 'test' ? 'Sending…' : 'Send a test message'}
            </button>
            <button className="btn primary" disabled={!!busy} onClick={() => run('samples')}>
              {busy === 'samples' ? 'Posting…' : 'Post a sample of every email'}
            </button>
          </div>
          {msg && <div className={msg.ok ? 'notice ok' : 'error'}>{msg.text}</div>}
        </>
      )}
    </section>
  );
}

const SWITCHES = [
  ['autoImport', 'Create cases from new emails', 'Every new mail to the mailbox becomes a Pending case automatically (SOP). Off: mail waits in Email inbox → Mailbox until an agent clicks “Log case”.'],
  ['autoCategorise', 'Categorise new emails', 'Reads subject + body and sets case type, category, sub-category and store (rules from the SOP).'],
  ['aiReader', 'AI email reader', 'Claude reads each new email instead of the keyword rules: category down to sub-category 2, store, order / card / phone numbers, and a one-line summary on the timeline. Works only when ANTHROPIC_API_KEY is in the private secrets file; otherwise (or if it can’t answer) the keyword rules are used.'],
  ['autoAssign', 'Assign cases & missed calls', 'To the agent on shift with the fewest open items.'],
  ['autoAck', 'Acknowledge every new email', 'Customer gets the case number straight away.'],
  ['autoAnswer', 'Answer standard enquiries (not in the SOP)', 'Off by default: the SOP says to call the customer before creating the case. When on: Job → careers@ reply and close · Supplier → documents reply, Waiting · New membership → documents reply and close.'],
  ['autoInfoCheck', 'Information complete? (emails, not in the SOP)', 'Off by default: the SOP says an agent calls the customer first. When on: complaints / requests are checked against the SOP requirements. Missing → “information required” email, status Waiting. Customer reply → checked again (max 2 requests).'],
  ['autoEscalateComplete', 'Complete → escalate to store (not in the SOP)', 'Off by default (SOP: call first). When on: a complete complaint / request with a known store is escalated automatically.'],
  ['autoEscalationEmail', 'Email the store on escalation', 'Escalation template goes to the store SPOC the moment a case is escalated.'],
  ['autoStoreReplyResolve', 'Store reply → Resolved', 'A reply from the store SPOC (or any @cpwi.in address) on an escalated case moves it to Resolved.'],
  ['autoResolutionEmail', 'Email the resolution to the customer', 'Sent when a case moves to Resolved, with the store’s reply.'],
  ['autoConfirmationLead', 'Queue the confirmation call', 'Resolved case → Outbound leads “Confirmation / resolution”. The call outcome closes or re-escalates the case.'],
  ['autoFollowupLead', 'Queue the follow-up call', 'Waiting case → Outbound leads “Follow-up” to ask for the missing details. “Info received” moves the case back to Pending.'],
  ['autoSurveyLead', 'Queue a customer survey call', 'Closed case → Outbound leads “Customer survey” (SOP: collect feedback). Off by default.'],
  ['overdueReminder', 'Chase overdue escalations', 'TAT crossed → automatically to Level 1, then Level 2 (escalation matrix); after Level 2 a reminder every working day.'],
];

export default function Automation() {
  const { agents, refreshStats } = useMeta();
  const [data, reload] = useLoad(() => api.get('/automation'));
  const [s, setS] = useState(null);
  const [shifts, setShifts] = useState({});
  const [saved, setSaved] = useState('');
  const [test, setTest] = useState(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState('log');

  useEffect(() => {
    if (data) {
      setS(data.settings);
      setShifts(data.agentShifts || {});
    }
  }, [data]);

  if (!data || !s) return <Empty>Loading…</Empty>;

  async function save() {
    await api.put('/automation', { ...s, agentShifts: shifts });
    setSaved('Saved.');
    reload();
    setTimeout(() => setSaved(''), 2500);
  }

  async function runNow() {
    setRunning(true);
    await api.post('/automation/run').catch(() => {});
    setRunning(false);
    reload();
    refreshStats();
  }

  const num = (k, label, hint) => (
    <Field label={label} hint={hint}>
      <input type="number" min="0" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </Field>
  );
  const text = (k, label, hint, type = 'text') => (
    <Field label={label} hint={hint}>
      <input type={type} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </Field>
  );

  return (
    <>
      <div className="page-head">
        <h1>Automation</h1>
        <div className="row">
          <button className="btn" onClick={runNow} disabled={running}>
            {running ? 'Running…' : 'Run checks now'}
          </button>
          <button className="btn primary" onClick={save}>
            Save settings
          </button>
          {saved && <span className="muted small">{saved}</span>}
        </div>
      </div>

      <TeamsPreviewCard
        enabled={s.teamsPreview !== false}
        onToggle={async (v) => {
          await api.put('/automation', { ...data.settings, teamsPreview: v, agentShifts: data.agentShifts });
          reload();
        }}
      />
      <MailboxCard mail={data.mail} onChange={reload} />

      <section className="card">
        <h2>Rules</h2>
        <div className="switches">
          {SWITCHES.map(([k, label, hint]) => (
            <label key={k} className={`switch ${s[k] ? 'on' : ''}`}>
              <input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
              <span>
                <strong>{label}</strong>
                <span className="muted small">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Timers &amp; recipients</h2>
        <div className="grid">
          {text('mailTestTo', 'Test mode: send all emails to', 'While filled in, every outgoing email goes only to this address (subject [TEST]), so you can check emails without customers or stores receiving them. Empty = live', 'email')}
          {text('storeDigestTime', 'Daily store follow-up email at', 'Each store SPOC gets its pending list. Blank = off', 'time')}
          {text('l2Email', 'Level 1 escalation email', 'Used only while the store / team escalation matrix (Stores & settings) is empty', 'email')}
          {num('waitingReminderHours', 'Remind customer after (hours in Waiting)', '0 = off')}
          {text('supervisorEmail', 'Daily report to', 'Supervisor / process lead', 'email')}
          {text('dailyReportTime', 'Daily report at', 'End of day', 'time')}
        </div>
      </section>

      <section className="card">
        <h2>Agent shifts (for auto-assignment)</h2>
        <div className="grid">
          {agents.map((a) => (
            <Field key={a} label={a}>
              <Select
                value={shifts[a] || ''}
                onChange={(v) => setShifts({ ...shifts, [a]: v })}
                options={[...data.shifts.map((x) => ({ value: x, label: x.replace(/(\d+)-(\d+)/, (_, h1, h2) => `${fmtHour(h1)} – ${fmtHour(h2)}`) })), { value: 'Off', label: 'Off / on leave' }]}
                placeholder="Any time (9 AM – 9 PM)"
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="tabs">
          <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
            Activity log
          </button>
          <button className={tab === 'outbox' ? 'on' : ''} onClick={() => setTab('outbox')}>
            Outbox
          </button>
        </div>
        {tab === 'log' ? (
          data.log.length === 0 ? (
            <Empty>Nothing automated yet.</Empty>
          ) : (
            <table className="table compact">
              <tbody>
                {data.log.map((l, i) => (
                  <tr key={i}>
                    <td className="small muted nowrap">{fmtDate(l.at)}</td>
                    <td>{l.caseId ? <Link to={`/cases/${l.caseId}`}>{l.text}</Link> : l.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : data.outbox.length === 0 ? (
          <Empty>No emails yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.outbox.map((o) => (
                <tr key={o.id}>
                  <td className="small nowrap">{fmtDate(o.at)}</td>
                  <td className="small">{o.kind}</td>
                  <td className="small">
                    {o.to}
                    {o.cc && <div className="muted">cc {o.cc}</div>}
                  </td>
                  <td className="small">{o.caseId ? <Link to={`/cases/${o.caseId}`}>{o.subject}</Link> : o.subject}</td>
                  <td className={`small ${o.status === 'sent' ? '' : 'over'}`} title={o.error || ''}>
                    {o.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function fmtHour(h) {
  const n = Number(h);
  return `${n > 12 ? n - 12 : n} ${n >= 12 ? 'PM' : 'AM'}`;
}
