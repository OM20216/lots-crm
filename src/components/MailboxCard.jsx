import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ago, copy, fmtDate } from '../ui.jsx';

// Mailbox connection: "Sign in with Microsoft" (device code) or the IT app secret.
export default function MailboxCard({ mail, onChange }) {
  const [status, setStatus] = useState(mail.signin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [test, setTest] = useState(null);

  useEffect(() => setStatus(mail.signin), [mail.signin]);

  // while a code is shown, check every 3 s whether the sign-in finished
  const waiting = status?.pending?.status === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const s = await api.get('/mail/signin').catch(() => null);
      if (!s) return;
      setStatus(s);
      if (s.mode === 'signin' || s.pending?.status === 'failed') onChange?.();
    }, 3000);
    return () => clearInterval(t);
  }, [waiting, onChange]);

  async function start() {
    setErr('');
    setBusy(true);
    try {
      setStatus(await api.post('/mail/signin'));
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!window.confirm('Disconnect the mailbox? New email will stop coming in until someone signs in again.')) return;
    setStatus(await api.delete('/mail/signin'));
    onChange?.();
  }

  const p = status?.pending;
  return (
    <section className="card">
      <h2>Mailbox ({mail.mailbox})</h2>

      {status?.mode === 'signin' && (
        <div className={`notice ${mail.lastError || status.error ? '' : 'ok'}`}>
          Connected with Microsoft sign-in as <strong>{status.account}</strong> (since {fmtDate(status.connectedAt)}) · checked {ago(mail.lastPoll)} · {mail.imported} mails imported since start
          {(status.error || mail.lastError) && <div className="error">Last error: {status.error || mail.lastError}</div>}
        </div>
      )}
      {status?.mode === 'app' && (
        <div className={`notice ${mail.lastError ? '' : 'ok'}`}>
          Connected with the IT app registration · checked {ago(mail.lastPoll)} · {mail.imported} mails imported since start
          {mail.lastError && <div className="error">Last error: {mail.lastError}</div>}
        </div>
      )}
      {!status?.mode && !p && (
        <div className="notice">
          Not connected. Emails are logged by hand for now, and automatic emails are kept in the outbox as <em>not sent</em>. Sign in once with a Microsoft account that can open <strong>{mail.mailbox}</strong>. After that the CRM reads new mail every minute and sends replies from it by itself.
        </div>
      )}

      {p?.status === 'waiting' && (
        <div className="signin-code">
          <div>
            1. Open{' '}
            <a href={p.verificationUri} target="_blank" rel="noreferrer">
              {p.verificationUri}
            </a>
          </div>
          <div>
            2. Enter this code:{' '}
            <strong className="code" onClick={() => copy(p.userCode)} title="Click to copy">
              {p.userCode}
            </strong>{' '}
            <button className="link" onClick={() => copy(p.userCode)}>
              copy
            </button>
          </div>
          <div>
            3. Sign in with the Microsoft account that has access to <strong>{mail.mailbox}</strong> and accept the permissions.
          </div>
          <div className="muted small">Waiting for sign-in… the code works until {fmtDate(p.expiresAt)}.</div>
        </div>
      )}
      {p?.status === 'failed' && <div className="error">Sign-in did not finish: {p.error}</div>}
      {err && <div className="error">{err}</div>}

      <div className="row wrap">
        {status?.mode !== 'app' && (
          <button className="btn primary" onClick={start} disabled={busy || waiting}>
            {status?.mode === 'signin' ? 'Sign in again / change account' : 'Sign in with Microsoft'}
          </button>
        )}
        {status?.mode === 'signin' && (
          <button className="btn" onClick={disconnect}>
            Disconnect
          </button>
        )}
        <button className="btn sm" onClick={async () => setTest(await api.get('/mail/test'))}>
          Test mailbox connection
        </button>
        {test && (test.ok ? <span className="small">OK: inbox {test.inboxItems} mails, {test.unread} unread</span> : <span className="small over">{test.error || 'Not connected'}</span>)}
      </div>
      <p className="muted small">
        The account needs <strong>Full Access</strong> and <strong>Send As</strong> on {mail.mailbox} (set by the Microsoft 365 admin). The sign-in is kept only on this computer, in the private credentials folder, and renews itself.
      </p>
    </section>
  );
}
