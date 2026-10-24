import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, storeLabel, useLoad, useMeta } from '../ui.jsx';
import MemberImport from '../components/MemberImport.jsx';
import { CallButton } from '../components/Dialer.jsx';
import Icon from '../components/Icon.jsx';

// Contacts = the member master. Every contact is recognised automatically when they call.
// List of contact cards on the left; a click opens the contact on the right (details + communication history).
const nameOf = (m) => [m.contact?.salutation, m.ownerName].filter(Boolean).join(' ') || m.businessName || 'Not disclosed';
const initials = (m) =>
  (m.ownerName || m.businessName || '?')
    .replace(/^(mr|ms|mrs|dr|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
const shown = (p) => (p ? `+91 ${String(p).replace(/\D/g, '').slice(-10)}` : '');
const typeOf = (m) => (m.status === 'Blocked' ? 'Blocked' : m.contact?.contactType || 'Registered Member');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const dur = (s) => (s == null || s === '' ? '' : `${Math.floor(Number(s) / 60)}:${String(Math.round(Number(s) % 60)).padStart(2, '0')}`);
const wa = (p) => `https://wa.me/91${String(p || '').replace(/\D/g, '').slice(-10)}`;

export default function Contacts() {
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [list, reload] = useLoad(() => api.get('/members?q=' + encodeURIComponent(q)), [q]);
  const flash = loc.state?.saved;
  const selectedId = params.get('c') || list?.[0]?.id || null;
  const select = (id) => setParams((p) => (p.set('c', id), p), { replace: true });

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

      {!list ? (
        <section className="card">
          <Empty>Loading…</Empty>
        </section>
      ) : list.length === 0 ? (
        <section className="card">
          <Empty>{q ? 'No contact matches.' : 'No contacts yet. Click “+ Create Contact” or import your member list.'}</Empty>
        </section>
      ) : (
        <div className="ct-split">
          <div className="ct-list">
            {list.map((m) => (
              <div key={m.id} className={`ct-card ${m.id === selectedId ? 'on' : ''}`} onClick={() => select(m.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(m.id)}>
                <div className="ct-avatar">{initials(m)}</div>
                <div className="ct-main">
                  <div className="ct-name">{nameOf(m)}</div>
                  <div className="ct-sub">
                    <span>{shown(m.phone) || m.email || m.id}</span>
                    <span className={`ct-pill ${m.status === 'Blocked' ? 'bad' : ''}`}>{typeOf(m)}</span>
                  </div>
                  {m.ownerName && m.businessName && m.businessName !== m.ownerName && <div className="ct-biz">{m.businessName}</div>}
                </div>
                <div className="ct-actions" onClick={(e) => e.stopPropagation()}>
                  {!m.doNotCall && (
                    <CallButton phone={m.phone} className="ct-round">
                      <Icon name="phone" size={16} />
                    </CallButton>
                  )}
                  {m.email && (
                    <a className="ct-round" href={`mailto:${m.email}`} title={`Email ${m.email}`}>
                      <Icon name="mail" size={16} />
                    </a>
                  )}
                  {m.phone && (
                    <a className="ct-round wa" href={wa(m.phone)} target="_blank" rel="noreferrer" title="WhatsApp">
                      <WaIcon />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {list.length >= 500 && <div className="muted small ct-more">Showing the newest 500 · search to find any contact</div>}
          </div>
          <div className="ct-detail">{selectedId ? <ContactDetail id={selectedId} fallback={list.find((m) => m.id === selectedId)} /> : null}</div>
        </div>
      )}
    </>
  );
}

function WaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

function ContactDetail({ id, fallback }) {
  const { stores } = useMeta();
  const [m, setM] = useState(fallback || null);
  const [hist, setHist] = useState(null);
  useEffect(() => {
    let live = true;
    setM(fallback || null);
    setHist(null);
    api.get('/members/' + id).then((x) => live && setM(x)).catch(() => {});
    api.get(`/members/${id}/history`).then((x) => live && setHist(x)).catch(() => live && setHist({ items: [], counts: {} }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!m) return <Empty>Loading…</Empty>;
  const c = m.contact || {};
  const otherPhones = [m.altPhone, ...(m.otherPhones || [])].filter(Boolean);
  const address = m.address || [c.businessAddress, c.businessAddress2, c.businessCity || c.businessCityPicklist, c.businessPincode].filter(Boolean).join(', ');
  const fields = [
    ['Mobile', shown(m.phone) || '—'],
    ['Alternate mobile', otherPhones.map(shown).join(', ') || '—'],
    ['Email', [m.email, ...(m.otherEmails || [])].filter(Boolean).join(', ') || '—'],
    ['Business name', m.businessName || '—'],
    ['Membership card no.', m.cardNo || '—'],
    ['Contact ID', m.id + (m.vtigerId ? ` · Vtiger ${m.vtigerId}` : '')],
    ['Contact type', c.contactType || 'Registered Member'],
    ['Customer status', m.status === 'Blocked' ? 'Blocked' : c.customerStatus || 'Active'],
    ['Type of customer (Segment1)', m.customerGroup || c.segment1 || '—'],
    ['Type of business (Segment2)', m.customerType || c.segment2 || '—'],
    ['Registered store', storeLabel(stores, m.homeStore) || c.registeredStoreName || '—'],
    ['GSTIN', m.gstin || c.gstNumber || '—'],
    ['Business licence', [m.licenceType || c.businessLicenceType, c.businessLicenceNumber].filter(Boolean).join(' · ') || '—'],
    ['Source of information', c.sourceOfInformation || '—'],
    ['Date of joining', c.dateOfJoining || '—'],
    ['Assigned to', c.assignedTo || '—'],
  ];
  return (
    <div className="ct-panel">
      <div className="ct-head">
        <div className="ct-avatar big">{initials(m)}</div>
        <div className="ct-main">
          <div className="ct-title">{nameOf(m)}</div>
          <span className={`ct-pill ${m.status === 'Blocked' ? 'bad' : ''}`}>{typeOf(m)}</span>
          {m.doNotCall && <span className="ct-pill bad">Do not call</span>}
        </div>
        <Link className="btn" to={`/contacts/${m.id}`}>
          Edit
        </Link>
      </div>
      <div className="ct-bigactions">
        {!m.doNotCall && m.phone ? (
          <CallButton phone={m.phone} className="ct-bigbtn">
            <Icon name="phone" size={18} /> Call
          </CallButton>
        ) : (
          <span className="ct-bigbtn off">
            <Icon name="phone" size={18} /> Call
          </span>
        )}
        {m.email ? (
          <a className="ct-bigbtn" href={`mailto:${m.email}`}>
            <Icon name="mail" size={18} /> Email
          </a>
        ) : (
          <span className="ct-bigbtn off">
            <Icon name="mail" size={18} /> Email
          </span>
        )}
        {m.phone ? (
          <a className="ct-bigbtn wa" href={wa(m.phone)} target="_blank" rel="noreferrer">
            <WaIcon /> WhatsApp
          </a>
        ) : (
          <span className="ct-bigbtn off">
            <WaIcon /> WhatsApp
          </span>
        )}
        <Link className="ct-bigbtn" to={`/new?phone=${encodeURIComponent(String(m.phone || '').replace(/\D/g, '').slice(-10))}`}>
          <Icon name="cases" size={18} /> Log case
        </Link>
      </div>

      <div className="ct-fields">
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="ct-label">{label}</div>
            <div className="ct-value">{value}</div>
          </div>
        ))}
        <div className="wide">
          <div className="ct-label">Address</div>
          <div className="ct-value">{address || '—'}</div>
        </div>
        {(m.addOnCards || []).length > 0 && (
          <div className="wide">
            <div className="ct-label">Add-on members</div>
            {(m.addOnCards || []).map((a, i) => (
              <div key={i} className="ct-value">
                {a.name || 'Add-on member'} {a.phone && `· ${shown(a.phone)}`} {a.cardNo && `· card ${a.cardNo}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="ct-hist-h">
        Communication history
        {hist?.counts && (
          <span className="muted small">
            {' '}
            · {hist.counts.cases || 0} case{hist.counts.cases === 1 ? '' : 's'} ({hist.counts.open || 0} open) · {hist.counts.calls || 0} call{hist.counts.calls === 1 ? '' : 's'}
          </span>
        )}
      </h3>
      {!hist ? (
        <Empty>Loading…</Empty>
      ) : hist.items.length === 0 ? (
        <div className="ct-empty">No calls, cases or emails with this contact yet.</div>
      ) : (
        <div className="ct-hist">
          {hist.items.map((h) => (
            <HistoryItem key={h.kind + h.id} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ h }) {
  const caseLink = h.caseId && (
    <>
      {' · '}
      <Link to={`/cases/${h.caseId}`}>{h.caseId}</Link>
    </>
  );
  if (h.kind === 'case')
    return (
      <div className="ct-item">
        <span className="ct-ico case">
          <Icon name="cases" size={15} />
        </span>
        <div>
          <div>
            <Link to={`/cases/${h.id}`}>
              <strong>{h.id}</strong>
            </Link>{' '}
            · {h.title} <span className={`badge st-${String(h.status || '').toLowerCase()}`}>{h.status}</span>
          </div>
          <div className="muted small">
            {when(h.at)} · {h.channel}
            {h.agent ? ` · ${h.agent}` : ''}
          </div>
        </div>
      </div>
    );
  if (h.kind === 'call')
    return (
      <div className="ct-item">
        <span className={`ct-ico ${h.connected === false ? 'bad' : 'call'}`}>
          <Icon name={h.direction === 'inbound' ? 'incoming' : 'outgoing'} size={15} />
        </span>
        <div className="ct-grow">
          <div>
            <strong>{h.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'}</strong> · {h.connected === false ? 'not connected' : `talk ${dur(h.durationSec) || '—'}`}
            {h.agent ? ` · ${h.agent}` : ''}
            {caseLink}
          </div>
          <div className="muted small">
            {when(h.at)} · {shown(h.phone)}
          </div>
          {h.recording && <audio controls preload="none" src={`/api/calls/${encodeURIComponent(h.id)}/recording`} />}
        </div>
      </div>
    );
  if (h.kind === 'missed')
    return (
      <div className="ct-item">
        <span className="ct-ico bad">
          <Icon name="missed" size={15} />
        </span>
        <div>
          <div>
            <strong>Missed call</strong> · {h.status}
            {h.agent ? ` · ${h.agent}` : ''}
            {caseLink}
          </div>
          <div className="muted small">
            {when(h.at)} · {shown(h.phone)}
          </div>
        </div>
      </div>
    );
  return (
    <div className="ct-item">
      <span className="ct-ico mail">
        <Icon name="mail" size={15} />
      </span>
      <div>
        <div>
          <strong>Email sent</strong> · {h.subject}
          {caseLink}
        </div>
        <div className="muted small">
          {when(h.at)} · to {h.to} · {h.status}
        </div>
      </div>
    </div>
  );
}
