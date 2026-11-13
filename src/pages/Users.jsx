import { useState } from 'react';
import { api } from '../api.js';
import { fmtDate, useLoad, useMeta } from '../ui.jsx';

const PROFILE_KEYS = ['fullName', 'sipId', 'email', 'phone'];
const emptyProfile = { fullName: '', sipId: '', email: '', phone: '' };

/** One person: contact card, role, active, a new password (Admin → Users). */
function UserRow({ u, onSaved }) {
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState({ fullName: u.fullName || '', sipId: u.sipId || '', email: u.email || '', phone: u.phone || '' });
  const [msg, setMsg] = useState('');
  const dirty = PROFILE_KEYS.some((k) => profile[k] !== (u[k] || ''));
  const save = (patch, ok) =>
    api
      .put('/users/' + encodeURIComponent(u.name), patch)
      .then(() => (setMsg(ok), setPassword(''), onSaved()))
      .catch((e) => setMsg('⚠ ' + e.message));
  return (
    <tr className={u.active ? '' : 'muted'}>
      <td>
        <strong>{u.name}</strong>
      </td>
      {PROFILE_KEYS.map((k) => (
        <td key={k}>
          <input
            type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
            value={profile[k]}
            placeholder={k === 'fullName' ? 'Full name' : k === 'sipId' ? 'SIP ID' : k === 'email' ? 'Email ID' : 'Phone no.'}
            onChange={(e) => setProfile({ ...profile, [k]: e.target.value })}
          />
        </td>
      ))}
      <td>
        <select value={u.role} onChange={(e) => save({ role: e.target.value }, 'Role saved')}>
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="small">{u.hasPassword ? `Set ${fmtDate(u.setAt)}${u.setBy && u.setBy !== u.name ? ` by ${u.setBy}` : ''}` : <span className="over">No password</span>}</td>
      <td>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            save({ password }, 'Password set');
          }}
        >
          <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn sm" disabled={password.length < 8}>
            Set
          </button>
        </form>
      </td>
      <td>
        <label className="row small">
          <input type="checkbox" checked={u.active} onChange={(e) => save({ active: e.target.checked }, e.target.checked ? 'Can sign in again' : 'Can no longer sign in')} /> can sign in
        </label>
        {dirty && (
          <button className="btn sm primary" onClick={() => save(profile, 'Details saved')}>
            Save details
          </button>
        )}
        {msg && <div className="small">{msg}</div>}
      </td>
    </tr>
  );
}

/** Admin → Users: who can sign in, with which role, and the switch that makes sign-in required. */
export default function Users() {
  const { agent, auth, reloadAuth, reloadMeta } = useMeta();
  const [data, reload, error] = useLoad(() => api.get('/users'));
  const [fresh, setFresh] = useState({ name: '', ...emptyProfile });
  const [adminName, setAdminName] = useState(agent);
  const [adminPassword, setAdminPassword] = useState('');
  const [msg, setMsg] = useState('');
  const refresh = () => (reload(), reloadAuth?.(), reloadMeta?.());

  async function toggle(on) {
    setMsg('');
    try {
      await api.put('/auth/settings', on ? { required: true, name: adminName, password: adminPassword } : { required: false });
      setAdminPassword('');
      setMsg(on ? 'Sign-in is now required. Everyone signs in with their name and password.' : 'Sign-in switched off: agents pick their name again.');
      refresh();
    } catch (e) {
      setMsg('⚠ ' + e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users and sign-in</h1>
          <span className="muted">Passwords and roles. Agents do the daily work; admins also change the setup (Admin pages, matrices, automation, users, backup).</span>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Require sign-in</h2>
        {auth?.forcedOff && <div className="notice small">Sign-in is switched off in the private secrets file (CRM_AUTH_OFF). Remove that line and restart to use it.</div>}
        {data?.required ? (
          <>
            <p className="small">
              <strong>On.</strong> Everyone signs in with their name and password; sessions last 12 hours. Every change on a case is recorded under the signed-in name.
            </p>
            <button className="btn" onClick={() => confirm('Switch sign-in off? Anyone on the network can then use the CRM by picking a name.') && toggle(false)}>
              Switch sign-in off
            </button>
          </>
        ) : (
          <>
            <p className="small">
              <strong>Off</strong> — agents pick their name, as before. Before switching it on: give every agent a password below and make at least one person <strong>Admin</strong>. Needed before the CRM is used outside the office network.
            </p>
            {data?.canRequire ? (
              <form
                className="row wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  toggle(true);
                }}
              >
                <select value={adminName} onChange={(e) => setAdminName(e.target.value)}>
                  {(data?.users || []).filter((u) => u.role === 'admin' && u.hasPassword).map((u) => (
                    <option key={u.name} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input type="password" placeholder="Your admin password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                <button className="btn primary" disabled={!adminPassword}>
                  Switch sign-in on
                </button>
              </form>
            ) : (
              <div className="muted small">Set a password for at least one Admin first.</div>
            )}
          </>
        )}
        {msg && <div className="small">{msg}</div>}
      </section>

      <section className="card">
        <h2>Users</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Full Name</th>
                <th>SIP ID</th>
                <th>Email ID</th>
                <th>Phone No.</th>
                <th>Role</th>
                <th>Password</th>
                <th>New password</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((u) => (
                <UserRow key={u.name + u.role + u.setAt + u.active + u.fullName + u.sipId + u.email + u.phone} u={u} onSaved={refresh} />
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const profile = { fullName: fresh.fullName.trim(), sipId: fresh.sipId.trim(), email: fresh.email.trim(), phone: fresh.phone.trim() };
            api
              .put('/users/' + encodeURIComponent(fresh.name.trim()), { role: 'agent', ...profile })
              .then(() => (setFresh({ name: '', ...emptyProfile }), refresh()))
              .catch((e2) => setMsg('⚠ ' + e2.message));
          }}
        >
          <input placeholder="User name" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
          <input placeholder="Full name" value={fresh.fullName} onChange={(e) => setFresh({ ...fresh, fullName: e.target.value })} />
          <input placeholder="SIP ID" value={fresh.sipId} onChange={(e) => setFresh({ ...fresh, sipId: e.target.value })} />
          <input type="email" placeholder="Email ID" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} />
          <input type="tel" placeholder="Phone no." value={fresh.phone} onChange={(e) => setFresh({ ...fresh, phone: e.target.value })} />
          <button className="btn" disabled={!fresh.name.trim()}>
            Add user
          </button>
        </form>
        <p className="muted small">Full name, SIP ID, email and phone are the agent&apos;s contact card; the email is also the SparkTG dialer login (SSO). Forgotten password: set a new one here. All admin passwords forgotten: put CRM_AUTH_OFF=1 in the private secrets file and restart.</p>
      </section>
    </>
  );
}

/** My password: change your own (needs the current one). */
export function Account() {
  const { agent } = useMeta();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (password !== again) return setMsg('⚠ The two new passwords are not the same');
    try {
      await api.post('/auth/password', { current, password });
      setCurrent('');
      setPassword('');
      setAgain('');
      setMsg('Password changed.');
    } catch (e2) {
      setMsg('⚠ ' + e2.message);
    }
  }
  return (
    <>
      <div className="page-head">
        <h1>My password</h1>
      </div>
      <form className="card" style={{ maxWidth: 420 }} onSubmit={submit}>
        <p className="muted small">Signed in as {agent}.</p>
        <label className="field">
          <span className="field-label">Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">New password (8+ characters)</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">New password again</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <button className="btn primary" disabled={password.length < 8}>
          Change password
        </button>
        {msg && <div className="small">{msg}</div>}
      </form>
    </>
  );
}
