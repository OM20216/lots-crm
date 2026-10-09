import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, storeLabel, useLoad, useMeta } from '../ui.jsx';
import MemberImport from '../components/MemberImport.jsx';
import { CallButton } from '../components/Dialer.jsx';

// Contacts = the member master. Every contact is recognised automatically when they call.
export default function Contacts() {
  const { stores } = useMeta();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [list, reload] = useLoad(() => api.get('/members?q=' + encodeURIComponent(q)), [q]);
  const flash = loc.state?.saved;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <div className="muted">LOTS members, add-on members, prospects and suppliers · recognised automatically when they call</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setShowImport(!showImport)}>
            Import CSV
          </button>
          <Link className="btn primary" to="/contacts/new">
            + Create Contact
          </Link>
        </div>
      </div>
      {flash && <div className="notice ok">{flash}</div>}
      {showImport && <MemberImport onDone={reload} />}

      <div className="card filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, business, mobile, card no., email, GSTIN, contact type…" autoFocus />
      </div>
      <section className="card">
        {!list ? (
          <Empty>Loading…</Empty>
        ) : list.length === 0 ? (
          <Empty>{q ? 'No contact matches.' : 'No contacts yet. Click “+ Create Contact” or import your member list.'}</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Business</th>
                <th>Mobile</th>
                <th>Type</th>
                <th>Store</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => nav(`/contacts/${m.id}`)}>
                  <td>
                    <strong>{[m.contact?.salutation, m.ownerName].filter(Boolean).join(' ') || '—'}</strong>
                    <div className="muted small">
                      {m.id}
                      {m.cardNo ? ` · card ${m.cardNo}` : ''}
                    </div>
                  </td>
                  <td>{m.businessName}</td>
                  <td>
                    {m.phone}
                    {m.doNotCall && <div className="small over">Do not call</div>}
                  </td>
                  <td className="small">{m.contact?.contactType || 'Registered Member'}</td>
                  <td>{storeLabel(stores, m.homeStore)}</td>
                  <td>{m.status === 'Blocked' ? <span className="badge st-escalated">Blocked</span> : m.contact?.customerStatus || 'Active'}</td>
                  <td className="small">{m.contact?.assignedTo || '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row">
                      {!m.doNotCall && <CallButton phone={m.phone} />}
                      <Link className="btn sm" to={`/contacts/${m.id}`}>
                        Edit
                      </Link>
                      <Link className="btn sm" to={`/cases?q=${encodeURIComponent(m.phone || m.email || m.id)}`}>
                        Cases
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
