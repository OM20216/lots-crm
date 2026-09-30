import { CASE_TREE, PRODUCT_CATEGORIES } from '../taxonomy.js';
import { Field, Select, useMeta } from '../ui.jsx';

// SOP: requests from a caller who is not a registered member can only be a new membership or a new supplier registration.
export function allowedCategories(caseType, callerType) {
  if (!caseType) return [];
  const all = Object.keys(CASE_TREE[caseType]);
  if (caseType !== 'Request') return all;
  return callerType === 'Registered member' ? all.filter((c) => c !== 'Not registered member') : callerType === 'Not registered' ? ['Not registered member'] : all;
}

const TYPE_HELP = {
  Enquiry: 'Request for information or clarification',
  'Issue & Complaint': 'Problem, dissatisfaction or challenge faced',
  Request: 'Formal request for a service, action or change',
};

// Case type → category → sub-category, plus store / product / order ref. Shared by call logging and email categorisation.
export default function Classifier({ value, onChange }) {
  const { stores } = useMeta();
  const set = (patch) => onChange({ ...value, ...patch });
  const cats = allowedCategories(value.caseType, value.callerType);
  const subs = value.caseType && value.category ? CASE_TREE[value.caseType][value.category] || [] : [];

  function pickType(t) {
    const allowed = allowedCategories(t, value.callerType);
    set({ caseType: t, category: allowed.length === 1 ? allowed[0] : '', subCategory: '' });
  }

  return (
    <>
      <div className="field wide">
        <span className="field-label">Case type *</span>
        <div className="type-cards">
          {Object.keys(CASE_TREE).map((t) => (
            <button type="button" key={t} className={`type-card type-${t.split(' ')[0].toLowerCase()} ${value.caseType === t ? 'on' : ''}`} onClick={() => pickType(t)}>
              <strong>{t}</strong>
              <span>{TYPE_HELP[t]}</span>
            </button>
          ))}
        </div>
        {value.caseType === 'Request' && value.callerType === 'Not registered' && (
          <span className="hint">SOP: a caller who is not a registered member can only request a new membership or a new supplier registration.</span>
        )}
      </div>
      <Field label="Category *">
        <Select value={value.category} options={cats} onChange={(v) => set({ category: v, subCategory: '' })} disabled={!value.caseType} />
      </Field>
      <Field label="Sub-category *">
        <Select value={value.subCategory} options={subs} onChange={(v) => set({ subCategory: v })} disabled={!value.category} />
      </Field>
      <Field label="Store">
        <Select value={value.store} options={stores.map((s) => ({ value: s.code, label: `${s.code} ${s.short} – ${s.name}` }))} onChange={(v) => set({ store: v })} />
      </Field>
      <Field label="Product category">
        <Select value={value.productCategory} options={PRODUCT_CATEGORIES} onChange={(v) => set({ productCategory: v })} />
      </Field>
      <Field label="Invoice / order no.">
        <input value={value.orderRef || ''} onChange={(e) => set({ orderRef: e.target.value })} placeholder="Bill no., app order ID, BDA order…" />
      </Field>
    </>
  );
}
