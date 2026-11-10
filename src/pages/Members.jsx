import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { CUSTOMER_GROUPS } from '../taxonomy.js';
import { Empty, Field, Select, storeLabel, useLoad, useMeta } from '../ui.jsx';
import MemberImport from '../components/MemberImport.jsx';
import { CallButton } from '../components/Dialer.jsx';

export const MAX_ADDON_CARDS = 4; // process owner decision, 30 Sep 2026

const blank = { businessName: '', ownerName: '', phone: '', altPhone: '', email: '', cardNo: '', gstin: '', licenceType: '', customerGroup: '', customerType: '', homeStore: '', address: '', addOnCards: [], notes: '' };

export default function Members() {
  const { stores } = useMeta();
  const [q, setQ] = useState('');
  const [res, reload] = useLoad(() => api.get('/members?q=' + encodeURIComponent(q)), [q]);
  const members = res?.items;
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [showImport, setShowImport] = useState(false);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (!form.businessName || !form.phone) return setErr('Business name and phone are required.');
    try {
      if (form.id) await api.patch('/members/' + form.id, form);
      else await api.post('/members', form);
      setForm(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  const addOns = form?.addOnCards || [];

  return (
    <>
      <div className="page-head">
        <h1>Members</h1>
        <div className="row">
          <button className="btn" onClick={() => setShowImport(!showImport)}>
            Import CSV
          </button>
          <button className="btn primary" onClick={() => setForm({ ...blank })}>
            + Add member
          </button>
        </div>
      </div>

      {showImport && <MemberImport onDone={reload} />}
      {form && (
        <form className="card" onSubmit={save}>
          <h2>{form.id ? `Edit ${form.id}` : 'New member'}</h2>
          <div className="grid">
            <Field label="Business name *">
              <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </Field>
            <Field label="Owner name">
              <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </Field>
            <Field label="Registered mobile *">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </Field>
            <Field label="Alternate phone">
              <input value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Membership card no.">
              <input value={form.cardNo} onChange={(e) => setForm({ ...form, cardNo: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Business licence used">
              <input value={form.licenceType} onChange={(e) => setForm({ ...form, licenceType: e.target.value })} placeholder="GST / FSSAI / Trade licence…" />
            </Field>
            <Field label="Customer group">
              <Select value={form.customerGroup} options={Object.keys(CUSTOMER_GROUPS)} onChange={(v) => setForm({ ...form, customerGroup: v, customerType: '' })} />
            </Field>
            <Field label="Customer type">
              <Select value={form.customerType} options={CUSTOMER_GROUPS[form.customerGroup] || []} onChange={(v) => setForm({ ...form, customerType: v })} disabled={!form.customerGroup} />
            </Field>
            <Field label="Home store">
              <Select value={form.homeStore} options={stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short}` }))} onChange={(v) => setForm({ ...form, homeStore: v })} />
            </Field>
            <Field label="Status">
              <Select value={form.status || 'Active'} options={['Active', 'Blocked']} onChange={(v) => setForm({ ...form, status: v })} />
            </Field>
            <Field label="Registered business address (delivery goes only here)" wide>
              <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <div className="field wide">
              <span className="field-label">Add-on cards (blocked automatically if the owner card is blocked)</span>
              {addOns.map((a, i) => (
                <div className="row" key={i}>
                  <input value={a.name} placeholder="Name" onChange={(e) => setForm({ ...form, addOnCards: addOns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input value={a.phone} placeholder="Mobile" onChange={(e) => setForm({ ...form, addOnCards: addOns.map((x, j) => (j === i ? { ...x, phone: e.target.value.replace(/\D/g, '').slice(0, 10) } : x)) })} />
                  <input value={a.cardNo} placeholder="Card no." onChange={(e) => setForm({ ...form, addOnCards: addOns.map((x, j) => (j === i ? { ...x, cardNo: e.target.value } : x)) })} />
                  <button type="button" className="link" onClick={() => setForm({ ...form, addOnCards: addOns.filter((_, j) => j !== i) })}>
                    remove
                  </button>
                </div>
              ))}
              {addOns.length < MAX_ADDON_CARDS ? (
                <button type="button" className="link" onClick={() => setForm({ ...form, addOnCards: [...addOns, { name: '', phone: '', cardNo: '' }] })}>
                  + add-on card ({addOns.length} of {MAX_ADDON_CARDS})
                </button>
              ) : (
                <span className="muted small">Maximum {MAX_ADDON_CARDS} add-on cards per member reached.</span>
              )}
            </div>
            <Field label="Notes" wide>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          {err && <div className="error">{err}</div>}
          <div className="row end">
            <button type="button" className="btn" onClick={() => setForm(null)}>
              Cancel
            </button>
            <button className="btn primary">Save member</button>
          </div>
        </form>
      )}

      <div className="card filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phone, card no., business, owner, email, GSTIN…" />
      </div>
      <section className="card">
        {!members ? (
          <Empty>Loading…</Empty>
        ) : members.length === 0 ? (
          <Empty>No members yet. Add members here, or import your member master later.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Business</th>
                <th>Contact</th>
                <th>Group / type</th>
                <th>Store</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.id}
                    <div className="muted small">card {m.cardNo || '—'}</div>
                  </td>
                  <td>
                    <strong>{m.businessName}</strong>
                    <div className="muted small">{m.ownerName}</div>
                  </td>
                  <td className="small">
                    {m.phone}
                    <div>{m.email}</div>
                  </td>
                  <td className="small">
                    {m.customerGroup}
                    <div className="muted">{m.customerType}</div>
                  </td>
                  <td>{storeLabel(stores, m.homeStore)}</td>
                  <td>{m.status === 'Blocked' ? <span className="badge st-escalated">Blocked</span> : 'Active'}</td>
                  <td>
                    <div className="row">
                      <CallButton phone={m.phone} />
                      <button className="btn sm" onClick={() => setForm({ ...blank, ...m })}>
                        Edit
                      </button>
                      <Link className="btn sm" to={`/cases?q=${m.phone}`}>
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
