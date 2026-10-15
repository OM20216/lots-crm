import { useState } from 'react';
import { api } from '../api.js';
import { Field, Select, useMeta, usePicklists } from '../ui.jsx';
import { CASE_MASTER } from '../taxonomy.js';

// Case master: every type of contact (Not Registered / Registered With Lots / Others) gets the same categories.
export function allowedCategories(caseType, callerType, tree) {
  if (!caseType || !tree?.[caseType]) return [];
  return Object.keys(tree[caseType]);
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
        + Add new {subField.toLowerCase()}
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
  const { tree, list, dependents } = usePicklists();
  const set = (patch) => onChange({ ...value, ...patch });
  // case master columns that depend on the category: request for, sub-category 2, resolution type
  const masterFor = (category) => ({
    requestFor: dependents('Request For', 'Category', category),
    sub2: dependents('Sub Category 2', 'Category', category),
    resolution: dependents('Resolution Type', 'Category', category),
  });
  const m = masterFor(value.category);
  const single = (arr) => (arr.length === 1 ? arr[0] : '');
  const pickCategory = (category) => {
    const n = masterFor(category);
    set({ category, subCategory: '', requestFor: single(n.requestFor), sub2: '', closureType: single(n.resolution) });
  };
  const invoiceRequired = Boolean(CASE_MASTER[value.category]?.invoiceRequired);
  const cats = allowedCategories(value.caseType, value.callerType, tree);
  const subs = value.caseType && value.category ? tree[value.caseType]?.[value.category] || [] : [];

  function pickType(t) {
    const allowed = allowedCategories(t, value.callerType, tree);
    const category = allowed.length === 1 ? allowed[0] : '';
    const n = masterFor(category);
    set({ caseType: t, category, subCategory: '', requestFor: single(n.requestFor), sub2: '', closureType: single(n.resolution) });
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
      </div>
      <div className="field">
        <span className="field-label">Category *</span>
        <Select value={value.category} options={cats} onChange={pickCategory} disabled={!value.caseType} />
        <AddOption mainField="Case Type" mainValue={value.caseType} subField="Category" onAdded={pickCategory} />
      </div>
      <div className="field">
        <span className="field-label">Sub-category</span>
        <Select value={value.subCategory} options={subs} onChange={(v) => set({ subCategory: v })} disabled={!value.category || !subs.length} placeholder={value.category && !subs.length ? 'None for this category' : 'Select…'} />
        <AddOption mainField="Category" mainValue={value.category} subField="Sub Category" onAdded={(v) => set({ subCategory: v })} />
      </div>
      {/* a single option is filled in by itself, so it isn't shown */}
      {m.requestFor.length > 1 && (
        <Field label="Request for">
          <Select value={value.requestFor} options={m.requestFor} onChange={(v) => set({ requestFor: v })} />
        </Field>
      )}
      {m.sub2.length > 0 && (
        <div className="field">
          <span className="field-label">Sub-category 2</span>
          <Select value={value.sub2} options={m.sub2} onChange={(v) => set({ sub2: v })} />
          <AddOption mainField="Category" mainValue={value.category} subField="Sub Category 2" onAdded={(v) => set({ sub2: v })} />
        </div>
      )}
      <Field label="Store">
        <Select value={value.store} options={[...stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short} – ${s.name}` })), { value: 'NS', label: 'Not Specific' }]} onChange={(v) => set({ store: v })} />
      </Field>
      <Field label={invoiceRequired ? 'Invoice / order no. *' : 'Invoice / order no.'} hint={invoiceRequired ? 'Needed for this category' : undefined}>
        <input value={value.orderRef || ''} onChange={(e) => set({ orderRef: e.target.value })} placeholder="Bill no., app order ID, BDA order…" />
      </Field>
      <details className="field wide more-fields" open={Boolean(value.productCategory || (m.resolution.length > 1 && value.closureType))}>
        <summary>More details (product, resolution type)</summary>
        <div className="grid">
          <Field label="Product category">
            <Select value={value.productCategory} options={list('Product Category')} onChange={(v) => set({ productCategory: v, productType: '' })} />
          </Field>
          <Field label="Product type">
            <Select value={value.productType} options={dependents('Product Type', 'Product Category', value.productCategory)} onChange={(v) => set({ productType: v })} disabled={!value.productCategory} />
          </Field>
          {m.resolution.length > 1 && (
            <Field label="Resolution type">
              <Select value={value.closureType} options={m.resolution} onChange={(v) => set({ closureType: v })} />
            </Field>
          )}
        </div>
      </details>
    </>
  );
}
