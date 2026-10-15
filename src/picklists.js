// Picklists and dependencies (as in the PSRI CRM): every dropdown's values, and which
// values of one field go with a value of another (Case Type → Category → Sub Category …).
// The base lists come from src/taxonomy.js; values and pairs added from the
// Picklists / Dependencies screens are stored by the server and merged in here.
import { CALLER_TYPES, CASE_TREE, CHANNELS, CUSTOMER_GROUPS, PRODUCT_CATEGORIES, REQUEST_FOR, RESOLUTION_TYPES, SUPPLIER_TYPES } from './taxonomy.js';

const uniq = (a) => [...new Set(a.filter(Boolean))];

export const BASE_LISTS = {
  'Case Type': Object.keys(CASE_TREE),
  Category: uniq(Object.values(CASE_TREE).flatMap((cats) => Object.keys(cats))),
  'Sub Category': uniq(Object.values(CASE_TREE).flatMap((cats) => Object.values(cats).flat())),
  'Caller Type': CALLER_TYPES,
  Channel: CHANNELS,
  'Product Category': PRODUCT_CATEGORIES,
  'Customer Group': Object.keys(CUSTOMER_GROUPS),
  'Customer Type': uniq(Object.values(CUSTOMER_GROUPS).flat()),
  'Request For': REQUEST_FOR,
  'Supplier Type': SUPPLIER_TYPES,
  'Resolution Type': RESOLUTION_TYPES,
};

// Relationships the forms use. New pairs can be added for any of them.
export const KNOWN_RELATIONSHIPS = [
  { mainField: 'Case Type', subField: 'Category' },
  { mainField: 'Category', subField: 'Sub Category' },
  { mainField: 'Customer Group', subField: 'Customer Type' },
];

const pair = (mainField, mainValue, subField, subValue) => ({ mainField, mainValue, subField, subValue, base: true });

export const BASE_DEPENDENCIES = [
  ...Object.entries(CASE_TREE).flatMap(([type, cats]) => Object.keys(cats).map((cat) => pair('Case Type', type, 'Category', cat))),
  ...Object.values(CASE_TREE).flatMap((cats) => Object.entries(cats).flatMap(([cat, subs]) => subs.map((s) => pair('Category', cat, 'Sub Category', s)))),
  ...Object.entries(CUSTOMER_GROUPS).flatMap(([g, types]) => types.map((t) => pair('Customer Group', g, 'Customer Type', t))),
];

export const sameValue = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** All lists: base values first, then added ones (marked in `added`). */
export function mergeLists(custom = {}) {
  const names = uniq([...Object.keys(BASE_LISTS), ...Object.keys(custom)]);
  return Object.fromEntries(names.map((n) => [n, uniq([...(BASE_LISTS[n] || []), ...(custom[n] || []).map((x) => x.value)])]));
}

export function mergeDependencies(custom = []) {
  return [...BASE_DEPENDENCIES, ...custom.map((d) => ({ ...d, base: false }))];
}

/** Values of `subField` that go with mainField = mainValue (in list order). */
export function dependentValues(lists, deps, subField, mainField, mainValue) {
  if (!mainValue) return [];
  const hits = new Set(deps.filter((d) => d.mainField === mainField && d.mainValue === mainValue && d.subField === subField).map((d) => d.subValue));
  const ordered = (lists[subField] || []).filter((v) => hits.has(v));
  return uniq([...ordered, ...hits]);
}

/** Case tree (type → category → subs) with added values and pairs merged in. */
export function caseTree(lists, deps) {
  return Object.fromEntries(
    lists['Case Type'].map((t) => [t, Object.fromEntries(dependentValues(lists, deps, 'Category', 'Case Type', t).map((c) => [c, dependentValues(lists, deps, 'Sub Category', 'Category', c)]))])
  );
}
