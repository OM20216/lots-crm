// The floating support button: answers questions about the LOTS CRM, and creates a support token
// (SUP-000123) for the help desk manager when it cannot answer. On a token the agent and the manager chat.
import { useEffect, useRef, useState } from 'react';
import { api, currentAgent } from '../api.js';
import { portalUrl } from '../ui.jsx';
import Icon from './Icon.jsx';

const GREETING =
  'Hi! I answer questions about the LOTS CRM — logging a case, the statuses, the escalation matrix, TATs, the dialer, admin pages. If I don’t know, I’ll raise a support token for the help desk manager.';

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** A token's conversation as chat messages: the question, then the manager's answers and the agent's messages. */
const thread = (t) => [
  { from: 'me', text: t.question, title: t.id, ts: t.createdAt },
  ...(t.replies || []).map((r) => ({ from: r.from === 'agent' ? 'me' : 'manager', text: r.text, title: r.from === 'agent' ? '' : r.by, ts: r.at })),
];
const managerReplies = (t) => (t?.replies || []).filter((r) => r.from !== 'agent').length;

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const [topics, setTopics] = useState(false);
  const [token, setToken] = useState(null);
  const [toManager, setToManager] = useState(true); // with an open token, the input goes to the help desk manager
  const [pending, setPending] = useState(''); // the question waiting for a token
  const [unread, setUnread] = useState(0);
  const endRef = useRef(null);
  const seen = useRef(0); // the manager's answers already shown
  const openRef = useRef(open);
  openRef.current = open;

  const page = () => (typeof window !== 'undefined' ? window.location.pathname : '');
  const live = token && token.status !== 'Closed';

  // the agent's open token, also while the panel is closed (so an answer shows as a badge)
  useEffect(() => {
    let alive = true;
    api
      .get('/support/tickets')
      .then((list) => {
        const mine = alive && list.find((t) => t.agent === currentAgent() && t.status !== 'Closed');
        if (!mine) return;
        setToken(mine);
        seen.current = managerReplies(mine);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // open the panel: greeting, suggested questions, and the open token's conversation
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMsgs((m) => (m.length ? m : [{ from: 'bot', text: GREETING }, ...(live ? thread(token) : [])]));
    api
      .get('/support')
      .then((d) => alive && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the help desk manager's answers come back on the open token: every 15 s with the panel open, 60 s closed
  useEffect(() => {
    if (!live) return;
    const id = token.id;
    const t = setInterval(
      () =>
        api
          .get('/support/tickets/' + encodeURIComponent(id))
          .then((t2) => {
            setToken(t2);
            const answers = (t2.replies || []).filter((r) => r.from !== 'agent');
            const fresh = answers.slice(seen.current);
            if (!fresh.length) return;
            seen.current = answers.length;
            setMsgs((m) => (m.length ? [...m, ...fresh.map((r) => ({ from: 'manager', text: r.text, title: r.by, ts: r.at }))] : m));
            if (!openRef.current || document.hidden) setUnread((u) => u + fresh.length);
          })
          .catch(() => {}),
      open ? 15000 : 60000
    );
    return () => clearInterval(t);
  }, [open, token?.id, live]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs, open]);

  const push = (m) => setMsgs((x) => [...x, { ts: new Date().toISOString(), ...m }]);

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setText('');
    push({ from: 'me', text: q });
    setBusy(true);
    try {
      const r = await api.post('/support/ask', { question: q, context: { page: page() } });
      if (r.answered) push({ from: 'bot', text: r.answer.text, title: r.answer.title });
      else {
        setPending(q);
        push({ from: 'bot', text: r.hint });
        if (r.related?.length) push({ from: 'bot', text: 'Did you mean:\n' + r.related.map((x) => '• ' + x.title).join('\n') });
      }
    } catch (e) {
      push({ from: 'bot', text: 'Sorry, something went wrong: ' + e.message });
    }
    setBusy(false);
  }

  /** The agent writes to the help desk manager on their open token. */
  async function message(textIn) {
    const m = String(textIn || '').trim();
    if (!m || busy || !live) return;
    setText('');
    push({ from: 'me', text: m });
    setBusy(true);
    try {
      setToken(await api.patch('/support/tickets/' + encodeURIComponent(token.id), { action: 'message', reply: m }));
    } catch (e) {
      push({ from: 'bot', text: 'Could not send it: ' + e.message });
    }
    setBusy(false);
  }

  async function createToken(question) {
    const q = String(question || pending || '').trim();
    if (!q) {
      push({ from: 'bot', text: 'Tell me what you need help with and I’ll raise a token for the help desk manager.' });
      return;
    }
    setBusy(true);
    try {
      const t = await api.post('/support/tickets', { question: q, context: { page: page() } });
      setToken(t);
      setToManager(true);
      seen.current = 0;
      setPending('');
      const how = t.notified?.email === 'sent' ? ' by email' : t.notified?.teams === 'sent' ? ' in Teams' : '';
      push({ from: 'bot', text: `Support token ${t.id} created — the help desk manager has been notified${how}. Their answer appears right here, and anything you type now goes to them.` });
      if (t.warning) push({ from: 'bot', text: t.warning });
    } catch (e) {
      push({ from: 'bot', text: 'Could not create the token: ' + e.message });
    }
    setBusy(false);
  }

  async function openTopic(id) {
    try {
      const a = await api.get('/support/articles/' + encodeURIComponent(id));
      push({ from: 'bot', text: a.text, title: a.title });
    } catch {
      push({ from: 'bot', text: 'That topic is not available.' });
    }
  }

  /** The link the help desk manager opens to answer the tokens. */
  function deskLink() {
    return window.location.origin + '/support';
  }

  async function copyDesk() {
    const link = deskLink();
    try {
      await navigator.clipboard.writeText(link);
      push({ from: 'bot', text: `Copied: ${link} — the help desk manager answers there.` });
    } catch {
      push({ from: 'bot', text: `The token desk link is ${link}` });
    }
  }

  async function closeToken() {
    if (!token) return;
    try {
      const t = await api.patch('/support/tickets/' + encodeURIComponent(token.id), { action: 'close' });
      setToken(t);
      push({ from: 'bot', text: `Token ${t.id} closed.` });
    } catch (e) {
      push({ from: 'bot', text: 'Could not close the token: ' + e.message });
    }
  }

  const chatting = live && toManager;

  return (
    <>
      <button
        className={`sup-btn ${open ? 'on' : ''}`}
        onClick={() => {
          setOpen((o) => !o);
          setUnread(0);
        }}
        title={unread ? 'The help desk manager answered' : 'LOTS CRM support'}
        aria-label="LOTS CRM support"
      >
        <Icon name="help" size={24} />
        {unread > 0 && <span className="sup-badge">{unread}</span>}
      </button>

      {open && (
        <div className="sup-panel">
          <div className="sup-head">
            <div className="sup-head-title">
              <Icon name="help" size={18} /> <strong>LOTS CRM Support</strong>
            </div>
            <div className="row">
              {live && (
                <span className="sup-token" title="Your support token">
                  {token.id}
                </span>
              )}
              <button className="sup-x" onClick={() => setOpen(false)} title="Close">
                ✕
              </button>
            </div>
          </div>

          <div className="sup-body">
            {msgs.map((m, i) => (
              <div key={i} className={`sup-msg ${m.from}`}>
                {m.title && <div className="sup-msg-title">{m.title}</div>}
                <div className="sup-msg-text">{m.text}</div>
                {m.ts && <div className="sup-msg-ts">{ago(m.ts)}</div>}
              </div>
            ))}

            {pending && !live && (
              <div className="sup-msg bot sup-ask">
                <button className="btn primary sm" disabled={busy} onClick={() => createToken(pending)}>
                  Talk to the help desk manager
                </button>
                <button className="btn sm" disabled={busy} onClick={() => setPending('')}>
                  Not now
                </button>
              </div>
            )}

            {live && (
              <div className="sup-msg sup-token-card">
                <div className="sup-token-top">
                  <strong>{token.id}</strong>
                  <span className={`badge ${token.status === 'Answered' ? 'st-resolved' : 'st-pending'}`}>{token.status}</span>
                </div>
                <div className="sup-token-q">{token.question}</div>
                <div className="muted small">
                  Raised {ago(token.createdAt)} · {token.status === 'Answered' ? 'answered — write back below if it doesn’t solve it, or close it' : 'waiting for the help desk manager'}
                </div>
                <div className="sup-token-links">
                  <a className="link small" href="/support" target="_blank" rel="noreferrer">
                    Open the token desk
                  </a>
                  <button className="link small" onClick={copyDesk}>
                    Copy the link
                  </button>
                  <button className="link small" onClick={closeToken}>
                    Close this token
                  </button>
                </div>
              </div>
            )}

            {busy && <div className="sup-typing">typing…</div>}
            <div ref={endRef} />
          </div>

          {!!info?.suggested?.length && !chatting && !msgs.some((m) => m.from === 'me') && (
            <div className="sup-chips">
              {info.suggested.map((s) => (
                <button key={s} className="sup-chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {info?.service === 'down' && (
            <div className="notice small" style={{ margin: '0 12px 8px' }}>
              The support service is offline. Your tokens are safe — open{' '}
              <a href={portalUrl(info.portal)} target="_blank" rel="noreferrer">
                the independent support portal
              </a>
              .
            </div>
          )}

          <div className="sup-foot">
            <button className="sup-topics-link" onClick={() => setTopics((t) => !t)}>
              {topics ? 'Hide topics' : 'All help topics'}
            </button>
            {live ? (
              <button className="sup-topics-link" onClick={() => setToManager((x) => !x)}>
                {toManager ? 'Ask the help articles instead' : `Back to ${token.id} (help desk manager)`}
              </button>
            ) : (
              <button className="sup-topics-link" disabled={busy} onClick={() => createToken(pending || '')}>
                Talk to the help desk manager
              </button>
            )}
          </div>

          {topics && (
            <div className="sup-topic-list">
              {(info?.articles || []).map((a) => (
                <button key={a.id} className="sup-topic" onClick={() => openTopic(a.id)}>
                  {a.title}
                </button>
              ))}
            </div>
          )}

          <form
            className="sup-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              chatting ? message(text) : ask(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={chatting ? `Message the help desk manager (${token.id})…` : 'Ask about the LOTS CRM…'}
              disabled={busy}
              aria-label={chatting ? 'Your message to the help desk manager' : 'Your question'}
            />
            <button className="btn primary sm" disabled={busy || !text.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
