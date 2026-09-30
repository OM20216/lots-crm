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

// Live call strip: who is on the line (member lookup) and one click to the right screen.
export function CallBar() {
  const { callState, dismissCall } = useSparkTG();
  const nav = useNavigate();
  const [who, setWho] = useState(null);

  const phone = callState?.phone;
  useEffect(() => {
    setWho(null);
    if (!phone || phone.length < 10) return;
    api
      .get('/lookup?q=' + encodeURIComponent(phone))
      .then(setWho)
      .catch(() => {});
  }, [phone]);

  if (!callState) return null;
  const m = who?.match?.member;
  const ctx = callState.context || {};
  const caseHref = `/new?phone=${callState.phone}${callState.callId ? '&txn=' + encodeURIComponent(callState.callId) : ''}${ctx.missedCallId ? '&missedId=' + ctx.missedCallId : ''}${ctx.leadId ? '&leadId=' + ctx.leadId : ''}${callState.direction === 'outbound' ? '&channel=' + (ctx.missedCallId ? 'Missed call callback' : 'Outbound call') : ''}`;

  return (
    <div className={`callbar ${callState.ended ? 'ended' : ''}`}>
      <span className="callbar-icon">{callState.ended ? '☎' : callState.direction === 'inbound' ? '📲' : '📤'}</span>
      <div className="callbar-who">
        <strong>
          {callState.ended ? 'Call ended' : callState.direction === 'inbound' ? 'Incoming call' : 'Calling'} · {callState.phone || 'unknown number'}
        </strong>
        <span className="small">
          {m ? (
            <>
              {m.businessName} · {m.ownerName} · card {m.cardNo || '—'}
              {m.status === 'Blocked' && <span className="badge st-escalated">Blocked</span>}
              {who.openCases > 0 && <> · {who.openCases} open case(s)</>}
            </>
          ) : who ? (
            'Not a registered member'
          ) : (
            callState.name || 'Looking up…'
          )}
          {callState.callId && <span className="muted"> · call {callState.callId}</span>}
        </span>
      </div>
      <div className="row">
        {ctx.caseId ? (
          <Link className="btn sm" to={`/cases/${ctx.caseId}`}>
            Open {ctx.caseId}
          </Link>
        ) : (
          <button className="btn sm primary" onClick={() => nav(caseHref)}>
            Case form
          </button>
        )}
        {who?.cases?.[0] && (
          <Link className="btn sm" to={`/cases/${who.cases[0].id}`}>
            Last case {who.cases[0].id}
          </Link>
        )}
        {callState.ended && (
          <button className="btn sm" onClick={dismissCall}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export function CallButton({ phone, context, label = 'Call' }) {
  const { hasWidget, dial, callState } = useSparkTG();
  if (!phone) return null;
  if (!hasWidget)
    return (
      <a className="btn sm" href={`tel:${phone}`}>
        📞 {label}
      </a>
    );
  const busy = callState && !callState.ended;
  return (
    <button type="button" className="btn sm" disabled={busy} title={busy ? 'Finish the current call first' : `Dial ${phone} via SparkTG`} onClick={(e) => (e.stopPropagation(), dial(phone, context))}>
      📞 {label}
    </button>
  );
}
