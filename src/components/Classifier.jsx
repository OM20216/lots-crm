import { useState } from 'react';
import { api } from '../api.js';
import { Field, Select, useMeta, usePicklists } from '../ui.jsx';

// SOP: requests from a caller who is not a registered member can only be a new membership or a new supplier registration.
export function allowedCategories(caseType, callerType, tree) {
  if (!caseType || !tree?.[caseType]) return [];
  const all = Object.keys(tree[caseType]);
  if (caseType !== 'Requests') return all;
  return callerType === 'Not registered' ? all.filter((c) => c === 'New Member' || c === 'New Supplier') : all;
}

const TYPE_HELP = {
  Inquiry: 'Request for information or clarification',
  'Issues or Complaints - NR': 'Problem, dissatisfaction or challenge faced',
  Requests: 'Formal request for a service, action or change',
};

/**
 * "+ Add" beside a dependent dropdown: adds the value to the sub field's picklist (if new)
 * and the main value → value pair, in one go (same lists as the Picklists / Dependencies screens).
 */
export function AddOption({ mainField, mainValue, subField, onAdded }) {
  const { reloadMeta } = useMeta();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!mainValue) return null;

  async function add() {
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    setBusy(true);
    setErr('');
    try {
      let saved = v;
      await api.post('/picklists', { field: subField, value: v }).catch((e) => {
        if (e.status !== 409) throw e;
        saved = e.message.match(/^"(.+)" is already/)?.[1] || v; // already in the list: just link it
      });
      await api.post('/dependencies', { mainField, mainValue, subField, subValue: saved }).catch((e) => {
        if (e.status !== 409) throw e;
      });
      await reloadMeta?.();
      onAdded?.(saved);
      setValue('');
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  if (!open)
    return (
      <button type="button" className="link-btn add-option" onClick={() => setOpen(true)} title={`Add a ${subField.toLowerCase()} under ${mainValue}`}>
        + Add
      </button>
    );
  return (
    <div className="add-option-box">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), add());
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={`New ${subField.toLowerCase()} for ${mainValue}`}
      />
      <button type="button" className="btn sm primary" onClick={add} disabled={busy || !value.trim()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" className="btn sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {err && <div className="error small">{err}</div>}
    </div>
  );
}

// Case type → category → sub-category, plus store / product / order ref. Shared by call logging and email categorisation.
export default function Classifier({ value, onChange }) {
  const { stores } = useMeta();
  const { tree, list } = usePicklists();
  const set = (patch) => onChange({ ...value, ...patch });
  const cats = allowedCategories(value.caseType, value.callerType, tree);
  const subs = value.caseType && value.category ? tree[value.caseType]?.[value.category] || [] : [];

  function pickType(t) {
    const allowed = allowedCategories(t, value.callerType, tree);
    set({ caseType: t, category: allowed.length === 1 ? allowed[0] : '', subCategory: '' });
  }

  return (
    <>
      <div className="field wide">
        <span className="field-label">Case type *</span>
        <div className="type-cards">
          {Object.keys(tree).map((t) => (
            <button type="button" key={t} className={`type-card type-${t.split(' ')[0].toLowerCase()} ${value.caseType === t ? 'on' : ''}`} onClick={() => pickType(t)}>
              <strong>{t}</strong>
              <span>{TYPE_HELP[t] || ''}</span>
            </button>
          ))}
        </div>
        {value.caseType === 'Requests' && value.callerType === 'Not registered' && (
          <span className="hint">SOP: a caller who is not a registered member can only request a new membership (New Member) or a new supplier registration (New Supplier).</span>
        )}
      </div>
      <div className="field">
        <span className="field-label">
          Category * <AddOption mainField="Case Type" mainValue={value.caseType} subField="Category" onAdded={(v) => set({ category: v, subCategory: '' })} />
        </span>
        <Select value={value.category} options={cats} onChange={(v) => set({ category: v, subCategory: '' })} disabled={!value.caseType} />
      </div>
      <div className="field">
        <span className="field-label">
          Sub-category <AddOption mainField="Category" mainValue={value.category} subField="Sub Category" onAdded={(v) => set({ subCategory: v })} />
        </span>
        <Select value={value.subCategory} options={subs} onChange={(v) => set({ subCategory: v })} disabled={!value.category || !subs.length} placeholder={value.category && !subs.length ? 'None for this category' : 'Select…'} />
      </div>
      <Field label="Store">
        <Select value={value.store} options={stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short} – ${s.name}` }))} onChange={(v) => set({ store: v })} />
      </Field>
      <Field label="Product category">
        <Select value={value.productCategory} options={list('Product Category')} onChange={(v) => set({ productCategory: v })} />
      </Field>
      <Field label="Invoice / order no.">
        <input value={value.orderRef || ''} onChange={(e) => set({ orderRef: e.target.value })} placeholder="Bill no., app order ID, BDA order…" />
      </Field>
    </>
  );
}
