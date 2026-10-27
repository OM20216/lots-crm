import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta, usePicklists } from '../ui.jsx';
import Icon from '../components/Icon.jsx';
import { MAX_ADDON_CARDS } from './Members.jsx';
import { EMPTY, SECTIONS, toMember } from '../contactFields.js';

// "Creating Contact" — same sections and fields as the LOTS contact form in Vtiger.
// A contact is stored as a member record, so it is recognised automatically when the customer calls.

const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10);

// Member record → form (members imported or added before this form get their fields mapped).
function toForm(m) {
  if (m.contact) return { ...EMPTY, ...m.contact };
  const [first, ...rest] = String(m.ownerName || '').trim().split(/\s+/);
  return {
    ...EMPTY,
    firstName: first || '', lastName: rest.join(' '), businessName: m.businessName || '', emails: [{ type: 'Primary', address: m.email || '' }],
    phones: [{ type: 'Mobile', number: m.phone || '' }, ...(m.altPhone ? [{ type: 'Mobile', number: m.altPhone }] : [])],
    cardNo: m.cardNo || '', gstNumber: m.gstin || '', businessLicenceType: m.licenceType || '', segment3: m.customerGroup || '', segment4: m.customerType || '',
    registeredStoreCode: m.homeStore || '', businessAddress: m.address || '', customerStatus: m.status || 'Active', contactType: 'Registered Member',
    addons: (m.addOnCards || []).map((a) => ({ firstName: a.name || '', lastName: '', relationship: '', mobile: a.phone || '', landline: '', dob: '', cardNo: a.cardNo || '' })),
    description: m.notes || '',
  };
}


function validate(v) {
  const e = {};
  for (const s of SECTIONS)
    for (const fl of s.fields) {
      const val = v[fl.key];
      if (fl.required) {
        const empty = fl.type === 'phones' ? !v.phones.some((p) => p.number.trim()) : !String(val ?? '').trim();
        if (empty) e[fl.key] = `The ${fl.label} field is required.`;
      }
      if (fl.pattern && val && !fl.pattern.test(String(val))) e[fl.key] = fl.patternMsg;
    }
  v.phones.forEach((p, i) => {
    if (p.number && digits(p.number).length !== 10) e[`phones.${i}`] = 'Enter a 10-digit number.';
  });
  v.emails.forEach((m, i) => {
    if (m.address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.address)) e[`emails.${i}`] = 'Enter a valid email address.';
  });
  v.addons.forEach((a, i) => {
    if (a.mobile && digits(a.mobile).length !== 10) e[`addons.${i}`] = 'Add-on mobile must be 10 digits.';
  });
  // one number, one place: the same number twice on this contact is not allowed either
  const seen = {};
  [...v.phones.map((p, i) => [`phones.${i}`, p.number]), ...v.addons.map((a, i) => [`addons.${i}`, a.mobile])].forEach(([k, n]) => {
    const d = digits(n);
    if (d.length !== 10) return;
    if (seen[d]) e[k] = `${d} is already entered above on this contact.`;
    else seen[d] = k;
  });
  return e;
}

// all 10-digit numbers on the form, with the field they are in
const formNumbers = (v) =>
  [...v.phones.map((p, i) => [`phones.${i}`, digits(p.number)]), ...v.addons.map((a, i) => [`addons.${i}`, digits(a.mobile)])].filter(([, d]) => d.length === 10);

export default function ContactForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { stores, agents, agent } = useMeta();
  const [v, setV] = useState(null);
  const [orig, setOrig] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState({});
  const [active, setActive] = useState('validation');
  const [menuOpen, setMenuOpen] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const bodyRef = useRef(null);
  const refs = useRef({});
  const closeRef = useRef(() => {});
  const [taken, setTaken] = useState({}); // number → contact it is already registered to

  useEffect(() => {
    if (!id) {
      // opened from a call / New Case with an unknown number: start with that number
      const phone = (params.get('phone') || '').replace(/\D/g, '').slice(-10);
      const fresh = { ...EMPTY, assignedTo: agent || '', phones: [{ type: 'Mobile', number: phone }], contactType: phone ? 'Registered Member' : '' };
      setV(fresh);
      setOrig(fresh);
      return;
    }
    api
      .get('/members/' + id)
      .then((m) => {
        const form = toForm(m);
        setV(form);
        setOrig(form);
      })
      .catch((e) => setServerErr(e.message));
  }, [id, agent, params]);

  // highlight the section in view
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !v) return;
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.dataset.section);
    }, { root, rootMargin: '0px 0px -70% 0px' });
    Object.values(refs.current).forEach((el) => el && el.isConnected && obs.observe(el));
    return () => obs.disconnect();
  }, [v !== null, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // registered numbers are unique: check each number against the other contacts as it is typed
  const numbersKey = v ? JSON.stringify(formNumbers(v).map(([, d]) => d)) : '[]';
  useEffect(() => {
    const nums = [...new Set(JSON.parse(numbersKey))];
    if (!nums.length) return setTaken({});
    const t = setTimeout(async () => {
      const out = {};
      for (const n of nums) {
        const r = await api.get('/lookup?q=' + n).catch(() => null);
        // every other contact with this number (a mobile may be shared by contacts that each have their own card no.)
        const others = (r?.members || []).filter((x) => x.id !== id);
        const m = others[0];
        if (m) out[n] = { id: m.id, name: m.businessName || m.ownerName, as: r.match?.via === 'add-on' ? 'add-on member' : 'registered contact', more: others.length - 1 };
      }
      setTaken(out);
    }, 400);
    return () => clearTimeout(t);
  }, [numbersKey, id]);

  // slide-in panel: Esc closes it, and the page behind does not scroll while it is open
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => SECTIONS.map((s) => ({ ...s, fields: s.fields.filter((fl) => !query || fl.label.toLowerCase().includes(query) || s.title.toLowerCase().includes(query)) })).filter((s) => s.fields.length), [query]);

  if (!v)
    return (
      <div className="cf-overlay">
        <div className="contact-form">
          <div className="empty">{serverErr || 'Loading…'}</div>
        </div>
      </div>
    );

  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);

  function slideOut(to = '/contacts', state) {
    setLeaving(true);
    setTimeout(() => nav(to, state ? { state } : undefined), 220);
  }

  function close() {
    if (dirty && !window.confirm('Discard the changes to this contact?')) return;
    slideOut();
  }
  closeRef.current = close;

  // scroll only the form (scrollIntoView would also scroll the page behind the panel)
  function jump(sid) {
    setClosed((c) => ({ ...c, [sid]: false }));
    setActive(sid);
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const el = refs.current[sid];
      if (body && el) body.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    });
  }

  async function save() {
    setServerErr('');
    const e = validate(v);
    // allowed when this contact has its own membership card no. (card numbers stay unique)
    if (!String(v.cardNo || '').trim()) for (const [k, d] of formNumbers(v)) if (taken[d] && !e[k]) e[k] = `${d} is already registered to ${taken[d].name} (${taken[d].id}). One number can belong to one contact only.`;
    setErrors(e);
    if (Object.keys(e).length) {
      const firstKey = Object.keys(e)[0].split('.')[0];
      const sec = SECTIONS.find((s) => s.fields.some((fl) => fl.key === firstKey));
      if (sec) jump(sec.id);
      return;
    }
    setSaving(true);
    try {
      const body = toMember(v, stores);
      const saved = id ? await api.patch('/members/' + id, body) : await api.post('/members', body);
      setOrig(v);
      slideOut('/contacts', { saved: `${saved.businessName || saved.ownerName} saved (${saved.id})` });
    } catch (err) {
      setSaving(false);
      const d = err.data?.phone;
      const hit = d && formNumbers(v).find(([, n]) => n === d);
      // a card number that belongs to someone else: next to the membership / add-on card field
      const card = err.data?.card && String(err.data.card).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sameCard = (c) => card && String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === card;
      const addon = card ? v.addons.findIndex((a) => sameCard(a.cardNo)) : -1;
      if (hit) {
        setErrors({ [hit[0]]: err.message });
        jump(hit[0].startsWith('addons') ? 'addon' : 'contact');
      } else if (card && sameCard(v.cardNo)) {
        setErrors({ cardNo: err.message });
        setServerErr(err.message);
      } else if (addon >= 0) {
        setErrors({ [`addons.${addon}`]: err.message });
        jump('addon');
      } else setServerErr(err.message);
    }
  }

  return (
    <div className={`cf-overlay ${leaving ? 'leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
    <div className="contact-form" role="dialog" aria-label={id ? 'Editing contact' : 'Creating contact'}>
      <header className="cf-top">
        <h1>{id ? 'Editing Contact :' : 'Creating Contact :'}</h1>
        <div className="cf-search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search" />
        </div>
        <button className="cf-x" onClick={close} title="Close">
          ✕
        </button>
      </header>

      <div className={`cf-wrap ${menuOpen ? '' : 'menu-closed'}`}>
        <aside className="cf-menu">
          <div className="cf-menu-head">
            {menuOpen && <span>Sections</span>}
            <button onClick={() => setMenuOpen((o) => !o)} title={menuOpen ? 'Hide sections' : 'Show sections'}>
              {menuOpen ? '«' : '»'}
            </button>
          </div>
          {menuOpen &&
            SECTIONS.map((s) => (
              <button key={s.id} className={`cf-menu-item ${active === s.id ? 'on' : ''}`} onClick={() => jump(s.id)} title={s.title}>
                {s.title}
              </button>
            ))}
        </aside>

        <div className="cf-body" ref={bodyRef}>
          {visible.length === 0 && <div className="empty">No field matches “{q}”.</div>}
          {visible.map((s) => (
            <section key={s.id} className="cf-section" data-section={s.id} ref={(el) => (refs.current[s.id] = el)}>
              <button className="cf-section-head" onClick={() => setClosed((c) => ({ ...c, [s.id]: !c[s.id] }))}>
                <span className={`cf-chev ${closed[s.id] ? 'shut' : ''}`}>⌄</span> {s.title}
              </button>
              {!closed[s.id] && (
                <div className={`cf-grid ${['addon', 'description'].includes(s.id) ? 'one' : ''}`}>
                  {s.fields.map((fl) => (
                    <FieldRow key={fl.key} fl={fl} v={v} set={set} errors={errors} stores={stores} agents={agents} taken={taken} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <footer className="cf-foot">
        {serverErr && <span className="error">{serverErr}</span>}
        {Object.keys(errors).length > 0 && <span className="cf-errcount">{Object.keys(errors).length} field(s) need attention</span>}
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn primary big" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </div>
    </div>
  );
}

function Taken({ n, taken, allowed }) {
  const t = taken[digits(n)];
  if (!t) return null;
  if (allowed)
    return (
      <div className="cf-note">
        Also used by <Link to={`/contacts/${t.id}`}>{t.name} ({t.id})</Link>
        {t.more > 0 ? ` and ${t.more} more` : ''}. Allowed: this contact has its own membership card no.
      </div>
    );
  return (
    <div className="cf-err">
      Already registered to <Link to={`/contacts/${t.id}`}>{t.name} ({t.id})</Link> as {t.as}. One number can belong to one contact only.
    </div>
  );
}

function FieldRow({ fl, v, set, errors, stores, agents, taken }) {
  const pk = usePicklists();
  const err = errors[fl.key];
  const val = v[fl.key];
  const label = (
    <label className="cf-label">
      {fl.required && <span className="cf-req">*</span>} {fl.label}
      {fl.hint && <small>{fl.hint}</small>}
    </label>
  );
  const wrap = (input, wide) => (
    <div className={`cf-row ${wide ? 'wide' : ''}`}>
      {label}
      <div className="cf-input">
        {input}
        {err && <div className="cf-err">{err}</div>}
      </div>
    </div>
  );

  switch (fl.type) {
    case 'select':
      return wrap(
        <select className={err ? 'bad' : ''} value={val || ''} onChange={(e) => set({ [fl.key]: e.target.value })}>
          <option value="">Select an Option</option>
          {fl.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case 'datalist': {
      const opts = fl.optionsFrom ? fl.optionsFrom(v, pk) : fl.options;
      return wrap(
        <>
          <input className={err ? 'bad' : ''} list={`dl-${fl.key}`} value={val || ''} onChange={(e) => set({ [fl.key]: e.target.value })} />
          <datalist id={`dl-${fl.key}`}>
            {opts.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    case 'textarea':
      return wrap(<textarea rows={3} className={err ? 'bad' : ''} value={val || ''} onChange={(e) => set({ [fl.key]: e.target.value })} />);
    case 'richtext':
      return wrap(<textarea rows={8} className="cf-rich" value={val || ''} onChange={(e) => set({ [fl.key]: e.target.value })} placeholder="Notes about this contact…" />, true);
    case 'date':
      return wrap(<input type="date" value={val || ''} onChange={(e) => set({ [fl.key]: e.target.value })} />);
    case 'checkbox':
      return wrap(<input type="checkbox" className="cf-check" checked={!!val} onChange={(e) => set({ [fl.key]: e.target.checked })} />);
    case 'readonly':
      return wrap(<input value={stores.find((s) => s.code === v.registeredStoreCode)?.name || ''} readOnly placeholder="Filled from the store code" />);
    case 'store':
      return wrap(
        <select value={val || ''} onChange={(e) => set({ registeredStoreCode: e.target.value })}>
          <option value="">Select an Option</option>
          {stores.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} {s.short}
            </option>
          ))}
        </select>
      );
    case 'agent':
      return wrap(
        <select className={err ? 'bad' : ''} value={val || ''} onChange={(e) => set({ assignedTo: e.target.value })}>
          <option value="">Select an Option</option>
          <option>Lots Helpdesk Admin</option>
          {agents.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      );
    case 'emails':
      return wrap(
        <div className="cf-multi">
          {v.emails.map((m, i) => (
            <div key={i}>
              <div className="cf-pair">
                <select value={m.type} onChange={(e) => set({ emails: v.emails.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                  <option>Primary</option>
                  <option>Secondary</option>
                  <option>Office</option>
                </select>
                <input type="email" className={errors[`emails.${i}`] ? 'bad' : ''} value={m.address} onChange={(e) => set({ emails: v.emails.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)) })} />
                {i > 0 && (
                  <button type="button" className="cf-del" onClick={() => set({ emails: v.emails.filter((_, j) => j !== i) })} title="Remove">
                    ✕
                  </button>
                )}
              </div>
              {errors[`emails.${i}`] && <div className="cf-err">{errors[`emails.${i}`]}</div>}
            </div>
          ))}
          <button type="button" className="cf-add" onClick={() => set({ emails: [...v.emails, { type: 'Secondary', address: '' }] })}>
            + Add
          </button>
        </div>
      );
    case 'phones':
      return wrap(
        <div className="cf-multi">
          {v.phones.map((p, i) => (
            <div key={i}>
              <div className="cf-pair">
                <select value={p.type} onChange={(e) => set({ phones: v.phones.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                  <option>Mobile</option>
                  <option>WhatsApp</option>
                  <option>Landline</option>
                  <option>Office</option>
                </select>
                <span className="cf-flag" title="India +91">🇮🇳 +91</span>
                <input inputMode="numeric" className={errors[`phones.${i}`] || (i === 0 && err) ? 'bad' : ''} value={p.number} onChange={(e) => set({ phones: v.phones.map((x, j) => (j === i ? { ...x, number: e.target.value.replace(/[^\d ]/g, '') } : x)) })} placeholder="10-digit number" />
                {i > 0 && (
                  <button type="button" className="cf-del" onClick={() => set({ phones: v.phones.filter((_, j) => j !== i) })} title="Remove">
                    ✕
                  </button>
                )}
              </div>
              {errors[`phones.${i}`] ? <div className="cf-err">{errors[`phones.${i}`]}</div> : <Taken n={p.number} taken={taken} allowed={Boolean(String(v.cardNo || '').trim())} />}
            </div>
          ))}
          <button type="button" className="cf-add" onClick={() => set({ phones: [...v.phones, { type: 'Mobile', number: '' }] })}>
            + Add
          </button>
        </div>
      );
    case 'addons':
      return (
        <div className="cf-row wide">
          <div className="cf-addons">
            {v.addons.map((a, i) => (
              <div className="cf-addon" key={i}>
                <div className="row between">
                  <strong>Add-on member {i + 1}</strong>
                  <button type="button" className="link" onClick={() => set({ addons: v.addons.filter((_, j) => j !== i) })}>
                    remove
                  </button>
                </div>
                <div className="cf-grid">
                  {[
                    ['firstName', 'Addon Firstname'],
                    ['lastName', 'Addon Lastname'],
                    ['relationship', 'Addon Relationship With Company'],
                    ['landline', 'Addon Landline'],
                    ['mobile', 'Addon Mobile'],
                    ['cardNo', 'Add-on Card No.'],
                    ['dob', 'Addon DOB', 'date'],
                  ].map(([k, l, t]) => (
                    <div className="cf-row" key={k}>
                      <label className="cf-label">{l}</label>
                      <div className="cf-input">
                        <input type={t || 'text'} value={a[k] || ''} onChange={(e) => set({ addons: v.addons.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} />
                      </div>
                    </div>
                  ))}
                </div>
                {errors[`addons.${i}`] ? <div className="cf-err">{errors[`addons.${i}`]}</div> : <Taken n={a.mobile} taken={taken} allowed={Boolean(String(v.cardNo || '').trim())} />}
              </div>
            ))}
            {v.addons.length < MAX_ADDON_CARDS ? (
              <button type="button" className="btn" onClick={() => set({ addons: [...v.addons, { firstName: '', lastName: '', relationship: '', mobile: '', landline: '', dob: '', cardNo: '' }] })}>
                + Add add-on member ({v.addons.length} of {MAX_ADDON_CARDS})
              </button>
            ) : (
              <span className="muted small">Maximum {MAX_ADDON_CARDS} add-on members per contact.</span>
            )}
          </div>
        </div>
      );
    default:
      return wrap(<input className={err ? 'bad' : ''} value={val || ''} onChange={(e) => set({ [fl.key]: fl.upper ? e.target.value.toUpperCase() : e.target.value })} />);
  }
}
