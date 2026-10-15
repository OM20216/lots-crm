import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { KNOWN_RELATIONSHIPS } from '../picklists.js';
import { fmtDate, useMeta, usePicklists } from '../ui.jsx';

const EMPTY = { mainField: '', mainValue: '', subField: '', subValue: '' };

// Dependency Manager (as in the PSRI CRM): which values of one field go with a value of another,
// e.g. Case Type "Requests" → Category "New Member", Category → Sub Category.
export default function Dependencies() {
  const { reloadMeta } = useMeta();
  const { lists, deps } = usePicklists();
  const [form, setForm] = useState(EMPTY);
  const [newSubValue, setNewSubValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('');

  const show = (t) => {
    setToast(t);
    setTimeout(() => setToast(''), 3000);
  };

  const fields = Object.keys(lists);
  const mainFields = [...new Set([...KNOWN_RELATIONSHIPS.map((r) => r.mainField), ...fields])];
  const knownSubs = KNOWN_RELATIONSHIPS.filter((r) => r.mainField === form.mainField).map((r) => r.subField);
  const subFields = [...new Set([...knownSubs, ...fields])].filter((f) => f !== form.mainField);

  // grouped: "Main → Sub" → main value → [pairs]
  const grouped = useMemo(() => {
    const out = {};
    for (const d of deps) {
      const rel = `${d.mainField} → ${d.subField}`;
      ((out[rel] ||= {})[d.mainValue] ||= []).push(d);
    }
    return out;
  }, [deps]);
  const relKeys = [...new Set([...KNOWN_RELATIONSHIPS.map((r) => `${r.mainField} → ${r.subField}`), ...Object.keys(grouped)])];

  async function add(e) {
    e.preventDefault();
    const subValue = newSubValue.trim() || form.subValue;
    if (!form.mainField || !form.mainValue || !form.subField || !subValue) return setErr('All 4 fields are required');
    setBusy(true);
    setErr('');
    try {
      if (newSubValue.trim()) await api.post('/picklists', { field: form.subField, value: subValue }).catch((x) => { if (x.status !== 409) throw x; });
      await api.post('/dependencies', { ...form, subValue });
      await reloadMeta();
      show(`Added: ${form.mainValue} → ${subValue}`);
      setForm({ ...form, subValue: '' });
      setNewSubValue('');
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }

  async function remove(d) {
    if (!confirm(`Remove ${d.mainValue} → ${d.subValue}?`)) return;
    try {
      await api.del('/dependencies', d);
      await reloadMeta();
      show(`Removed ${d.mainValue} → ${d.subValue}`);
    } catch (x) {
      show(x.message);
    }
  }

  const match = (mainValue, list) => !filter || [mainValue, ...list.map((d) => d.subValue)].some((v) => v.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-head">
        <div>
          <h1>Dependencies</h1>
          <span className="muted">Value-to-value relationships: which categories belong to a case type, which sub-categories to a category, which customer types to a customer group.</span>
        </div>
        <input className="pk-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search values…" />
      </div>

      <section className="card">
        <h2>+ Add a dependency pair</h2>
        {err && <div className="error">{err}</div>}
        <form className="dep-form" onSubmit={add}>
          <select value={form.mainField} onChange={(e) => (setForm({ ...EMPTY, mainField: e.target.value, subField: KNOWN_RELATIONSHIPS.find((r) => r.mainField === e.target.value)?.subField || '' }), setNewSubValue(''))}>
            <option value="">— Main field —</option>
            {mainFields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select value={form.mainValue} disabled={!form.mainField} onChange={(e) => setForm({ ...form, mainValue: e.target.value })}>
            <option value="">{form.mainField ? '— Main value —' : '— Select main field first —'}</option>
            {(lists[form.mainField] || []).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select value={form.subField} disabled={!form.mainField} onChange={(e) => setForm({ ...form, subField: e.target.value, subValue: '' })}>
            <option value="">{form.mainField ? '— Sub field —' : '— Select main field first —'}</option>
            {subFields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <div className="dep-sub">
            <select value={form.subValue} disabled={!form.subField || !!newSubValue.trim()} onChange={(e) => setForm({ ...form, subValue: e.target.value })}>
              <option value="">{form.subField ? '— Sub value —' : '— Select sub field first —'}</option>
              {(lists[form.subField] || []).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <input value={newSubValue} disabled={!form.subField} onChange={(e) => setNewSubValue(e.target.value)} placeholder="…or type a new value" />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Adding…' : '+ Add'}
          </button>
        </form>
        <div className="muted small">A new value typed here is added to the sub field's picklist too.</div>
      </section>

      {relKeys.map((rel) => {
        const entries = Object.entries(grouped[rel] || {}).filter(([mv, list]) => match(mv, list));
        return (
          <section key={rel} className="dep-block">
            <h2 className="dep-title">
              {rel} <span className="muted small">{Object.keys(grouped[rel] || {}).length} values</span>
            </h2>
            <div className="pk-grid">
              {entries.length === 0 && <div className="card muted small">{filter ? 'No matches' : `No pairs yet for ${rel}`}</div>}
              {entries.map(([mainValue, list]) => (
                <div key={mainValue} className="card pk-card">
                  <h3>{mainValue}</h3>
                  <div className="pk-chips">
                    {list.map((d) => (
                      <span key={d.subValue} className={`pk-chip ${d.base ? '' : 'added'}`} title={d.base ? 'From the case master' : `Added by ${d.by} · ${fmtDate(d.at)}`}>
                        {d.subValue}
                        {!d.base && (
                          <button type="button" onClick={() => remove(d)} aria-label={`Remove ${d.subValue}`}>
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
