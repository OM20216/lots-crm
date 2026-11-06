import { useState } from 'react';
import { api } from '../api.js';
import { fmtDate, portalUrl, useLoad, useMeta } from '../ui.jsx';
import { TEAMS } from '../workflows.js';
import HoMatrixCard, { ContactMatrixCard, StoreMatrixCard } from '../components/HoMatrixCard.jsx';

function SparkTgPanel() {
  const [status, reload] = useLoad(() => api.get('/sparktg/status'));
  const [txnId, setTxnId] = useState('');
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;

  async function run() {
    setBusy(true);
    setTest(await api.get('/sparktg/test' + (txnId ? '?txnId=' + encodeURIComponent(txnId) : '')).catch((e) => ({ error: e.message })));
    setBusy(false);
    reload();
  }

  return (
    <section className="card">
      <h2>SparkTG telephony</h2>
      {!status ? (
        <div className="muted small">Loading…</div>
      ) : !status.configured ? (
        <div className="notice">
          Not connected. Copy <code>.env.example</code> to <code>.env</code>, fill in SPARKTG_USERNAME, SPARKTG_PASSWORD and SPARKTG_SVC_ID, then restart the CRM.
        </div>
      ) : (
        <div className="notice ok">Credentials loaded from .env.</div>
      )}

      <div className="row">
        <input value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="Optional: a real SparkTG call id to check field mapping" />
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {test && (
        <div className="grid" style={{ marginTop: 12 }}>
          {test.error && <div className="error wide">{test.error}</div>}
          {test.agents && (
            <div className="field wide">
              <span className="field-label">Agents endpoint</span>
              {test.agents.ok ? <div className="small">OK · {test.agents.count} agent(s)</div> : <div className="error">{test.agents.error}</div>}
              {test.agents.ok && <pre className="raw">{JSON.stringify(test.agents.sample, null, 2)}</pre>}
            </div>
          )}
          {test.call && (
            <div className="field wide">
              <span className="field-label">Call record · how the CRM reads it (blank = field name not recognised, tell your developer)</span>
              {test.call.ok ? (
                <>
                  <table className="table compact">
                    <tbody>
                      {Object.entries(test.call.mapped).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{v == null ? <span className="over">— not found</span> : String(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <pre className="raw">{JSON.stringify(test.call.raw, null, 2)}</pre>
                </>
              ) : (
                <div className="error">{test.call.error}</div>
              )}
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 16 }}>Set these up in SparkTG (if your account has the options)</h3>
      <div className="small">
        <div>
          <strong>Screen-pop / CRM URL</strong>. Opens a pre-filled new case when the agent answers. Use SparkTG’s placeholders for caller number and call id:
        </div>
        <pre className="raw">{origin}/new?phone={'{CALLER_NUMBER}'}&amp;txn={'{CALL_ID}'}</pre>
        <div>
          <strong>Call-event webhook</strong>. Missed / disconnected calls land in the Missed calls list automatically:
        </div>
        <pre className="raw">{origin}/api/sparktg/event?token=YOUR_SPARKTG_WEBHOOK_TOKEN</pre>
        <div className="muted">SparkTG has to be able to reach this computer for the webhook, so it needs a public address or a tunnel. The screen-pop only needs the agent’s browser to reach the CRM.</div>
      </div>

      <h3 style={{ marginTop: 16 }}>Last events received</h3>
      {status?.events?.length ? (
        status.events.map((e, i) => (
          <details key={i}>
            <summary className="small">{fmtDate(e.at)}</summary>
            <pre className="raw">{JSON.stringify(e.payload, null, 2)}</pre>
          </details>
        ))
      ) : (
        <div className="muted small">None yet.</div>
      )}
    </section>
  );
}

function AgentRow({ name, email, onSaved }) {
  const [v, setV] = useState(email);
  return (
    <tr>
      <td>
        <strong>{name}</strong>
      </td>
      <td>
        <input type="email" value={v} onChange={(e) => setV(e.target.value)} placeholder="SparkTG login email" />
      </td>
      <td>
        <button className="btn sm primary" disabled={v === email} onClick={() => api.put('/agents/' + encodeURIComponent(name), { email: v }).then(onSaved)}>
          Save
        </button>
      </td>
    </tr>
  );
}

function StoreRow({ s, onSaved }) {
  const [v, setV] = useState({ spocName: s.spocName, spocPhone: s.spocPhone, hours: s.hours });
  const dirty = Object.keys(v).some((k) => v[k] !== s[k]);
  return (
    <tr>
      <td>
        <strong>
          {s.code} {s.short}
        </strong>
        <div className="muted small">{s.name}</div>
      </td>
      {['hours', 'spocName', 'spocPhone'].map((k) => (
        <td key={k}>
          <input value={v[k] || ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </td>
      ))}
      <td>
        <button className="btn sm primary" disabled={!dirty} onClick={() => api.put('/stores/' + s.code, v).then(onSaved)}>
          Save
        </button>
      </td>
    </tr>
  );
}

function TeamRow({ k, t, onSaved }) {
  const [v, setV] = useState({ contact: t.contact || '', phone: t.phone || '' });
  const dirty = Object.keys(v).some((x) => v[x] !== (t[x] || ''));
  return (
    <tr>
      <td>
        <strong>{t.name}</strong>
        <div className="muted small">{t.note}</div>
      </td>
      {['contact', 'phone'].map((x) => (
        <td key={x}>
          <input value={v[x]} onChange={(e) => setV({ ...v, [x]: e.target.value })} />
        </td>
      ))}
      <td>
        <button className="btn sm primary" disabled={!dirty} onClick={() => api.put('/teams/' + k, v).then(onSaved)}>
          Save
        </button>
      </td>
    </tr>
  );
}

// Teams used by the case workflows (src/workflows.js); store teams use the store SPOCs above.
const NOT_TEAMS = ['careDesk', 'store', 'homeStore'];

function HolidaysCard() {
  const { holidays = [], reloadMeta } = useMeta();
  const [date, setDate] = useState('');
  const put = (dates) => api.put('/holidays', { dates }).then(reloadMeta);
  return (
    <section className="card">
      <h2>Holidays</h2>
      <p className="muted small">Not counted as working days in escalation TATs and reports (Sundays never count).</p>
      <div className="holiday-list">
        {holidays.length === 0 && <span className="muted small">None added.</span>}
        {holidays.map((d) => (
          <span key={d} className="pk-chip added">
            {new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            <button type="button" onClick={() => put(holidays.filter((x) => x !== d))} aria-label="Remove">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn sm primary" disabled={!date || holidays.includes(date)} onClick={() => put([...holidays, date]).then(() => setDate(''))}>
          + Add holiday
        </button>
      </div>
    </section>
  );
}

function SupportCard() {
  const [data, reload] = useLoad(() => api.get('/support/settings'));
  const [email, setEmail] = useState(null);
  const [cc, setCc] = useState(null);
  const [teamsNotify, setTeamsNotify] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const value = email === null ? data?.managerEmail || '' : email;
  const ccValue = cc === null ? data?.clientCc || '' : cc;
  const teams = teamsNotify === null ? data?.teamsNotify !== false : teamsNotify;

  async function save() {
    setErr('');
    try {
      await api.put('/support/settings', { managerEmail: value, clientCc: ccValue, teamsNotify: teams });
    } catch (e) {
      return setErr(e.message);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    reload();
  }

  return (
    <section className="card">
      <h2>Support (the support button)</h2>
      <p className="muted small">
        The support button at the bottom right answers questions about the CRM. When it cannot answer, the agent raises a support token. Tokens are stored by the standalone support service, not in the CRM
        database, so they keep working when the CRM is down.
      </p>
      {data?.serviceDown && <div className="error small">The support service is not reachable: {data.serviceError}</div>}
      {data?.agentPortal && (
        <p className="muted small">
          Agent portal:{' '}
          <a href={portalUrl(data.agentPortal)} target="_blank" rel="noreferrer">
            {portalUrl(data.agentPortal)}
          </a>{' '}
          · Manager desk:{' '}
          <a href={portalUrl(data.adminPortal, '/admin')} target="_blank" rel="noreferrer">
            {portalUrl(data.adminPortal, '/admin')}
          </a>
        </p>
      )}
      <div className="field">
        <span className="field-label">Support email (To)</span>
        <input type="email" value={value} onChange={(e) => setEmail(e.target.value)} placeholder="support@…" />
        <span className="hint">Shown as the support contact. Email alerts are not sent yet; new tokens are posted in Teams when the service has a webhook.</span>
      </div>
      <div className="field">
        <span className="field-label">Client copy (Cc)</span>
        <input value={ccValue} onChange={(e) => setCc(e.target.value)} placeholder="e.g. supervisor@cpwi.in (comma separated)" />
        <span className="hint">Kept as the copy list for when email alerts are added. Tokens are not emailed yet; Teams alerts and both portals work without email.</span>
      </div>
      <label className="row small">
        <input type="checkbox" checked={teams} onChange={(e) => setTeamsNotify(e.target.checked)} /> also post new tokens in Teams
        {data && !data.teamsConfigured && <span className="muted"> (Teams is not connected)</span>}
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={save}>
          Save
        </button>
        {saved && <span className="notice ok">Saved</span>}
        {err && <span className="error small">{err}</span>}
      </div>
    </section>
  );
}

function DatabaseCard() {
  const { database: d } = useMeta();
  if (!d) return null;
  return (
    <section className="card">
      <h2>Database</h2>
      {d.backend === 'mysql' ? (
        <div className={`notice ${d.lastError ? '' : 'ok'}`}>
          MySQL database <strong>{d.database}</strong> · connected · last write {d.lastFlush ? fmtDate(d.lastFlush) : '—'} · {d.pending} change(s) waiting
          {d.lastError && <div className="error">Last write failed (retrying automatically): {d.lastError}</div>}
        </div>
      ) : (
        <div className="notice">
          Using the data file <code>{d.file}</code>. To move to MySQL, put the MySQL settings in the private secrets file (see README §3) and restart. Existing data is copied into MySQL on the first start.
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { stores, teams, agents, agentEmails, reloadMeta } = useMeta();
  return (
    <>
      <div className="page-head">
        <h1>Stores &amp; settings</h1>
      </div>
      <section className="card">
        <h2>Store SPOCs</h2>
        <p className="muted small">Name and phone for calls. Emails (who gets each escalation) are in <strong>Escalation matrix – stores &amp; teams</strong> below.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Hours</th>
              <th>SPOC name</th>
              <th>SPOC phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <StoreRow key={s.code} s={s} onSaved={reloadMeta} />
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Teams (escalations other than stores)</h2>
        <p className="muted small">
          Each case type escalates to its own team (see <a href="/case-workflows">Case workflows</a>). Name and phone here; emails in <strong>Escalation matrix – stores &amp; teams</strong> below.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Contact name</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(TEAMS)
              .filter((k) => !NOT_TEAMS.includes(k))
              .map((k) => (
                <TeamRow key={k + JSON.stringify(teams?.[k] || {})} k={k} t={{ ...TEAMS[k], ...(teams?.[k] || {}) }} onSaved={reloadMeta} />
              ))}
          </tbody>
        </table>
      </section>
      <HoMatrixCard />
      <StoreMatrixCard />
      <ContactMatrixCard />
      <HolidaysCard />
      <SupportCard />
      <SparkTgPanel />
      <section className="card">
        <h2>Agents</h2>
        <p className="muted small">The SparkTG login email logs each agent into the CRM dialer automatically (SSO). New agents add themselves from the sign-in screen.</p>
        <table className="table compact">
          <tbody>
            {agents.map((a) => (
              <AgentRow key={a} name={a} email={agentEmails?.[a] || ''} onSaved={reloadMeta} />
            ))}
          </tbody>
        </table>
      </section>
      <DatabaseCard />
      <section className="card">
        <h2>Backup</h2>
        <p className="muted small">With MySQL, back up the database with your usual MySQL backups. This download is a full JSON copy of everything and works with either backend.</p>
        <a className="btn" href="/api/export">
          Download full backup (JSON)
        </a>
      </section>
    </>
  );
}
