import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { EMAIL_TEMPLATES, fillTemplate } from '../knowledge.js';
import { StatusBadge, ago, fmtDate, useMeta } from '../ui.jsx';
import Icon from './Icon.jsx';

// Live view of contactus@cpwi.in, like the VMM CRM's email screen:
// Inbox / Sent, conversation view, log a case, reply inside the thread, attachments, "being handled by".
export default function Mailbox({ testTo }) {
  const nav = useNavigate();
  const { stores, agent, refreshStats } = useMeta();
  const [folder, setFolder] = useState('inbox');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState(null);
  const [listErr, setListErr] = useState('');
  const [sel, setSel] = useState(null);
  const [thread, setThread] = useState(null);
  const [attach, setAttach] = useState([]);
  const [claimedBy, setClaimedBy] = useState(null);
  const [reply, setReply] = useState({ body: '', cc: '', tpl: '' });
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');
  const selRef = useRef(null);
  selRef.current = sel;

  const load = useCallback(() => {
    setListErr('');
    api
      .get(`/mail/messages?folder=${folder}&q=${encodeURIComponent(query)}`)
      .then(setList)
      .catch((e) => {
        setList([]);
        setListErr(e.message);
      });
  }, [folder, query]);

  useEffect(() => {
    setList(null);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // release the "being handled" lock when leaving the email or the page
  useEffect(() => () => selRef.current && api.delete(`/mail/messages/${encodeURIComponent(selRef.current.id)}/claim`).catch(() => {}), []);

  async function open(m) {
    if (sel) api.delete(`/mail/messages/${encodeURIComponent(sel.id)}/claim`).catch(() => {});
    setSel(m);
    setThread(null);
    setAttach([]);
    setErr('');
    setFlash('');
    setReply({ body: '', cc: '', tpl: '' });
    const id = encodeURIComponent(m.id);
    api.get(`/mail/thread/${encodeURIComponent(m.conversationId)}`).then((t) => setThread(t.length ? t.reverse() : null)).catch((e) => setErr(e.message));
    if (m.hasAttachments) api.get(`/mail/messages/${id}/attachments`).then(setAttach).catch(() => {});
    if (folder === 'inbox') {
      api.post(`/mail/messages/${id}/claim`).then(() => setClaimedBy(agent)).catch((e) => setClaimedBy(e.data?.claimedBy || null));
      if (!m.isRead) {
        api.post(`/mail/messages/${id}/read`, { isRead: true }).catch(() => {});
        setList((l) => l?.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)));
      }
    }
  }

  async function logCase() {
    setBusy('log');
    setErr('');
    try {
      const r = await api.post(`/mail/messages/${encodeURIComponent(sel.id)}/log`);
      setSel((s) => ({ ...s, caseId: r.case.id, caseStatus: r.case.status }));
      setList((l) => l?.map((x) => (x.id === sel.id ? { ...x, caseId: r.case.id, caseStatus: r.case.status } : x)));
      setFlash(r.existing ? `Already on case ${r.case.id}.` : r.threaded ? `Added to case ${r.case.id}.` : `Case ${r.case.id} created and assigned to you.`);
      refreshStats();
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
  }

  function applyTemplate(id) {
    const t = EMAIL_TEMPLATES.find((x) => x.id === id);
    if (!t) return setReply((r) => ({ ...r, tpl: '' }));
    const vals = { id: sel.caseId || '(case no.)', name: sel.fromName, subject: sel.subject, email: sel.fromEmail };
    setReply((r) => ({ ...r, tpl: id, body: fillTemplate(t.body, vals, stores) }));
  }

  async function send() {
    setBusy('send');
    setErr('');
    try {
      const r = await api.post(`/mail/messages/${encodeURIComponent(sel.id)}/reply`, { body: reply.body, cc: reply.cc, caseId: sel.caseId });
      setFlash(`Reply sent ${r.inThread ? 'in the customer’s thread' : ''}${r.test ? ` (TEST: to ${r.test})` : ''}${r.caseId ? `, logged on ${r.caseId}` : ''}.`);
      setReply({ body: '', cc: '', tpl: '' });
      open(sel);
    } catch (e) {
      setErr(e.message);
    }
    setBusy('');
  }

  async function markUnread() {
    await api.post(`/mail/messages/${encodeURIComponent(sel.id)}/read`, { isRead: false }).catch(() => {});
    setList((l) => l?.map((x) => (x.id === sel.id ? { ...x, isRead: false } : x)));
    setFlash('Marked as unread.');
  }

  const lockedByOther = claimedBy && claimedBy !== agent;

  return (
    <div className="mailbox">
      <div className="mb-list">
        <div className="mb-list-head">
          <div className="tabs">
            {[
              ['inbox', 'Inbox'],
              ['sent', 'Sent'],
            ].map(([k, l]) => (
              <button key={k} className={folder === k ? 'on' : ''} onClick={() => (setFolder(k), setSel(null))}>
                {l}
              </button>
            ))}
            <button className="mb-refresh" onClick={load} title="Refresh">
              ⟳
            </button>
          </div>
          <form
            className="mb-search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <Icon name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail (sender, subject, text)…" />
            {query && (
              <button type="button" className="link" onClick={() => (setQ(''), setQuery(''))}>
                clear
              </button>
            )}
          </form>
        </div>
        {listErr && <div className="error">{listErr}</div>}
        {!list && <div className="empty">Loading mailbox…</div>}
        {list && list.length === 0 && !listErr && <div className="empty">{query ? 'No mail matches.' : 'No mail.'}</div>}
        <div className="mb-rows">
          {list?.map((m) => (
            <button key={m.id} className={`mb-row ${sel?.id === m.id ? 'on' : ''} ${m.isRead || folder === 'sent' ? '' : 'unread'}`} onClick={() => open(m)}>
              <div className="mb-row-top">
                <span className="mb-from">{folder === 'sent' ? `To: ${m.to.join(', ')}` : m.fromName || m.fromEmail}</span>
                <span className="mb-time">{ago(m.receivedAt)}</span>
              </div>
              <div className="mb-subject">{m.subject || '(no subject)'}</div>
              <div className="mb-preview">{m.preview}</div>
              <div className="mb-tags">
                {m.caseId ? (
                  <span className={`badge st-${(m.caseStatus || '').toLowerCase()}`}>{m.caseId}</span>
                ) : (
                  folder === 'inbox' && <span className="mb-tag new">Not logged</span>
                )}
                {m.claimedBy && <span className="mb-tag claim">Being handled by {m.claimedBy}</span>}
                {m.hasAttachments && <span className="mb-tag">📎</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-view">
        {!sel ? (
          <div className="empty">Select an email to read the conversation, log a case or reply.</div>
        ) : (
          <>
            <div className="mb-view-head">
              <div>
                <h2>{sel.subject || '(no subject)'}</h2>
                <div className="muted small">
                  {sel.fromName} &lt;{sel.fromEmail}&gt; · {fmtDate(sel.receivedAt)}
                </div>
              </div>
              <div className="row wrap">
                {sel.caseId ? (
                  <Link className="btn primary" to={`/cases/${sel.caseId}`}>
                    Open case {sel.caseId}
                  </Link>
                ) : (
                  folder === 'inbox' && (
                    <button className="btn primary" onClick={logCase} disabled={busy === 'log'}>
                      {busy === 'log' ? 'Logging…' : '+ Log case'}
                    </button>
                  )
                )}
                {folder === 'inbox' && (
                  <button className="btn" onClick={markUnread}>
                    Mark unread
                  </button>
                )}
              </div>
            </div>
            {lockedByOther && <div className="notice">Being handled by {claimedBy}. Check with them before replying.</div>}
            {flash && <div className="notice ok">{flash}</div>}
            {err && <div className="error">{err}</div>}
            {attach.length > 0 && (
              <div className="mb-attach">
                📎{' '}
                {attach.map((a) => (
                  <a key={a.id} href={`/api/mail/messages/${encodeURIComponent(sel.id)}/attachments/${encodeURIComponent(a.id)}`}>
                    {a.name} <span className="muted small">({Math.round((a.size || 0) / 1024)} KB)</span>
                  </a>
                ))}
              </div>
            )}

            <div className="mb-thread">
              {!thread && <div className="empty">Loading conversation…</div>}
              {thread?.map((t, i) => (
                <div key={t.id} className={`mb-msg ${t.sentByUs ? 'ours' : ''}`}>
                  <div className="mb-msg-head">
                    <span className="mb-avatar">{(t.fromName || t.fromEmail || '?').trim()[0]?.toUpperCase()}</span>
                    <div className="mb-msg-who">
                      <strong>{t.fromName || t.fromEmail}</strong> <span className="muted small">&lt;{t.fromEmail}&gt;</span>
                      {i === 0 && <span className="mb-tag new">Latest</span>}
                      {t.sentByUs && <span className="mb-tag ours">Sent by us</span>}
                      <div className="muted small">
                        To: {t.to.join(', ')}
                        {t.cc.length ? ` · CC: ${t.cc.join(', ')}` : ''}
                      </div>
                    </div>
                    <span className="muted small">{fmtDate(t.receivedAt)}</span>
                  </div>
                  <MailBody html={t.html} />
                </div>
              ))}
            </div>

            {folder === 'inbox' && (
              <div className="mb-reply">
                <div className="row between">
                  <strong>Reply in this thread to {sel.fromEmail}</strong>
                  <select value={reply.tpl} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">Use a template…</option>
                    {EMAIL_TEMPLATES.filter((t) => !['escalate', 'store-followup'].includes(t.id)).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea rows={6} value={reply.body} onChange={(e) => setReply((r) => ({ ...r, body: e.target.value }))} placeholder="Write your reply… (sent as a LOTS-branded email in the customer's thread)" />
                <div className="row">
                  <input value={reply.cc} onChange={(e) => setReply((r) => ({ ...r, cc: e.target.value }))} placeholder="CC (optional)" />
                  <button className="btn primary" onClick={send} disabled={busy === 'send' || !reply.body.trim()}>
                    {busy === 'send' ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
                {testTo && <div className="small over">Test mode: the reply goes to {testTo}, not to the customer.</div>}
                {!sel.caseId && <div className="muted small">Not logged as a case yet: the reply is sent, but goes on a case timeline only once the email is logged.</div>}
              </div>
            )}
            {sel.caseId && (
              <button className="link" onClick={() => nav(`/cases/${sel.caseId}`)}>
                Go to case {sel.caseId} → categorise, call the customer, resolve / escalate
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Email HTML shown in a sandboxed frame: no scripts, nothing can reach the CRM page. Grows to fit its content.
function MailBody({ html }) {
  const ref = useRef(null);
  const [h, setH] = useState(120);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1d2230;margin:0;word-wrap:break-word}img{max-width:100%;height:auto}blockquote{border-left:3px solid #e5e7eb;margin:8px 0;padding-left:10px;color:#6b7280}</style></head><body>${html || ''}</body></html>`;
  return (
    <iframe
      ref={ref}
      title="Email"
      className="mb-body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height: h }}
      onLoad={() => {
        try {
          setH(Math.min(1400, ref.current.contentDocument.body.scrollHeight + 16));
        } catch {
          /* keep default */
        }
      }}
    />
  );
}
