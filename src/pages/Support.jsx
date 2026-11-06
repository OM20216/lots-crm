import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ago, fmtDate, portalUrl, useLoad } from '../ui.jsx';

// The help desk manager's desk: the tokens agents raised with the support button.
export default function Support() {
  const [tickets, reload, error] = useLoad(() => api.get('/support/tickets'));
  const [info] = useLoad(() => api.get('/support'));
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  // new tokens and the agents' messages come in while the page is open
  useEffect(() => {
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);

  const list = (tickets || []).filter((t) => (showClosed ? true : t.status !== 'Closed'));
  const open = (tickets || []).filter((t) => t.status !== 'Closed').length;
  const current = list.find((t) => t.id === selected) || null;

  async function send() {
    if (!current || !reply.trim()) return;
    const t = await api.patch('/support/tickets/' + encodeURIComponent(current.id), { action: 'reply', reply: reply.trim() });
    setReply('');
    reload();
    return t;
  }

  async function close() {
    if (!current) return;
    await api.patch('/support/tickets/' + encodeURIComponent(current.id), { action: 'close' });
    reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support tokens</h1>
          <span className="muted">Questions the agents could not get answered by the CRM help articles. {open} open.</span>
        </div>
        <div className="row">
          <label className="row small">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> show closed
          </label>
          <button className="btn sm" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {info?.portal && (
        <div className="notice">
          Tokens are kept by the standalone support service, so this desk keeps working when the CRM is down. Standalone manager desk:{' '}
          <a href={portalUrl(info.portal, '/admin')} target="_blank" rel="noreferrer">
            {portalUrl(info.portal, '/admin')}
          </a>
        </div>
      )}

      <div className="sup-admin">
        <section className="card">
          <h2>Tokens</h2>
          {!list.length && <div className="empty">No tokens yet. They appear here when an agent uses the support button.</div>}
          <table className="table compact">
            <thead>
              <tr>
                <th>Token</th>
                <th>Agent</th>
                <th>Question</th>
                <th>Status</th>
                <th>Raised</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={current?.id === t.id ? 'on' : ''} onClick={() => setSelected(t.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{t.id}</strong>
                  </td>
                  <td>{t.agent}</td>
                  <td>{t.question.length > 70 ? t.question.slice(0, 70) + '…' : t.question}</td>
                  <td>
                    <span className={`badge st-${(t.status || '').toLowerCase()}`}>{t.status}</span>
                  </td>
                  <td className="small">{ago(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>{current ? current.id : 'A token'}</h2>
          {!current ? (
            <div className="empty">Pick a token to read it and answer the agent.</div>
          ) : (
            <>
              <div className="sup-admin-meta">
                <div>
                  <span className="muted small">Agent</span> <strong>{current.agent}</strong>
                </div>
                <div>
                  <span className="muted small">Raised</span> {fmtDate(current.createdAt)}
                </div>
                {current.context?.page && (
                  <div>
                    <span className="muted small">Page</span> {current.context.page}
                  </div>
                )}
                {current.context?.caseId && (
                  <div>
                    <span className="muted small">Case</span> {current.context.caseId}
                  </div>
                )}
                <div>
                  <span className="muted small">Notified</span> {notified(current)}
                </div>
              </div>

              <div className="sup-admin-q">{current.question}</div>

              <h3>Conversation</h3>
              {!(current.replies || []).length && <div className="muted small">No answer yet.</div>}
              {(current.replies || []).map((r, i) => (
                <div key={i} className={`sup-admin-reply ${r.from === 'agent' ? 'agent' : ''}`}>
                  <div className="small muted">
                    {r.from === 'agent' ? `Agent ${r.by}` : r.by} · {fmtDate(r.at)}
                  </div>
                  <div>{r.text}</div>
                </div>
              ))}

              {current.status !== 'Closed' && (
                <>
                  <h3>Answer the agent</h3>
                  <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your answer — it appears in the agent’s support panel." />
                  <div className="row">
                    <button className="btn primary" disabled={!reply.trim()} onClick={send}>
                      Send answer
                    </button>
                    <button className="btn" onClick={close}>
                      Close token
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

const notified = (t) => {
  const n = t.notified || {};
  const bits = [];
  if (n.email) bits.push(n.email === 'sent' ? 'email' : `email ${n.email}`);
  if (n.teams) bits.push(n.teams === 'sent' ? 'Teams' : `Teams ${n.teams}`);
  if (!bits.length) return 'nobody (no manager email / Teams)';
  return bits.join(', ');
};
