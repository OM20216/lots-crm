// Vtiger Cases → CRM cases. Used by the server's cases import (server/vtigerCases.js).
//
// The CRM's statuses drive automation: a Waiting case older than 48 h emails the customer, and an Escalated case
// emails the store / team. A historical Vtiger case must never start those emails, so imported cases are only
// Pending, Resolved or Closed. Only cases Vtiger still calls Open are open work; everything else is the archive.
// The raw Vtiger statuses stay on the case (`source`) and on its timeline.
import { CALLER_TYPES, CALL_TYPE_OF_CHANNEL, CASE_TREE, PRODUCT_CATEGORIES, PRODUCT_TYPES, REQUEST_FOR, RESOLUTION_TYPES, SUB2_TREE, SUPPLIER_TYPES } from './taxonomy.js';

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// ---------- names as in the CRM ----------
const CASE_TYPES = ['Inquiry', 'Issues or Complaint', 'Issues and Complaint (NR)', 'Request', 'Not Relevent or Spam'];
const CASE_TYPE_ALIASES = {
  inquiry: 'Inquiry',
  issuesorcomplaints: 'Issues or Complaint',
  issuesorcomplaint: 'Issues or Complaint',
  issuesorcomplaintsnr: 'Issues and Complaint (NR)',
  issuesandcomplaintnr: 'Issues and Complaint (NR)',
  request: 'Request',
  requests: 'Request',
  notrelevantorspam: 'Not Relevent or Spam',
  notreleventorspam: 'Not Relevent or Spam',
};

const categories = new Map(); // normalized name → the CRM's name
export const categoryOwner = new Map(); // the CRM's category → its case type
for (const [type, cats] of Object.entries(CASE_TREE))
  for (const cat of Object.keys(cats)) {
    if (!categories.has(norm(cat))) categories.set(norm(cat), cat);
    if (!categoryOwner.has(cat)) categoryOwner.set(cat, type);
  }

const CATEGORY_ALIASES = {
  ecommercerelated: 'E-Comm Related',
  storerelated: 'Store related',
  membershiprelatednr: 'Member related -NR',
  membershiprelatedrequest: 'Membership related Request',
  storerelatedrequest: 'Store related Request',
  ecommercerelatedrequest: 'E Commerce Related Request',
  bdarelated: 'BDA related',
  bdarelatedrequests: 'BDA Related REQUESTS',
  apprelatedrequests: 'App Related Request',
  marketingrelated: 'Marketing related',
  membershiprelated: 'Membership Related',
};

// Vtiger's sub-category names that differ from the case master's (the rest match once punctuation and case are ignored).
const SUB_ALIASES = {
  behaviorofstaff: 'Behaviour of staff',
  stockavailability: 'Stock availablity',
  aboutlots: 'About Store',
  pricingandproductsinquiry: 'Pricing and product Inquiry',
  modeofpayments: 'Mode of Payment',
  offersandscheme: 'Offers & Schemes',
  ecomquery: 'Ecomm query',
  newmemberrequest: 'New Member request',
  newvendorsupplierrequest: 'New Vendor- Supplier Request',
  membershipcardrelated: 'Membership card Related',
  rudebehavior: 'rude behaviour',
  reissueinvoice: 'Re-issue of invoive',
  reissuingofinvoice: 'Re-issue of invoive',
  // App rows in Vtiger carry the "App " prefix; the case master's App categories do not
  apptechnicalissuesandpricingissue: 'Technical issues and Pricing Issue',
  appaccountprofilerelated: 'Account/ Profile Related',
  apporderrelated: 'Order Related',
  apppricingrelated: 'Pricing Related',
  apppaymentrefundrelated: 'Payment & Refund Related',
  appinvoicerelated: 'Invoice Related',
  appoffersandscheme: 'Offers and scheme',
  appproductrelated: 'Product related',
  appproductqualityrelated: 'Product Quality Related',
  apprelatedothers: 'Others',
  appcontentissues: 'Content issues',
  apporderdeliveryrelatedorderstatusnotdispatched: 'Order-Delivery Related (order status not dispatched)',
  apporderdeliveryrelatedorderstatusdispatched: 'Order-Delivery Related (order status dispatched)',
  appaccountprofilerelatedrequest: 'Account/profile related Request',
  appcancellationrefundrelatedrequest: 'Cancellation & Refund related request',
  apppricingrelatedrequest: 'Pricing related - Request',
  apporderstatusinquiryrequest: 'Order status inquiry Request',
  apprelatedothersrequest: 'Others',
  // Vtiger writes the website delivery rows slightly differently
  websiteorderdeliveryrelatedorderstatusnotdispatched: 'Website Order-Delivery Related (order status not dispatched)',
  websiteorderdeliveryrelatedorderstatusdispatched: 'Website Order-Delivery Related (order status dispatched)',
};

const STORE_CODES = { 'not specific': 'NS' }; // the case master's "Not Specific"
const PRODUCT_CATEGORY_ALIASES = { fmcgfood: 'FMCG – Food', fmcgnonfood: 'FMCG – Non food', nonfood: 'Non food' };

const RESOLUTION_ALIASES = {
  informationprovided: 'Information Provided',
  answerreceived: 'Answer Received',
  clarityrequiredfromlots: 'Clarity required from LOTS',
  escalatedandautoclosed: 'Escalated and Auto Closed',
  escalatedtolots: 'Escalated to LOTS',
};

/** The CRM's name for a raw Vtiger value, only when it is one of `list`; otherwise ''. */
function pick(raw, list) {
  const n = norm(raw);
  if (!n || n === 'na' || n === '-') return '';
  return list.find((x) => norm(x) === n) || '';
}
function pickCategory(raw) {
  const n = norm(raw);
  if (!n || n === 'na') return '';
  return CATEGORY_ALIASES[n] || categories.get(n) || '';
}
function pickCaseType(raw) {
  const n = norm(raw);
  return n ? CASE_TYPE_ALIASES[n] || CASE_TYPES.find((x) => norm(x) === n) || '' : '';
}
function pickSub(raw, allowed) {
  const n = norm(raw);
  if (!n || n === 'na') return '';
  const target = norm(SUB_ALIASES[n] || raw);
  return allowed.find((x) => norm(x) === target) || '';
}
function pickSub2(raw, subCategory) {
  const n = norm(raw);
  if (!n || n === 'na' || n === '-') return '';
  const allowed = SUB2_TREE[subCategory] || [];
  const target = norm(SUB_ALIASES[n] || raw);
  return allowed.find((x) => norm(x) === target) || '';
}
function pickSupplier(raw) {
  const n = norm(raw);
  return n && n !== 'na' ? SUPPLIER_TYPES.find((x) => norm(x) === n) || '' : '';
}

/** Phone / email / ECommerce → the CRM channel; the Vtiger call type says which kind of call it was. */
function pickChannel(rawChannel, rawCallType) {
  const c = norm(rawChannel);
  const ct = norm(rawCallType);
  if (c === 'email' || c === 'ecommerce') return 'Email';
  if (ct === 'obonmissed') return 'Missed call callback';
  if (ct === 'othercampaigncall' || ct === 'outbound') return 'Outbound call';
  return 'Inbound call';
}

/** Vtiger case status + case status → a CRM status that does not trigger automation. */
export function crmStatus(rawStatus, rawCaseStatus) {
  const s = norm(rawStatus);
  const cs = norm(rawCaseStatus);
  // Only a case Vtiger still calls Open is open work here. Vtiger's "Case Status" stays blank on tens of thousands of
  // old records that were never formally closed; bringing those in as Pending would fill the inbox and dashboard
  // with years-old cases. They are imported as Closed (the raw status stays on the case and its timeline).
  if (cs !== 'open') return 'Closed';
  return s === 'resolved' ? 'Resolved' : 'Pending'; // resolved but not closed in Vtiger: awaiting the customer
}

/** Vtiger datetime (UTC, "2018-03-15 10:46:34") → ISO. */
function iso(v) {
  let s = clean(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString();
}
const day = (v) => {
  const s = iso(v);
  return s ? s.slice(0, 10) : '';
};

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' };
/** HTML from Vtiger → plain text, capped so lakhs of cases stay small in memory. */
function text(v, max) {
  let s = String(v ?? '');
  if (!s) return '';
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/**
 * One raw Vtiger case → a CRM case. `memberOf(vtigerContactId)` links it to an imported contact;
 * `ownerOf(userId)` gives the Vtiger owner's name.
 */
export function toCase(r, { stores = [], memberOf, ownerOf } = {}) {
  const contact = (r.contact_id && memberOf && memberOf(r.contact_id)) || null;
  const contactId = clean(r.contact_id);
  const ownerId = clean(r.assigned_user_id);

  const rawType = clean(r.impact_type);
  const rawCategory = clean(r.cf_cases_querytype);
  const rawSub1 = clean(r.cf_cases_issues);
  const rawSub2 = clean(r.cf_cases_issuesubtype);
  const rawSupplier = clean(r.cf_cases_typeofsupplier);
  const rawResolutionType = clean(r.resolution_type);
  const rawStatus = clean(r.casestatus);
  const rawCaseStatus = clean(r.cf_cases_casestatus);

  let category = pickCategory(rawCategory);
  const owner = category ? categoryOwner.get(category) : '';
  let caseType = pickCaseType(rawType);
  if (owner && caseType !== 'Not Relevent or Spam') caseType = owner;
  if (!caseType && category) caseType = categoryOwner.get(category) || '';

  const allowedSubs = (caseType && category && CASE_TREE[caseType]?.[category]) || [];
  const subCategory = pickSub(rawSub1, allowedSubs);
  const sub2 = category === 'New Supplier' ? pickSupplier(rawSupplier) : pickSub2(rawSub2, subCategory);

  const status = crmStatus(rawStatus, rawCaseStatus);
  const createdAt = iso(r.createdtime) || iso(r.modifiedtime);
  const modifiedAt = iso(r.modifiedtime) || createdAt;
  const updatedAt = modifiedAt && modifiedAt < createdAt ? createdAt : modifiedAt;
  const caseNo = clean(r.case_no);

  const subject = clean(r.title) || (caseNo ? `Vtiger case ${caseNo}` : 'Vtiger case');
  const description = text([r.description, r.cf_cases_complaintdetails].filter(Boolean).join('\n\n'), 4000);
  const resolution = text(r.resolution, 6000);

  const storeRaw = clean(r.cf_cases_storename);
  let store = STORE_CODES[storeRaw.toLowerCase()] || '';
  if (!store && storeRaw) {
    const n = norm(storeRaw);
    const hit = stores.find((x) => norm(x.short) === n || norm(x.name) === n || n.startsWith(norm(x.short)));
    store = hit?.code || '';
  }
  if (!store && contact?.homeStore) store = contact.homeStore; // the case names no store: the contact's own store

  const callerRaw = clean(r.cf_cases_customerstatus);
  const callerType = CALLER_TYPES.find((x) => norm(x) === norm(callerRaw)) || '';
  const channel = pickChannel(r.casechannel, r.cf_cases_calltype);
  const productCategory = PRODUCT_CATEGORIES.find((x) => norm(x) === norm(PRODUCT_CATEGORY_ALIASES[norm(r.cf_cases_productcategory)] || r.cf_cases_productcategory)) || '';
  const productType = (PRODUCT_TYPES[productCategory] || []).find((x) => norm(x) === norm(r.cf_cases_producttype)) || '';

  const source = { system: 'Vtiger' };
  const src = {
    vtigerId: clean(r.id),
    caseNo,
    status: rawStatus,
    caseStatus: rawCaseStatus,
    caseType: rawType,
    category: rawCategory,
    sub1: rawSub1,
    sub2: rawSub2,
    supplierType: rawSupplier,
    resolutionType: rawResolutionType,
    priority: clean(r.casepriority),
    productCategory: clean(r.cf_cases_productcategory),
    productType: clean(r.cf_cases_producttype),
    requestFor: clean(r.cf_cases_requestfor),
    contactId,
    ownerId,
    ownerName: ownerOf?.(ownerId) || '',
  };
  for (const [k, v] of Object.entries(src)) if (v) source[k] = v;

  const c = {
    createdAt,
    updatedAt,
    channel,
    callType: CALL_TYPE_OF_CHANNEL[channel] || '',
    callerType,
    memberId: contact?.id || '',
    name: contact?.ownerName || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    businessName: contact?.businessName || '',
    cardNo: contact?.cardNo || '',
    store,
    caseType,
    category,
    subCategory,
    requestFor: pick(r.cf_cases_requestfor, REQUEST_FOR),
    sub2,
    closureType: RESOLUTION_ALIASES[norm(rawResolutionType)] || pick(rawResolutionType, RESOLUTION_TYPES),
    productCategory,
    productType,
    orderRef: clean(r.cf_cases_orderid) || clean(r.cf_cases_invoicenumber) || clean(r.cf_cases_deliveryorderid),
    purchaseDate: day(r.cf_cases_dateofpurchaseororder),
    purchaseAmount: clean(r.cf_cases_purchaseamount),
    refundAmount: clean(r.cf_cases_amounttoberefunded),
    subject,
    description,
    resolution,
    status,
    statusAt: status === 'Pending' ? createdAt : updatedAt,
    closedAt: status === 'Closed' ? updatedAt : '',
    escalatedAt: null,
    escalationLevel: 0,
    dueAt: null,
    assignedTo: '',
    createdBy: 'Vtiger import',
    source,
    timeline: [{ at: createdAt, by: 'Vtiger import', type: 'created', text: `Imported from Vtiger${caseNo ? ` (${caseNo})` : ''}${rawStatus ? ` · ${rawStatus}` : ''}` }],
    vtigerId: clean(r.id),
    vtigerCaseNo: caseNo,
  };
  // lakhs of cases: keep only what has a value (the same reason the contacts import trims its fields)
  for (const k of Object.keys(c)) if (c[k] === '' || c[k] == null || (Array.isArray(c[k]) && !c[k].length)) delete c[k];
  return c;
}
