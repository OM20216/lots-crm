// SparkTG dialer widget (iframe) ↔ CRM. Adapted from the PSRI SparkTGContext.
// Widget → CRM: ready_for_events, login_sso_complete, show_dialer (call ringing/started), hide_dialer (call ended).
// CRM → widget: login_sso_email, click_to_call.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';

const Ctx = createContext(null);

// +919873600063 / 919873600063 / 09873600063 → 9873600063
export function normalizePhone(raw) {
  const s = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^\+91\d{10}$/.test(s)) return s.slice(3);
  if (/^91\d{10}$/.test(s)) return s.slice(2);
  if (/^0\d{10}$/.test(s)) return s.slice(1);
  return s;
}

export function SparkTGProvider({ widgetUrl, agentEmail, onCallLogged, children }) {
  const iframeRef = useRef(null);
  const pendingOutbound = useRef(null); // context of the call we asked the widget to dial
  const hasAutoSso = useRef(false);
  const nav = useNavigate();
  const loc = useLocation();
  const pathRef = useRef(loc.pathname);
  pathRef.current = loc.pathname;

  const [ready, setReady] = useState(false);
  const [ssoStatus, setSsoStatus] = useState('pending');
  const [callState, setCallState] = useState(null); // { phone, name, callId, direction, ended, context }
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [rawEvents, setRawEvents] = useState([]);
  const callRef = useRef(null);
  callRef.current = callState;
  const origin = widgetUrl ? new URL(widgetUrl).origin : '';

  const sendToWidget = useCallback((event, data = {}) => iframeRef.current?.contentWindow?.postMessage({ event, data }, origin || '*'), [origin]);

  /** Dial from anywhere in the CRM. `context` ties the call to a case / missed call / lead. */
  const dial = useCallback(
    (phone, context = {}) => {
      if (!widgetUrl) return false;
      const p = normalizePhone(phone);
      pendingOutbound.current = context;
      sendToWidget('click_to_call', { phone: /^\d{10}$/.test(p) ? `+91${p}` : p });
      setCallState({ phone: p, name: '', callId: null, direction: 'outbound', ended: false, context });
      setWidgetVisible(true);
      return true;
    },
    [widgetUrl, sendToWidget]
  );

  const dismissCall = useCallback(() => setCallState(null), []);

  useEffect(() => {
    if (!widgetUrl) return;
    function onMessage(ev) {
      if (origin && ev.origin !== origin) return;
      const msg = ev.data;
      if (!msg || typeof msg !== 'object' || !msg.event) return;
      const { event, data } = msg;
      setRawEvents((prev) => [{ ts: new Date().toLocaleTimeString(), event, data }, ...prev].slice(0, 20));

      switch (event) {
        case 'ready_for_events':
          setReady(true);
          if (!hasAutoSso.current) {
            hasAutoSso.current = true;
            if (agentEmail) sendToWidget('login_sso_email', { email: agentEmail, force: true });
          } else setSsoStatus('pending'); // widget reset by a manual logout — don't log back in automatically
          break;
        case 'login_sso_complete':
          setSsoStatus(data?.status === 'success' ? 'success' : 'failed');
          break;
        case 'show_dialer': {
          // SparkTG sends reason "incoming_call" for both directions, so our own flag decides.
          const context = pendingOutbound.current;
          pendingOutbound.current = null;
          const direction = context ? 'outbound' : 'inbound';
          const callId = data?.callId || null;
          const phone = normalizePhone(data?.caller?.phone || '');
          setCallState((prev) => ({
            phone: phone || prev?.phone || '',
            name: data?.caller?.name || prev?.name || '',
            callId: callId || prev?.callId || null,
            calledTo: normalizePhone(data?.calledTo || data?.did || ''),
            direction,
            ended: false,
            context: context || prev?.context || {},
          }));
          setWidgetVisible(true);
          if (callId) {
            api.post('/calls/event', { callId, status: 'started', direction, phone: phone || undefined, name: data?.caller?.name, calledTo: data?.calledTo || data?.did, agentEmail, context: context || {}, widget: data }).catch(() => {});
            // Incoming call: open a pre-filled case form straight away (unless the agent is mid-way through one).
            if (direction === 'inbound' && phone && pathRef.current !== '/new') nav(`/new?phone=${phone}&txn=${encodeURIComponent(callId)}`);
          }
          break;
        }
        case 'hide_dialer': {
          const prev = callRef.current;
          if (prev?.callId && !prev.ended) {
            api
              .post('/calls/event', { callId: prev.callId, status: 'ended', agentEmail, widget: data || null })
              .then(() => onCallLogged?.())
              .catch(() => {});
          }
          setCallState((p) => (p ? { ...p, ended: true } : null));
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [widgetUrl, origin, agentEmail, sendToWidget, nav, onCallLogged]);

  return (
    <Ctx.Provider value={{ hasWidget: Boolean(widgetUrl), widgetUrl, iframeRef, ready, ssoStatus, callState, dismissCall, widgetVisible, setWidgetVisible, dial, sendToWidget, rawEvents, clearRawEvents: () => setRawEvents([]) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSparkTG() {
  return useContext(Ctx) || { hasWidget: false, dial: () => false, callState: null };
}
