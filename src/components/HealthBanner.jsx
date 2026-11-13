import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// A thin bar above the page that tells the team when something is wrong with the services themselves:
// the support service is down, a service was restarted automatically, the database write failed, or the
// watchdog that checks all of this has stopped running. The data comes from /api/health, which includes
// the watchdog's last pass (~/.lots-crm/watchdog-status.json).
//
// It stays quiet when everything is fine, and each new event can be dismissed once (remembered in the
// browser) so a warning does not sit on the screen forever after it has been read.

const DISMISS_KEY = 'lots-health-dismissed';
const POLL_MS = 30000;
const RECENT_MS = 30 * 60 * 1000;

const hhmm = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const ago = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
};

export default function HealthBanner() {
  const [health, setHealth] = useState(null);
  const [misses, setMisses] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const h = await api.get('/health');
        if (!live) return;
        setHealth(h);
        setMisses(0);
      } catch {
        if (live) setMisses((n) => n + 1);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { live = false; clearInterval(t); };
  }, []);

  const alert = useMemo(() => {
    // the CRM itself not answering: only shown once it is back (the browser cannot render while it is down)
    if (misses >= 2) {
      return { level: 'danger', key: 'crm-unreachable', text: 'This screen cannot reach the CRM. Check that the service is running (scripts\\crm-service.ps1 status).' };
    }
    if (!health) return null;

    const w = health.watchdog;
    const supportDown = w?.support && !w.support.up;
    const dbError = Boolean(health.lastError);

    if (dbError) {
      return { level: 'danger', key: `db-${health.startedAt}`, text: 'The last database write failed. Open Stores & settings › Database to see the error before more data is entered.' };
    }

    // A copy without the private MySQL settings runs on its own empty data file. Say so plainly, because it looks
    // like every case, contact and call log has disappeared. (A clone of the project has no settings and no data.)
    if (health.backend === 'file') {
      return {
        level: 'warn',
        key: 'file-backend',
        text: 'This copy is using its own local data file, not the company MySQL database, so the live cases, contacts and call logs are not here. Add MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER and MYSQL_PASSWORD to the private secrets file (README §3) and restart.',
      };
    }
    // SparkTG dialer: the widget address is a non-secret setting in .env, and without it no call opens in the CRM.
    if (health.sparktgWidget === false) {
      return {
        level: 'warn',
        key: 'sparktg-widget-missing',
        text: 'The SparkTG dialer is not set up on this copy: SPARKTG_WIDGET_URL is empty in .env, so calls cannot open inside the CRM. Copy that line from the live PC’s .env and restart.',
      };
    }
    if (supportDown) {
      return {
        level: 'danger',
        key: `support-down-${w.support.downSince || ''}`,
        text: `LOTS Support is not answering${w.support.downSince ? ` (since ${hhmm(w.support.downSince)})` : ''} — support tokens cannot be opened right now. The watchdog is retrying automatically.`,
      };
    }

    const stale = !w || (Number.isFinite(w.ageSeconds) && w.ageSeconds > 180);
    if (stale) {
      return {
        level: 'warn',
        key: `watchdog-stale-${w?.updatedAt || 'none'}`,
        text: w ? `The watchdog has stopped checking the services (last check ${ago(w.ageSeconds)}). Nothing will restart them automatically until it is running again.` : 'The watchdog is not installed, so nothing checks or restarts the services automatically.',
      };
    }

    // a service that stopped answering but is back now (the watchdog restarted it)
    const crmDown = !w.crm?.up;
    const recent = w.lastEvent && Date.now() - Date.parse(w.lastEvent.at) < RECENT_MS ? w.lastEvent : null;
    if (crmDown || (recent && ['restart', 'recovered'].includes(recent.kind))) {
      const when = recent ? hhmm(recent.at) : '';
      const what = crmDown ? 'The CRM was not answering on the watchdog’s last check.' : `${recent.service === 'crm' ? 'The CRM' : 'LOTS Support'} restarted automatically at ${when}.`;
      return { level: 'warn', key: `event-${recent?.at || 'crm'}`, text: `${what} Everything is working now — no action needed.` };
    }
    if (recent && recent.kind === 'restart-failed') {
      return { level: 'danger', key: `failed-${recent.at}`, text: `${recent.service === 'crm' ? 'The CRM' : 'LOTS Support'} could not be restarted automatically at ${hhmm(recent.at)}. See logs\\watchdog.log.` };
    }
    return null;
  }, [health, misses]);

  if (!alert || alert.key === dismissed) return null;

  return (
    <div className={`health-banner ${alert.level}`} role="status">
      <span className="health-dot" />
      <span className="health-text">{alert.text}</span>
      <button
        className="health-x"
        title="Hide this message"
        onClick={() => {
          setDismissed(alert.key);
          try { localStorage.setItem(DISMISS_KEY, alert.key); } catch { /* private mode */ }
        }}
      >
        ✕
      </button>
    </div>
  );
}
