import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { KB } from '../knowledge.js';
import { Field, Select, StatusBadge, fmtDate, useMeta, usePicklists } from '../ui.jsx';
import Classifier, { allowedCategories, allowedTypes } from '../components/Classifier.jsx';
import { WorkflowHint } from '../components/WorkflowCard.jsx';
import Icon from '../components/Icon.jsx';
import { useSparkTG } from '../sparktg.jsx';
import { requirementsFor, sopWarnings } from '../requirements.js';
import { CALL_TYPES, CALL_TYPE_OF_CHANNEL, CASE_MASTER, RESOLUTION_TYPES } from '../taxonomy.js';

// SOP "Resolve within TAT?": resolved over telephone, info missing (Waiting) or escalate to the store team.
const OUTCOMES = [
  {
    status: 'Closed',
    label: 'Resolved over telephone (ROT)',
    hint: 'Answered from the SOP / FAQ; the case closes now',
  },
  {
    status: 'Waiting',
    label: 'Info missing → Waiting',
    hint: 'Discrepancy or missing details; stays Waiting until the customer provides them',
  },
  {
    status: 'Escalated',
    label: 'Escalate',
    hint: 'To the store or team of this case type (see Workflow above) · as per the escalation matrix',
  },
];

// SOP communication channels. "Missed call callback" = calling back a missed / disconnected call (TAT 30 min).
// SOP glossary EDC = expected date of closure: L1 TAT is 1 working day (Sunday not counted).
function edc() {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function NewCase() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refreshStats } = useMeta();
  const { tree, list, dependents } = usePicklists();

  const [form, setForm] = useState({
    channel: params.get('channel') || (params.get('missedId') ? 'Missed call callback' : params.get('leadId') ? 'Outbound call' : 'Inbound call'),
    callerType: 'Registered With Lots',
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
    callType: '', // set from the channel below
    calledNumber: '',
    subject: '',
    purchaseDate: '',
  });
  const [outcome, setOutcome] = useState('Closed');
  // “Same as contact's mobile”: the called number follows the mobile
  const [sameNumber, setSameNumber] = useState(false);
  useEffect(() => {
    setForm((f) => (f.callType || !CALL_TYPE_OF_CHANNEL[f.channel] ? f : { ...f, callType: CALL_TYPE_OF_CHANNEL[f.channel] }));
  }, []);
  useEffect(() => {
    if (sameNumber) setForm((f) => (f.calledNumber === f.phone ? f : { ...f, calledNumber: f.phone }));
  }, [sameNumber, form.phone]);
  const [note, setNote] = useState('');
  const [lookup, setLookup] = useState({
    members: [],
    cases: [],
    calls: [],
    match: null,
  });
  const [dismissed, setDismissed] = useState(null); // member the agent unlinked — don't auto-link it again
  const [sparkMsg, setSparkMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Resolution types of the chosen category (case master: "Resolution Type" by category), for the "What happens now?" dropdown.
  const resolutionOptions = useMemo(() => {
    const res = new Set();
    for (const v of dependents ? dependents('Resolution Type', 'Category', form.category) || [] : []) res.add(v);
    for (const v of (CASE_MASTER[form.category] || {}).resolution || []) res.add(v);
    for (const v of RESOLUTION_TYPES) res.add(v);
    for (const v of ['In-audible / Disconnected in between', 'Information Provided', 'Not Relevant or Spam', 'On Hold', 'Pending', 'Waiting for Clarification from CUSTOMER']) res.add(v);
    return [...res].filter(Boolean);
  }, [form.category, dependents]);

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
        const digits = String(info.phone || '')
          .replace(/\D/g, '')
          .slice(-10);
        if (digits) {
          setForm((f) => (f.phone ? f : { ...f, phone: digits }));
          setSparkMsg(`Caller number ${digits} fetched from SparkTG.`);
        } else setSparkMsg('SparkTG did not return a caller number — type it in.');
      })
      .catch((e) => setSparkMsg(`Could not fetch the caller from SparkTG: ${e.message}`));
  }, [txnParam, phoneParam]);

  // one search box: mobile, card no., membership ID, name, business name or email
  const [search, setSearch] = useState(params.get('phone') || '');
  const q = search.trim() || form.phone || form.cardNo;
  // a number filled in by a live call / screen-pop shows in the search box
  useEffect(() => {
    if (form.phone && !search) setSearch(form.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.phone]);
  function onSearchChange(v) {
    setSearched(false);
    setSearch(v);
    const digits = v.replace(/\D/g, '');
    // what the search is, for a caller who isn't registered: a mobile or an email goes on the case
    const patch = { memberId: null };
    if (/^[\d+ -]+$/.test(v.trim()) && digits.length >= 10) patch.phone = digits.slice(-10);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) patch.email = v.trim();
    set(patch);
  }
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
            setSearched(true);
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
        callerType: 'Registered With Lots',
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
    const words = `${form.category} ${form.subCategory}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
    if (!words.length) return [];
    return KB.filter((k) => words.some((w) => k.tags.includes(w) || k.title.toLowerCase().includes(w))).slice(0, 2);
  }, [form.category, form.subCategory]);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (form.channel === 'Email' && (!form.email || !form.subject.trim())) return setErr('Enter the sender’s email and the email subject.');
    if (form.channel !== 'Email' && !form.phone) return setErr('Enter the caller’s mobile number.');
    if (form.channel !== 'Email' && !form.callType) return setErr('Select the type of call.');
    if (!form.caseType || (!form.category && Object.keys(tree[form.caseType] || {}).length)) return setErr('Select case type and category.');
    if ((tree[form.caseType]?.[form.category] || []).length && !form.subCategory) return setErr('Select the sub-category.');
    if (!form.description.trim()) return setErr('Describe the query / concern.');
    if (outcome === 'Escalated' && !form.store) return setErr('Select the store to escalate to.');
    setSaving(true);
    try {
      const c = await api.post('/cases', {
        ...form,
        subject: form.channel === 'Email' ? form.subject : form.subCategory || form.category,
        status: outcome,
        note: note || undefined,
        source: {
          missedCallId: params.get('missedId') || undefined,
          leadId: params.get('leadId') || undefined,
        },
      });
      refreshStats();
      nav(`/cases/${c.id}`, { state: { created: true, warning: c.warning } });
    } catch (e2) {
      setErr(e2.message);
      setSaving(false);
    }
  }

  const isCall = form.channel !== 'Email';
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
          SparkTG call {txnParam} is linked to this case when you save.
          {sparkMsg && <> {sparkMsg}</>}
        </div>
      )}
      {params.get('leadId') && <div className="notice">Concern raised on outbound lead {params.get('leadId')}.</div>}

      <div className="two-col">
        <div>
          {/* SOP step 1: Registered member? */}
          <section className="identify">
            <div className="identify-head">
              <strong>Identify caller</strong>
              <span>Registered member? Search by anything you have; a match fills in every member detail</span>
            </div>
            <div className="identify-row">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchNow(search.trim()))}
                placeholder="Mobile, card no., membership ID, name, business name or email"
                autoFocus={isCall}
              />
              <button type="button" onClick={() => searchNow(search.trim())}>
                <Icon name="search" size={16} /> Search
              </button>
            </div>
            <div className="identify-hint">Finds the owner, alternate and add-on card holders: by any of their mobiles or card numbers, the membership ID (M-00123), name, business name or email</div>
            {found && (
              <div className="identify-result ok">
                <Icon name="check" size={16} /> Registered member: <strong>{form.businessName}</strong> · details filled in below
              </div>
            )}
            {notFound && (
              <div className="identify-result">
                Not a registered member. Choose <strong>Not Registered</strong> or <strong>Others</strong> (e.g. B2C walk-in customers at AKD &amp; NSP, food items of Indian origin), or{' '}
                <Link to={`/contacts/new?phone=${encodeURIComponent(form.phone || '')}`}>create the contact</Link>.
              </div>
            )}
          </section>

          {found && <MemberCard member={linked} match={lookup.match?.member.id === form.memberId ? lookup.match : null} openCases={lookup.openCases} memberId={form.memberId} onUnlink={unlink} />}
          {!found && lookup.members.length > 0 && (
            <div className="lookup">
              <div className="muted small">{lookup.shared ? `${lookup.shared} contacts share this mobile (each with its own card no.): click the caller to fill` : 'Matching members: click to fill'}</div>
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
                Caller history: {lookup.cases.length} case(s)
                {lookup.calls?.length ? `, ${lookup.calls.length} recent call(s)` : ''}
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
              <span className="step-no">1</span> How did they contact us? <span className="req">*</span>
            </h2>
            {/* channel and call details on one row, across the full width */}
            <div className="grid four">
              <Field label="Channel *">
                <Select
                  value={isCall ? 'Call' : 'Email'}
                  options={['Call', 'Email']}
                  onChange={(v) =>
                    set(
                      v === 'Email'
                        ? { channel: 'Email' }
                        : {
                            channel: Object.keys(CALL_TYPE_OF_CHANNEL).find((ch) => CALL_TYPE_OF_CHANNEL[ch] === form.callType) || 'Inbound call',
                            callType: form.callType || 'Inbound',
                          }
                    )
                  }
                />
              </Field>
              {isCall ? (
                <>
                  {/* call details, as on LOTS's Vtiger case form */}
                  <Field label="Type of call *">
                    <Select
                      value={form.callType}
                      options={CALL_TYPES}
                      onChange={(v) =>
                        set({
                          callType: v,
                          channel: Object.keys(CALL_TYPE_OF_CHANNEL).find((ch) => CALL_TYPE_OF_CHANNEL[ch] === v) || form.channel,
                        })
                      }
                    />
                  </Field>
                  <div className="field">
                    <span className="field-label">Called number</span>
                    <input
                      value={form.calledNumber}
                      onChange={(e) =>
                        set({
                          calledNumber: e.target.value.replace(/[^\d+ ]/g, ''),
                        })
                      }
                      disabled={sameNumber}
                      placeholder="Number on the call"
                    />
                    <label className="row small">
                      <input
                        type="checkbox"
                        checked={sameNumber}
                        onChange={(e) => (
                          setSameNumber(e.target.checked),
                          set({
                            calledNumber: e.target.checked ? form.phone : form.calledNumber,
                          })
                        )}
                      />{' '}
                      Same as contact&apos;s mobile
                    </label>
                  </div>
                  <Field label="Call transaction ID" hint="Filled in automatically on a live SparkTG call">
                    <input value={form.callTxnId} onChange={(e) => set({ callTxnId: e.target.value.trim() })} placeholder="e.g. 5e15d0d8-f557-491f-…" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Sender email *">
                    <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="customer@example.com" />
                  </Field>
                  <Field label="Email subject *" className="span-2">
                    <input value={form.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="e.g. Wrong product billed at Akshardham" />
                  </Field>
                  <div className="field wide hint">SOP: call the customer to understand the complete details before creating the case, then reply as per the template.</div>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="section-h">
              <span className="step-no">2</span> Type of customer
            </h2>
            <div className="grid">
              <Field label="Type of contact">
                <Select
                  value={form.callerType}
                  options={list('Caller Type')}
                  onChange={(v) =>
                    set({
                      callerType: v,
                      memberId: v === 'Registered With Lots' ? form.memberId : null,
                      ...(allowedTypes(v, tree, dependents).includes(form.caseType) && (!form.category || allowedCategories(form.caseType, v, tree).includes(form.category))
                        ? {}
                        : {
                            caseType: '',
                            category: '',
                            subCategory: '',
                            sub2: '',
                          }),
                    })
                  }
                />
              </Field>
              <Field label="Name">
                <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Business name">
                <input value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
              </Field>
              <Field label={isCall ? 'Mobile *' : 'Mobile'}>
                <input value={form.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+ ]/g, '') })} placeholder="10-digit mobile" />
              </Field>
              <Field label="Card no.">
                <input value={form.cardNo} onChange={(e) => set({ cardNo: e.target.value })} placeholder="Membership / add-on card no." />
              </Field>
              {isCall && (
                <Field label="Email">
                  <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
              )}
            </div>
          </section>

          {/* SOP: select case type → category */}
          <section className="card">
            <h2 className="section-h">
              <span className="step-no">3</span> Query type
            </h2>
            <div className="grid">
              <Classifier value={form} onChange={setForm} />
              <div className="field wide">
                <WorkflowHint c={form} />
              </div>
              <Field label="Details *" wide>
                <textarea rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What the customer said: amounts, dates, products…" />
              </Field>
            </div>
          </section>

          {/* SOP: resolve within TAT? */}
          <section className="card">
            <h2 className="section-h">
              <span className="step-no">4</span> What happens now?
            </h2>
            <SopWarnings list={sopWarnings(form)} />
            {outcome === 'Closed' && (
              <Field label="Resolution type">
                <Select value={form.closureType || ''} options={resolutionOptions} onChange={(v) => set({ closureType: v })} />
              </Field>
            )}
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
          {requirementsFor(form) && (
            <div className="card req-card">
              <h3>Documents needed</h3>
              <ul className="tight">
                {requirementsFor(form).items.map((i) => (
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
        {/* as on the Vtiger contact block; the contact form opens in a new tab so this case isn't lost */}
        <div className="row">
          <Link className="btn sm" to={`/contacts/${m.id}`} target="_blank" title="Edit this contact (opens in a new tab)">
            Edit
          </Link>
          <Link className="btn sm" to={`/contacts/new?phone=${encodeURIComponent(m.phone || '')}`} target="_blank" title="Create another contact (opens in a new tab)">
            + Add Another Contact
          </Link>
          <button type="button" className="btn sm" onClick={onUnlink} title="Not this member: pick or search another">
            Change
          </button>
        </div>
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
