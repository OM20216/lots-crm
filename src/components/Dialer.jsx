import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSparkTG } from '../sparktg.jsx';

// Floating SparkTG dialer + raw-event debug panel.
export function Dialer() {
  const { hasWidget, widgetUrl, iframeRef, widgetVisible, setWidgetVisible, ready, ssoStatus, rawEvents, clearRawEvents } = useSparkTG();
  const [debugOpen, setDebugOpen] = useState(false);
  if (!hasWidget) return null;
  const dot = ready && ssoStatus === 'success' ? 'green' : ready ? 'yellow' : 'grey';
  const title = ready && ssoStatus === 'success' ? 'Dialer logged in' : ready ? 'Dialer ready — SSO login ' + ssoStatus : 'Dialer loading';

  return (
    <>
      <button className="stg-btn" onClick={() => setWidgetVisible((v) => !v)} title={title} aria-label="SparkTG dialer">
        <span>📞</span>
        <span className={`stg-dot ${dot}`} />
      </button>
      <button className="stg-btn stg-debug" onClick={() => setDebugOpen((v) => !v)} title="SparkTG events (debug)">
        ⚙{rawEvents.length > 0 && <span className="stg-dot yellow" />}
      </button>
      {debugOpen && (
        <div className="stg-panel">
          <div className="row between">
            <strong>SparkTG events</strong>
            <div className="row">
              <button className="btn sm" onClick={clearRawEvents}>
                Clear
              </button>
              <button className="btn sm" onClick={() => setDebugOpen(false)}>
                ✕
              </button>
            </div>
          </div>
          {rawEvents.length === 0 && <div className="muted small">No events yet. Make or receive a call.</div>}
          {rawEvents.map((e, i) => (
            <div key={i} className="stg-event">
              <div className="row between small">
                <strong>{e.event}</strong>
                <span className="muted">{e.ts}</span>
              </div>
              <pre>{JSON.stringify(e.data, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
      <iframe ref={iframeRef} src={widgetUrl} title="SparkTG dialer" allow="microphone; camera; autoplay; speaker-selection; display-capture" className={`stg-iframe ${widgetVisible ? 'visible' : ''}`} />
    </>
  );
}

// Caller panel (like PSRI): pops up beside the dialer for every call, incoming and outgoing,
// with the contact's details, open cases and recent cases.
export function CallerPanel() {
  const { callState, dismissCall } = useSparkTG();
  const nav = useNavigate();
  const [who, setWho] = useState(null);
  const [searching, setSearching] = useState(false);
  const [linked, setLinked] = useState({}); // caseId → 'linking' | 'linked' | error text

  const phone = callState?.phone;
  useEffect(() => {
    setWho(null);
    setLinked({});
    if (!phone || phone.replace(/\D/g, '').length < 10) return;
    setSearching(true);
    api
      .get('/lookup?q=' + encodeURIComponent(phone))
      .then(setWho)
      .catch(() => setWho({ members: [], cases: [], match: null }))
      .finally(() => setSearching(false));
  }, [phone]);

  if (!callState) return null;
  const m = who?.match?.member;
  const via = who?.match;
  const ctx = callState.context || {};
  const inbound = callState.direction === 'inbound';
  const initials = (m?.businessName || m?.ownerName || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
  const newCaseHref = `/new?phone=${callState.phone}${callState.callId ? '&txn=' + encodeURIComponent(callState.callId) : ''}${ctx.missedCallId ? '&missedId=' + ctx.missedCallId : ''}${ctx.leadId ? '&leadId=' + ctx.leadId : ''}${!inbound ? '&channel=' + encodeURIComponent(ctx.missedCallId ? 'Missed call callback' : 'Outbound call') : ''}`;

  async function linkTo(caseId) {
    if (!callState.callId) return;
    setLinked((l) => ({ ...l, [caseId]: 'linking' }));
    try {
      await api.post(`/cases/${caseId}/calls`, { txnId: callState.callId });
      setLinked((l) => ({ ...l, [caseId]: 'linked' }));
    } catch (e) {
      setLinked((l) => ({ ...l, [caseId]: e.message }));
    }
  }

  return (
    <div className={`caller-panel ${callState.ended ? 'ended' : ''}`}>
      <div className="cp-head">
        <span className={`cp-dir ${inbound ? 'in' : 'out'}`}>{inbound ? '↙ Incoming' : '↗ Outgoing'}</span>
        {callState.ended && <span className="cp-ended">Call ended</span>}
        <button className="cp-close" onClick={dismissCall} title="Close">
          ✕
        </button>
      </div>
      <div className="cp-phone">{callState.phone || 'Unknown number'}</div>
      {ctx.missedCallId && <div className="cp-ctx">Call-back of missed call {ctx.missedCallId}</div>}
      {ctx.leadId && <div className="cp-ctx">Outbound lead {ctx.leadId}</div>}
      {ctx.caseId && (
        <div className="cp-ctx">
          For case <Link to={`/cases/${ctx.caseId}`}>{ctx.caseId}</Link>
        </div>
      )}

      {searching && <div className="cp-hint">Looking up the caller…</div>}

      {!searching && m && (
        <div className={`cp-contact ${m.status === 'Blocked' ? 'blocked' : ''}`}>
          <div className="cp-contact-row">
            <div className="cp-avatar">{initials}</div>
            <div>
              <div className="cp-name">{m.businessName}</div>
              <div className="cp-sub">
                {via?.via === 'add-on' ? `${via.addOn.name || 'Add-on holder'} (add-on card)` : m.ownerName}
              </div>
            </div>
          </div>
          {m.status === 'Blocked' && <div className="cp-blocked">Card blocked</div>}
          <div className="cp-facts">
            <span>Card {m.cardNo || '—'}</span>
            <span>{m.customerType || m.customerGroup || 'Member'}</span>
            <span>Home store {m.homeStore || '—'}</span>
            <span className={who.openCases ? 'open' : ''}>{who.openCases || 0} open case(s)</span>
          </div>
        </div>
      )}
      {!searching && who && !m && who.members?.length > 1 && (
        <div className="cp-shared">
          <div className="cp-hint">{who.members.length} contacts share this mobile (each with its own card no.). Ask which one is calling:</div>
          {who.members.slice(0, 6).map((x) => (
            <Link key={x.id} className="cp-shared-row" to={`/contacts?c=${x.id}`}>
              <strong>{x.businessName || x.ownerName}</strong> · {x.ownerName} · card {x.cardNo || '—'}
            </Link>
          ))}
        </div>
      )}
      {!searching && who && !m && !(who.members?.length > 1) && <div className="cp-hint">Not a registered member{callState.name && callState.name !== 'Unknown' ? ` (SparkTG: ${callState.name})` : ''}.</div>}

      <div className="cp-actions">
        <button className="btn primary" onClick={() => nav(newCaseHref)}>
          + New Case
        </button>
        {m && (
          <Link className="btn" to={`/cases?q=${encodeURIComponent(m.phone)}`}>
            All cases
          </Link>
        )}
      </div>

      {who?.cases?.length > 0 && (
        <div className="cp-cases">
          <div className="cp-cases-title">Recent cases</div>
          {who.cases.slice(0, 5).map((c) => (
            <div className="cp-case" key={c.id}>
              <div className="cp-case-top">
                <Link to={`/cases/${c.id}`}>{c.id}</Link>
                <span className={`badge st-${(c.status || '').toLowerCase()}`}>{c.status}</span>
                <span className="cp-date">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
              <div className="cp-case-cat">{[c.category, c.subCategory].filter(Boolean).join(' › ') || c.caseType || '—'}</div>
              {callState.callId && c.status !== 'Closed' && (
                <button className="link" disabled={linked[c.id] === 'linking' || linked[c.id] === 'linked'} onClick={() => linkTo(c.id)}>
                  {linked[c.id] === 'linked' ? '✓ Call linked to this case' : linked[c.id] === 'linking' ? 'Linking…' : 'Link this call to this case'}
                </button>
              )}
              {linked[c.id] && !['linked', 'linking'].includes(linked[c.id]) && <div className="cp-err">{linked[c.id]}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// className / children: other looks (e.g. the round icon buttons on Contacts); default "📞 Call"
export function CallButton({ phone, context, label = 'Call', className = 'btn sm', children }) {
  const { hasWidget, dial, callState } = useSparkTG();
  if (!phone) return null;
  const content = children ?? <>📞 {label}</>;
  if (!hasWidget)
    return (
      <a className={className} href={`tel:${phone}`} title={`Call ${phone}`} onClick={(e) => e.stopPropagation()}>
        {content}
      </a>
    );
  const busy = callState && !callState.ended;
  return (
    <button type="button" className={className} disabled={busy} title={busy ? 'Finish the current call first' : `Dial ${phone} via SparkTG`} onClick={(e) => (e.stopPropagation(), dial(phone, context))}>
      {content}
    </button>
  );
}
