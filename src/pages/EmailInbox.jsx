import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, StatusBadge, ago, useLoad, useMeta } from '../ui.jsx';
import Mailbox from '../components/Mailbox.jsx';

const blank = { fromEmail: '', fromName: '', subject: '', body: '' };

export default function EmailInbox() {
  const nav = useNavigate();
  const { refreshStats, integrations } = useMeta();
  const [view, setView] = useState(integrations?.mail ? 'mailbox' : 'cases');
  const [testTo, setTestTo] = useState('');
  useEffect(() => {
    if (integrations?.mail) setView((v) => (v === 'cases' ? 'mailbox' : v));
    api.get('/automation').then((a) => setTestTo(a.settings.mailTestTo || '')).catch(() => {});
  }, [integrations?.mail]);
  const [tab, setTab] = useState('Pending');
  const [cases, reload] = useLoad(() => api.get('/cases?channel=Email&status=' + tab), [tab]);
  const [mail, setMail] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');

  async function logEmail(e) {
    e.preventDefault();
    setErr('');
    if (!mail.fromEmail || !mail.body) return setErr('Sender email and message are required.');
    try {
      const r = await api.post('/email-intake', mail);
      setMail(blank);
      setMsg(r);
      reload();
      refreshStats();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Email inbox</h1>
          <span className="muted">contactus@cpwi.in · {integrations?.mail ? 'connected: new mail becomes a Pending case automatically' : 'mailbox not connected'}</span>
        </div>
        <div className="tabs">
          <button className={view === 'mailbox' ? 'on' : ''} onClick={() => setView('mailbox')}>
            Mailbox
          </button>
          <button className={view === 'cases' ? 'on' : ''} onClick={() => setView('cases')}>
            Email cases
          </button>
          <button className={view === 'manual' ? 'on' : ''} onClick={() => setView('manual')}>
            Log by hand
          </button>
        </div>
      </div>
      {testTo && <div className="notice">Test mode is on: every outgoing email goes to <strong>{testTo}</strong>, not to customers or stores (Automation → Mailbox).</div>}

      {view === 'mailbox' &&
        (integrations?.mail ? (
          <Mailbox testTo={testTo} />
        ) : (
          <div className="card">
            <h2>Mailbox not connected</h2>
            <p>
              Connect contactus@cpwi.in once: <Link to="/automation">Automation → Mailbox → Sign in with Microsoft</Link>, with an account that can open the mailbox. Then the inbox appears here, every new mail becomes a case, and replies go out in the customer's thread.
            </p>
          </div>
        ))}

      {view !== 'mailbox' && (
      <div className="two-col">
        {view === 'cases' && (
        <section className="card">
          <div className="tabs">
            {['Pending', 'Waiting', 'Escalated', 'Resolved'].map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          {!cases ? (
            <Empty>Loading…</Empty>
          ) : cases.length === 0 ? (
            <Empty>No {tab.toLowerCase()} email cases.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Categorised</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const stale = tab === 'Pending' && !c.caseType && Date.now() - new Date(c.createdAt) > 5 * 60000;
                  return (
                    <tr key={c.id} onClick={() => nav(`/cases/${c.id}`)} className="clickable">
                      <td>
                        <Link to={`/cases/${c.id}`}>{c.id}</Link>
                      </td>
                      <td>
                        {c.name || '—'}
                        <div className="muted small">{c.email}</div>
                      </td>
                      <td>{c.subject || <span className="muted">(no subject)</span>}</td>
                      <td>{c.caseType ? `${c.caseType} · ${c.category}` : <span className="badge st-waiting">To categorise</span>}</td>
                      <td className={stale ? 'over' : ''}>{ago(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        )}

        {view === 'manual' && (
          <form className="card" onSubmit={logEmail}>
            <h2>Log an incoming email</h2>
            <p className="muted small">
              Paste the mail here until the mailbox is connected. A reply whose subject contains a case number (e.g. <code>[LWS-000012]</code>) is added to that case instead of opening a new one.
            </p>
            <div className="grid one">
              <Field label="From email *">
                <input type="email" value={mail.fromEmail} onChange={(e) => setMail({ ...mail, fromEmail: e.target.value })} />
              </Field>
              <Field label="From name">
                <input value={mail.fromName} onChange={(e) => setMail({ ...mail, fromName: e.target.value })} />
              </Field>
              <Field label="Subject">
                <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
              </Field>
              <Field label="Message *">
                <textarea rows={7} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
              </Field>
            </div>
            {err && <div className="error">{err}</div>}
            <div className="row end">
              <button className="btn primary">Create case</button>
            </div>
            {msg && (
              <div className="notice ok">
                {msg.threaded ? 'Added to existing case ' : 'Created Pending case '}
                <Link to={`/cases/${msg.case.id}`}>{msg.case.id}</Link> <StatusBadge status={msg.case.status} />
              </div>
            )}
          </form>
        )}
        <aside>
          <div className="card">
            <h3>Email SOP</h3>
            <ol className="tight">
              <li>Open the Pending case.</li>
              <li>Call the customer to understand the complete details.</li>
              <li>Categorise it (case type, category, store) on the same case.</li>
              <li>Reply using the right template.</li>
              <li>Resolve (ROT), move to Waiting for missing info, or escalate to the store.</li>
            </ol>
          </div>
        </aside>
      </div>
      )}
    </>
  );
}
