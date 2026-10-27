// Vtiger Contacts → CRM contacts. Used by Contacts → Import CSV (a Vtiger export) and by the server's Vtiger import
// (the API returns the same fields under the same labels).
import { EMPTY, SECTIONS, toMember } from './contactFields.js';

export const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// a mobile as in Vtiger ("+919876543210", "+91 98765 43210", "?????") → 10 digits, or '' when it isn't a number
export const mobile = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

// Vtiger Contacts export: the CRM's contact form has the same fields with the same names, so each row becomes a full
// contact (every Vtiger field shows when the contact is opened). Only the columns below have other names.
export const isVtiger = (headers) => headers.includes('contact id') && headers.includes('first name') && headers.includes('last name');
/** Any CSV laid out like the contact form (Vtiger's field names): First / Last Name, or 5+ columns named like form fields. */
export function isContactForm(headers) {
  if (isVtiger(headers) || (headers.includes('first name') && headers.includes('last name'))) return true;
  const labels = new Set(SECTIONS.flatMap((s) => s.fields.map((f) => norm(f.label))));
  return headers.filter((h) => labels.has(h) || VTIGER_SPECIAL.includes(h) || VTIGER_EXTRA[h]).length >= 5;
}

/** Rows that are the same contact twice in one file (same Vtiger contact, card no., or — without a card no. — mobile) are merged:
 *  the first row is kept and a later one only fills in its empty fields. Returns the unique contacts and how many rows were repeats. */
export function mergeRepeats(members) {
  const out = [];
  const seen = new Map();
  const card = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mob = (v) => String(v || '').replace(/\D/g, '').slice(-10);
  let repeats = 0;
  for (const m of members) {
    const keys = [m.vtigerId && 'v' + m.vtigerId, card(m.cardNo) && 'c' + card(m.cardNo), !card(m.cardNo) && mob(m.phone).length === 10 && 'p' + mob(m.phone)].filter(Boolean);
    const same = keys.map((k) => seen.get(k)).find(Boolean);
    if (same) {
      repeats++;
      // the first row is kept; a repeat only fills in what is still empty (it never overwrites, e.g. another person's mobile)
      const empty = (v) => v === '' || v == null || (Array.isArray(v) && !v.length);
      for (const [k, v] of Object.entries(m)) if (!empty(v) && empty(same[k])) same[k] = v;
    } else {
      const copy = { ...m };
      out.push(copy);
      keys.forEach((k) => seen.set(k, copy));
    }
  }
  return { members: out, repeats };
}
const VTIGER_EXTRA = {
  'membership id': 'cardNo',
  'business gsti number': 'gstNumber',
  'type of customer segment1': 'segment1',
  'type of business segment2': 'segment2',
  'contact id': 'vtigerId',
};
const VTIGER_SPECIAL = ['mobile', 'updated contact mobile number', 'primary email', 'updated contact email id', 'addon firstname', 'addon lastname', 'addon relationship with company', 'addon landline', 'addon mobile', 'addon dob'];

export function vtigerRows(rows, stores) {
  const headers = rows[0].map(norm);
  const byLabel = {};
  for (const sec of SECTIONS) for (const fl of sec.fields) if (!['emails', 'phones', 'addons'].includes(fl.type)) byLabel[norm(fl.label)] = fl;
  const at = (r, name) => {
    const i = headers.indexOf(name);
    return i >= 0 ? String(r[i] || '').trim() : '';
  };
  const used = new Set(VTIGER_SPECIAL.filter((h) => headers.includes(h)));
  const mapped = headers.map((h) => {
    const key = VTIGER_EXTRA[h] || byLabel[h]?.key;
    if (key) used.add(h);
    return key;
  });
  const members = rows.slice(1).map((r) => {
    const v = { ...EMPTY, emails: [], phones: [], addons: [] };
    mapped.forEach((key, i) => {
      if (!key) return;
      const val = String(r[i] || '').trim();
      v[key] = byLabel[headers[i]]?.type === 'checkbox' ? /^(yes|1|true)$/i.test(val) : val;
    });
    // the updated mobile / email (Vtiger's "Mobile Number Updation") is the current one; the old one is kept as the next number
    const phones = [...new Set([mobile(at(r, 'updated contact mobile number')), mobile(at(r, 'mobile'))].filter(Boolean))];
    v.phones = phones.map((number) => ({ type: 'Mobile', number }));
    const emails = [...new Set([at(r, 'updated contact email id'), at(r, 'primary email')].filter(Boolean))];
    v.emails = emails.map((address, i) => ({ type: i ? 'Other' : 'Primary', address }));
    const addon = { firstName: at(r, 'addon firstname'), lastName: at(r, 'addon lastname'), relationship: at(r, 'addon relationship with company'), mobile: mobile(at(r, 'addon mobile')), landline: at(r, 'addon landline'), dob: at(r, 'addon dob'), cardNo: '' };
    if (addon.firstName || addon.mobile) v.addons = [addon];
    const m = toMember(v, stores);
    // Vtiger fills Segment1 / Segment2; the form's group / type come from Segment3 / Segment4
    m.customerGroup = m.customerGroup || v.segment1 || '';
    m.customerType = m.customerType || v.segment2 || '';
    m.vtigerId = v.vtigerId;
    // keep only the fields that have a value (lakhs of contacts × 68 mostly empty fields would fill the server's memory);
    // the contact form puts the blanks and defaults back when it is opened
    m.contact = Object.fromEntries(Object.entries(m.contact).filter(([k, x]) => x !== '' && x !== false && x != null && !(Array.isArray(x) && !x.length) && x !== EMPTY[k]));
    return m;
  });
  return { members, map: [...used], unused: rows[0].filter((_, i) => !used.has(headers[i])) };
}
