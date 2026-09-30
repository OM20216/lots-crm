import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { CALLER_TYPES } from '../taxonomy.js';
import { KB, SCRIPTS } from '../knowledge.js';
import { Field, Select, StatusBadge, fmtDate, useMeta } from '../ui.jsx';
import Classifier, { allowedCategories } from '../components/Classifier.jsx';
import Icon from '../components/Icon.jsx';
import { useSparkTG } from '../sparktg.jsx';
import { requirementsFor, sopWarnings } from '../requirements.js';

// SOP "Resolve within TAT?": resolved over telephone, info missing (Waiting) or escalate to the store team.
const OUTCOMES = [
  { status: 'Closed', label: 'Resolved over telephone (ROT)', hint: 'Answered from the SOP / FAQ; the case closes now' },
  { status: 'Waiting', label: 'Info missing → Waiting', hint: 'Discrepancy or missing details; stays Waiting until the customer provides them' },
  { status: 'Escalated', label: 'Escalate to store team', hint: 'As per the escalation matrix · L1 TAT 1 working day' },
];

// SOP communication channels. "Missed call callback" = calling back a missed / abandoned call (TAT 30 min).
const SOURCES = [
  { value: 'Inbound call', icon: 'incoming', hint: 'Customer called 1860-123-5687' },
  { value: 'Missed call callback', icon: 'missed', hint: 'Calling back a missed call (30 min)' },
  { value: 'Email', icon: 'mail', hint: 'Mail to contactus@cpwi.in' },
  { value: 'Outbound call', icon: 'outgoing', hint: 'Lead / confirmation / offer call' },
];

// SOP glossary EDC = expected date of closure: L1 TAT is 1 working day (Sunday not counted).
function edc() {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function NewCase() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refreshStats, agent } = useMeta();

  const [form, setForm] = useState({
    channel: params.get('channel') || (params.get('missedId') ? 'Missed call callback' : params.get('leadId') ? 'Outbound call' : 'Inbound call'),
    callerType: 'Registered member',
    phone: params.get('phone') || '',
    name: params.get('name') || '',
    businessName: params.get('business') || '',
    email: '',
    cardNo: '',
    memberId: null,
    store: params.get('store') || '',
    caseType: '',
    category: '',
    subCategory: '',
    productCategory: '',
    orderRef: '',
    description: '',
    callTxnId: params.get('txn') || '',
    subject: '',
    purchaseDate: '',
  });
  const [outcome, setOutcome] = useState('Closed');
  const [note, setNote] = useState('');
  const [lookup, setLookup] = useState({ members: [], cases: [], calls: [], match: null });
  const [dismissed, setDismissed] = useState(null); // member the agent unlinked — don't auto-link it again
  const [sparkMsg, setSparkMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // On a live SparkTG call with this number, link the call automatically.
  const { callState } = useSparkTG();
  const liveId = callState?.callId;
  const livePhone = callState?.phone;
  useEffect(() => {
    if (!liveId) return;
    setForm((f) => {
      if (f.callTxnId) return f;
      const same = !f.phone || f.phone.replace(/\D/g, '').slice(-10) === String(livePhone || '').slice(-10);
      return same ? { ...f, callTxnId: liveId, phone: f.phone || livePhone || '' } : f;
    });
  }, [liveId, livePhone]);

  // Screen-pop gave only the SparkTG call id: ask SparkTG who is calling.
  const txnParam = params.get('txn');
  const phoneParam = params.get('phone');
  useEffect(() => {
    if (!txnParam || phoneParam) return;
    setSparkMsg('Fetching caller number from SparkTG…');
    api
      .get('/sparktg/call/' + encodeURIComponent(txnParam))
      .then((info) => {
        const digits = String(info.phone || '').replace(/\D/g, '').slice(-10);
        if (digits) {
          setForm((f) => (f.phone ? f : { ...f, phone: digits }));
          setSparkMsg(`Caller number ${digits} fetched from SparkTG.`);
        } else setSparkMsg('SparkTG did not return a caller number — type it in.');
      })
      .catch((e) => setSparkMsg(`Could not fetch the caller from SparkTG: ${e.message}`));
  }, [txnParam, phoneParam]);

  const q = form.phone || form.cardNo;
  const [searched, setSearched] = useState(false);
  async function searchNow(value) {
    if (!value || value.length < 3) return;
    const r = await api.get('/lookup?q=' + encodeURIComponent(value)).catch(() => null);
    if (!r) return;
    setLookup(r);
    setSearched(true);
    if (r.match) {
      setDismissed(null);
      fillFromMatch(r.match);
    }
  }
  useEffect(() => {
    if (!q || q.length < 3) {
      setLookup({ members: [], cases: [], calls: [], match: null });
      return;
    }
    let live = true;
    const t = setTimeout(
      () =>
        api
          .get('/lookup?q=' + encodeURIComponent(q))
          .then((r) => {
            if (!live) return;
            setLookup(r);
            if (r.match && dismissed !== r.match.member.id) fillFromMatch(r.match);
          })
          .catch(() => {}),
      250
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, dismissed]);

  // Registered number → fill everything from the member record automatically.
  function fillFromMatch({ member: m, via, addOn }) {
    setForm((f) => {
      if (f.memberId === m.id) return f;
      return {
        ...f,
        memberId: m.id,
        callerType: 'Registered member',
        name: via === 'add-on' ? addOn.name || m.ownerName : m.ownerName || f.name,
        phone: via === 'pick' ? m.phone : f.phone || m.phone,
        email: m.email || f.email,
        businessName: m.businessName,
        cardNo: via === 'add-on' ? addOn.cardNo || m.cardNo || '' : m.cardNo || '',
        store: f.store || m.homeStore || '',
      };
    });
  }

  function pickMember(m) {
    setDismissed(null);
    fillFromMatch({ member: m, via: 'pick' });
  }

  function unlink() {
    setDismissed(form.memberId);
    set({ memberId: null });
  }

  const linked = form.memberId && lookup.members.find((m) => m.id === form.memberId);

  const tips = useMemo(() => {
    const words = `${form.category} ${form.subCategory}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (!words.length) return [];
    return KB.filter((k) => words.some((w) => k.tags.includes(w) || k.title.toLowerCase().includes(w))).slice(0, 2);
  }, [form.category, form.subCategory]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (form.channel === 'Email' && (!form.email || !form.subject.trim())) return setErr('Enter the sender’s email and the email subject.');
    if (form.channel !== 'Email' && !form.phone) return setErr('Enter the caller’s mobile number.');
    if (form.caseType === 'Request' && !allowedCategories('Request', form.callerType).includes(form.category)) return setErr('SOP: a caller who is not a registered member can only request a new membership or a new supplier registration.');
    if (!form.caseType || !form.category || !form.subCategory) return setErr('Select case type, category and sub-category.');
    if (!form.description.trim()) return setErr('Describe the query / concern.');
    if (outcome === 'Escalated' && !form.store) return setErr('Select the store to escalate to.');
    setSaving(true);
    try {
      const c = await api.post('/cases', {
        ...form,
        subject: form.channel === 'Email' ? form.subject : form.subCategory,
        status: outcome,
        note: note || undefined,
        source: { missedCallId: params.get('missedId') || undefined, leadId: params.get('leadId') || undefined },
      });
      refreshStats();
      nav(`/cases/${c.id}`, { state: { created: true, warning: c.warning } });
    } catch (e2) {
      setErr(e2.message);
      setSaving(false);
    }
  }

  const isCall = form.channel !== 'Email';
  const greeting = SCRIPTS[form.channel === 'Outbound call' ? 3 : 0].text.replace('[Name]', agent);
  const onLiveCall = Boolean(form.callTxnId && callState?.callId === form.callTxnId && !callState?.ended);
  const found = form.memberId;
  const notFound = searched && !found && q && q.length >= 3 && lookup.members.length === 0;

  return (
    <form onSubmit={save} className="newcase">
      <div className="page-head">
        <div>
          <h1>New Case</h1>
          <div className="muted">Customer care · LOTS Wholesale Solutions</div>
        </div>
        <span className={`state-pill ${onLiveCall ? 'live' : ''}`}>{onLiveCall ? '● On live call' : 'Draft'}</span>
      </div>
      {params.get('missedId') && <div className="notice">Calling back missed call {params.get('missedId')}. It is marked “Called back” when you save.</div>}
      {txnParam && (
        <div className="notice">
          SparkTG call {txnParam} is linked to this case when you save.{sparkMsg && <> {sparkMsg}</>}
        </div>
      )}
      {params.get('leadId') && <div className="notice">Concern raised on outbound lead {params.get('leadId')}.</div>}

      <div className="two-col">
        <div>
          {/* SOP step 1: Registered member? */}
          <section className="identify">
            <div className="identify-head">
              <strong>Identify caller</strong>
              <span>Registered member? A registered mobile or card number fills in every member detail</span>
            </div>
            <div className="identify-grid">
              <div className="identify-col">
                <label>
                  MOBILE NUMBER <span className="tag">Recommended</span>
                </label>
                <div className="identify-row">
                  <input
                    value={form.phone}
                    onChange={(e) => {
                      setSearched(false);
                      set({ phone: e.target.value.replace(/[^\d+ ]/g, ''), memberId: null });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchNow(form.phone))}
                    placeholder="10-digit mobile (+91 / 0 fine)"
                    autoFocus={isCall}
                  />
                  <button type="button" onClick={() => searchNow(form.phone)}>
                    <Icon name="search" size={16} /> Search
                  </button>
                </div>
                <div className="identify-hint">Finds owner, alternate and add-on card mobiles</div>
              </div>
              <div className="identify-divider" />
              <div className="identify-col">
                <label>
                  CARD NUMBER <span className="tag dim">If mobile unavailable</span>
                </label>
                <div className="identify-row">
                  <input
                    value={form.cardNo}
                    onChange={(e) => {
                      setSearched(false);
                      set({ cardNo: e.target.value, memberId: null });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchNow(form.cardNo))}
                    placeholder="Membership / add-on card no."
                  />
                  <button type="button" onClick={() => searchNow(form.cardNo)}>
                    <Icon name="search" size={16} /> Search
                  </button>
                </div>
                <div className="identify-hint">Member card or add-on card</div>
              </div>
            </div>
            {found && (
              <div className="identify-result ok">
                <Icon name="check" size={16} /> Registered member: <strong>{form.businessName}</strong> · details filled in below
              </div>
            )}
            {notFound && (
              <div className="identify-result">
                Not a registered member. Choose <strong>Not registered</strong> (only new membership / supplier registration requests) or <strong>B2C customer</strong> (AKD &amp; NSP, food items of Indian origin), or{' '}
                <Link to="/members">add the member</Link>.
              </div>
            )}
          </section>

          {found && <MemberCard member={linked} match={lookup.match?.member.id === form.memberId ? lookup.match : null} openCases={lookup.openCases} memberId={form.memberId} onUnlink={unlink} />}
          {!found && lookup.members.length > 0 && (
            <div className="lookup">
              <div className="muted small">Matching members: click to fill</div>
              {lookup.members.map((m) => (
                <button type="button" key={m.id} className="lookup-row" onClick={() => pickMember(m)}>
                  <strong>{m.businessName}</strong> · {m.ownerName} · {m.phone} · card {m.cardNo || '—'} {m.status === 'Blocked' && <span className="badge st-escalated">Blocked</span>}
                </button>
              ))}
            </div>
          )}
          {(lookup.cases.length > 0 || lookup.calls?.length > 0) && (
            <details className="history" open>
              <summary>
                Caller history: {lookup.cases.length} case(s){lookup.calls?.length ? `, ${lookup.calls.length} recent call(s)` : ''}
              </summary>
              {lookup.cases.map((c) => (
                <Link key={c.id} to={`/cases/${c.id}`} target="_blank" className="lookup-row">
                  {c.id} · {fmtDate(c.createdAt)} · {c.category} / {c.subCategory} <StatusBadge status={c.status} />
                </Link>
              ))}
              {lookup.calls?.map((k) => (
                <Link key={k.txnId} to={`/cases/${k.caseId}`} target="_blank" className="lookup-row">
                  Call {k.startedAt || k.txnId} · {[k.direction, k.disposition, k.durationSec != null && `${k.durationSec}s`, k.agent].filter(Boolean).join(' · ')} · case {k.caseId}
                </Link>
              ))}
            </details>
          )}

          {/* SOP: communication channel */}
          <section className="card">
            <h2 className="section-h">
              Source of case <span className="req">*</span>
            </h2>
            <div className="source-cards">
              {SOURCES.map((o) => (
                <button type="button" key={o.value} className={`source-card ${form.channel === o.value ? 'on' : ''}`} onClick={() => set({ channel: o.value })}>
                  <Icon name={o.icon} size={20} />
                  <span>
                    <strong>{o.value}</strong>
                    <small>{o.hint}</small>
                  </span>
                </button>
              ))}
            </div>
            {isCall ? (
              <div className="script-line">
                <Icon name="phone" size={14} /> “{greeting}”
              </div>
            ) : (
              <div className="grid" style={{ marginTop: 12 }}>
                <Field label="Sender email *">
                  <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="customer@example.com" />
                </Field>
                <Field label="Email subject *" wide>
                  <input value={form.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Wrong product billed at Akshardham" />
                </Field>
                <div className="field wide hint">SOP: call the customer to understand the complete details before creating the case, then reply as per the template.</div>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="section-h">Caller details</h2>
            <div className="grid">
              <Field label="Caller type">
                <Select value={form.callerType} options={CALLER_TYPES} onChange={(v) => set({ callerType: v, memberId: v === 'Registered member' ? form.memberId : null, ...(form.caseType === 'Request' ? { category: '', subCategory: '' } : {}) })} />
              </Field>
              <Field label="Name">
                <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Business name">
                <input value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
              </Field>
              {isCall && (
                <Field label="Email">
                  <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              )}
              {isCall && (
                <Field label="SparkTG call ID" hint="Filled in automatically on a live call">
                  <input value={form.callTxnId} onChange={(e) => set({ callTxnId: e.target.value.trim() })} placeholder="Call ID" />
                </Field>
              )}
            </div>
          </section>

          {/* SOP: select case type → category */}
          <section className="card">
            <h2 className="section-h">Case details</h2>
            <div className="grid">
              <Classifier value={form} onChange={setForm} />
              {form.subCategory === 'Return / exchange' && (
                <Field label="Purchase date" hint="SOP: returns within 7 working days">
                  <input type="date" value={form.purchaseDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ purchaseDate: e.target.value })} />
                </Field>
              )}
              <Field label="Details *" wide>
                <textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What the customer said: amounts, dates, products…" />
              </Field>
            </div>
          </section>

          {/* SOP: resolve within TAT? */}
          <section className="card">
            <h2 className="section-h">Resolve within TAT?</h2>
            <SopWarnings list={sopWarnings(form)} />
            <div className="outcomes">
              {OUTCOMES.map((o) => (
                <label key={o.status} className={`outcome ${outcome === o.status ? 'on' : ''}`}>
                  <input type="radio" name="outcome" checked={outcome === o.status} onChange={() => setOutcome(o.status)} />
                  <strong>{o.label}</strong>
                  <span className="muted small">{o.hint}</span>
                </label>
              ))}
            </div>
            {outcome === 'Escalated' && (
              <div className="notice">
                Escalated to the store team. <strong>EDC (expected date of closure): {edc()}</strong>. The store gets the escalation email, and the case appears in Store follow-ups.
              </div>
            )}
            <Field label={outcome === 'Closed' ? 'Resolution given' : outcome === 'Waiting' ? 'Information requested from the customer' : outcome === 'Escalated' ? 'What the store needs to do' : 'Note'} wide>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {outcome === 'Closed' && isCall && <div className="script-line">Before you save: “Is there anything else I can assist you with?”</div>}
            {err && <div className="error">{err}</div>}
            <div className="row end">
              <button className="btn primary big" disabled={saving}>
                {saving ? 'Saving…' : 'Save case'}
              </button>
            </div>
          </section>
        </div>

        <aside className="side-help">
          <div className="card">
            <h3>Call handling (SOP)</h3>
            <ul className="tight">
              <li>Answer within 3 rings.</li>
              <li>Hold: explain why, take their number in case the call is cut, give your best estimate of the hold time. Longer than a couple of minutes: ask for a number and a time to call back.</li>
              <li>Missed calls: call back within 30 minutes.</li>
              <li>Closing: “Is there anything else I can assist you with?”</li>
            </ul>
          </div>
          {requirementsFor(form.subCategory) && (
            <div className="card req-card">
              <h3>Request requirements · {form.subCategory}</h3>
              <ul className="tight">
                {requirementsFor(form.subCategory).items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {tips.map((k) => (
            <div className="card" key={k.title}>
              <h3>{k.title}</h3>
              {k.conflict && <div className="conflict">SOP conflict: {k.conflict}</div>}
              <ul className="tight">
                {k.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
          {!tips.length && <div className="muted small pad">Pick a category to see the matching SOP answers here.</div>}
        </aside>
      </div>
    </form>
  );
}

function MemberCard({ member: m, match, openCases, memberId, onUnlink }) {
  if (!m) {
    return (
      <div className="notice ok">
        Linked to member <strong>{memberId}</strong>{' '}
        <button type="button" className="link" onClick={onUnlink}>
          unlink
        </button>
      </div>
    );
  }
  const blocked = m.status === 'Blocked';
  const rows = [
    ['Owner', m.ownerName],
    ['Mobile', [m.phone, m.altPhone].filter(Boolean).join(' / ')],
    ['Card', m.cardNo],
    ['Group', [m.customerGroup, m.customerType].filter(Boolean).join(' › ')],
    ['Home store', m.homeStore],
    ['GSTIN / licence', m.gstin || m.licenceType],
    ['Email', m.email],
    ['Add-on cards', String((m.addOnCards || []).length)],
    ['Open cases', String(openCases ?? 0)],
  ];
  return (
    <div className={`member-card ${blocked ? 'blocked' : ''}`}>
      <div className="row between">
        <div>
          <strong>{m.businessName}</strong> <span className="muted small">· registered member {m.id}</span>
          {match?.via === 'add-on' && <span className="badge st-resolved">Add-on holder: {match.addOn.name || match.addOn.phone}</span>}
          {blocked && <span className="badge st-escalated">Card blocked</span>}
        </div>
        <button type="button" className="link" onClick={onUnlink}>
          not this member
        </button>
      </div>
      <div className="member-grid small">
        {rows.map(([k, v]) => (
          <div key={k}>
            <span className="muted">{k}</span> {v || '—'}
          </div>
        ))}
      </div>
      {m.address && (
        <div className="small">
          <span className="muted">Registered address (delivery only here):</span> {m.address}
        </div>
      )}
      {m.notes && (
        <div className="small">
          <span className="muted">Notes:</span> {m.notes}
        </div>
      )}
    </div>
  );
}

export function SopWarnings({ list }) {
  if (!list.length) return null;
  return (
    <div className="sop-warnings">
      <strong>SOP check</strong>
      <ul className="tight">
        {list.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
