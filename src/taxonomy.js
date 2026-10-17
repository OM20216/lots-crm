// Case taxonomy, aligned to LOTS's case master "lot cases excel.xlsx"
// (every possible case: case_type → case_category → sub-categories, plus the
// request / resolution / channel dimensions that file lists).
// The SOP ("Lots Process Documents 2026") still drives the workflow rules
// (src/workflows.js) and the answers / templates (src/knowledge.js).

export const CHANNELS = ['Inbound call', 'Outbound call', 'Missed call callback', 'Email'];

// Case master `type_of_contact`. "Others" = callers who are neither (e.g. B2C walk-in customers at AKD / NSP).
export const CALLER_TYPES = ['Registered With Lots', 'Not Registered', 'Others'];
// names used before 15 Oct 2026 → case master names
export const CALLER_TYPE_ALIASES = { 'Registered member': 'Registered With Lots', 'Not registered': 'Not Registered', 'B2C customer': 'Others' };
export const normalizeCallerType = (v) => CALLER_TYPE_ALIASES[v] || v;

export const STATUSES = ['Pending', 'Waiting', 'Escalated', 'Resolved', 'Closed'];

export const STATUS_HELP = {
  Pending: 'Received, not yet addressed',
  Waiting: 'Missing info requested from customer',
  Escalated: 'With the store / team · L1 TAT 1 working day',
  Resolved: 'Store / team replied · confirm with customer',
  Closed: 'Customer confirmed / resolved on call',
};

// ---------- dimensions from the case master ----------

// Excel `request_for`
export const REQUEST_FOR = ['New Member - Customer', 'New Vendor - Supplier', 'Re-issuing of Lost Card'];

// Excel `sub2` for New Supplier; the last two are rows of the HO escalation matrix (April 2026 V_6), added 17 Oct 2026
export const SUPPLIER_TYPES = ['Suppliers - Fresh', 'Suppliers - FMCG - Food', 'Suppliers - FMCG - Commodities', 'Suppliers - Non Food', 'Suppliers - FMCG - Non Food', 'Suppliers - D&F'];

// Excel `resolution_type`
export const RESOLUTION_TYPES = ['Answer Received', 'Clarity required from LOTS', 'Escalated and Auto Closed', 'Escalated to LOTS', 'Information Provided'];

export const CALL_TYPES = ['Inbound'];

// ---------- the case master ----------
// LOTS's "Case catergory" sheet in the escalation workbook (Escalation Matrix LOTS, store tabs; adopted 17 Oct 2026,
// replaces the older "lot cases excel"): type of contact → case type → case category → sub-1 → sub-2, names as written there.
// Case fields: caseType, category, subCategory (= sub-1), sub2 (= sub-2; for New Supplier: the supplier type).
export const CASE_TYPE = { INQUIRY: 'Inquiry', COMPLAINT: 'Issues or Complaint', COMPLAINT_NR: 'Issues and Complaint (NR)', REQUEST: 'Request', SPAM: 'Not Relevent or Spam' };

export const CASE_TREE = {
  Inquiry: {
    Legal: [],
    'Real Estate': [],
    'HR or Jobs': [],
    'General Query': ['About Store', 'Member registration Inquiry', 'Store Branding', 'Pricing and product Inquiry', 'Mode of Payment', 'About Add on Cards', 'Delivery Inquiry', 'Offers & Schemes', 'Ecomm query', 'Supplier Registration Inquiry', 'Membership card Related'],
    'IT or Website': [],
    'Admin Related': [],
    'Marketing related': [],
    'Festive Gifting': [],
  },
  'Issues or Complaint': {
    'Store related': ['Behaviour of staff', 'Operational issues', 'Payment or invoice', 'Pricing issue', 'Delivery related', 'Quality issue', 'Return of goods', 'Stock availablity', 'Offer related', 'others'],
    'Membership Related': ['Member complaint'],
    'E-Comm Related': ['Website Technical issues and Pricing Issue', 'Website Account/ Profile Related', 'Website Order Related', 'Website Pricing Related', 'Website Payment & Refund Related', 'Website Invoice Related', 'Website Offers and scheme', 'Website Product related', 'Website Product Quality Related', 'Website related- Others', 'Website Content issues', 'Website Order-Delivery Related (order status not dispatched)', 'Website Order-Delivery Related (order status dispatched)'],
    'LOTS-App Related': ['Lots-App Technical issues and Pricing Issue', 'Lots-App Account/ Profile Related', 'Lots-App Order Related', 'Lots-App Pricing Related', 'Lots-App Payment & Refund Related', 'Lots-App Invoice Related', 'Lots-App Offers and scheme', 'Lots-App Product related', 'Lots-App Product Quality Related', 'Lots-App related- Others', 'Lots-App Content issues', 'Lots-App Order-Delivery Related (order status not dispatched)', 'Lots-App Order-Delivery Related (order status dispatched)'],
    'BDA related': ['BDA - Order Related', 'BDA - Cancellation and Invoice related', 'BDA-Product Quality Related', 'BDA-Behaviour Related', 'BDA-Pricing related', 'BDA Order-Delivery Related (order status not dispatched)', 'BDA Order-Delivery Related (order status dispatched)', 'BDA-Others'],
  },
  'Issues and Complaint (NR)': {
    'Member related -NR': ['Others (St)'],
  },
  Request: {
    'New Member': ['New Member request'],
    'New Supplier': ['New Vendor- Supplier Request'],
    'Membership related Request': ['Member request'],
    'Store related Request': ['Operational Requests', 'Payment or invoice Related Request', 'Pricing Related Request', 'Delivery related Request', 'Return of goods related Request', 'Stock availablity related Request', 'Offer related Request'],
    'E Commerce Related Request': ['Website Account/profile related Request', 'Website Cancellation & Refund related request', 'Website Pricing related - Request', 'Website Order status inquiry Request', 'Website related- Others'],
    'Lots-App Related Request': ['Lots-App Account/profile related Request', 'Lots-App Cancellation & Refund related request', 'Lots-App Pricing related - Request', 'Lots-App Order status inquiry Request', 'Lots-App related- Others'],
    'BDA Related REQUESTS': ['BDA - Order Related Requests', 'BDA - Product Return Request'],
  },
  'Not Relevent or Spam': {},
};

export const SUB2_TREE = {
  'Behaviour of staff': ['rude behaviour', 'no knowledge', 'No Support'],
  'Operational issues': ['cashtills/checkout issue', 'Signage issue', 'parking issue', 'others'],
  'Payment or invoice': ['price mismatch', 'Gst related', 'Re-issue of invoive', 'wrong product billed'],
  'Pricing issue': ['Price higher than market charged'],
  'Delivery related': ['order not complete', 'Late delivery', 'COD issues', 'rude delivery staff'],
  'Quality issue': ['Poor product quality', 'near to expired product'],
  'Return of goods': ['Good Return'],
  'Stock availablity': ['assortment', 'low stock'],
  'Offer related': ['coupon/sms offer not given', 'cashback', 'freebie not given'],
  others: ['others'],
  'Member complaint': ['member card not received', 'receiving no offer communication', 'incorrect member details on card', 'Duplicate Card', 'others'],
  'Website Technical issues and Pricing Issue': ['Site not opening', 'Pricing mismatched'],
  'Website Account/ Profile Related': ['wrong details', 'login issues', 'Otp issue', 'unable to update address'],
  'Website Order Related': ['order not complete', 'Wrong products received', 'Website Delivery Related', 'Website Order Cancellations Related', 'Website Related-Others'],
  'Website Pricing Related': ['Price higher than market/store charged'],
  'Website Payment & Refund Related': ['Payment Related complaint', 'Refund Related'],
  'Website Invoice Related': ['Invoice related', 'incorrect invoice'],
  'Website Offers and scheme': ['Online Offers and scheme'],
  'Website Product related': ['Order or Item in order cancelled without informing', 'Stock non availability'],
  'Website Product Quality Related': ['Product Quality'],
  'Website related- Others': ['Website related- Others'],
  'Website Content issues': ['page/images not clear'],
  'Website Order-Delivery Related (order status not dispatched)': ['Delayed Delivery'],
  'Website Order-Delivery Related (order status dispatched)': ['Delayed Delivery'],
  'Lots-App Technical issues and Pricing Issue': ['Site not opening', 'Pricing mismatched'],
  'Lots-App Account/ Profile Related': ['wrong details', 'login issues', 'Otp issue', 'unable to update address'],
  'Lots-App Order Related': ['order not complete', 'Wrong products received', 'Lots-App Delivery Related', 'Lots-App Order Cancellations Related', 'Lots-App Related-Others'],
  'Lots-App Pricing Related': ['Price higher than market/store charged'],
  'Lots-App Payment & Refund Related': ['Payment Related complaint', 'Refund Related'],
  'Lots-App Invoice Related': ['Invoice related', 'incorrect invoice'],
  'Lots-App Offers and scheme': ['Online Offers and scheme'],
  'Lots-App Product related': ['Order or Item in order cancelled without informing', 'Stock non availability'],
  'Lots-App Product Quality Related': ['Product Quality'],
  'Lots-App related- Others': ['Lots-App related- Others'],
  'Lots-App Content issues': ['page/images not clear'],
  'Lots-App Order-Delivery Related (order status not dispatched)': ['Delayed Delivery'],
  'Lots-App Order-Delivery Related (order status dispatched)': ['Delayed Delivery'],
  'BDA - Order Related': ['BDA-Incomplete Order', 'BDA-delayed delivery', 'BDA-Order Cancelled', 'BDA - Order Cancelled without communication', 'BDA-Complaint about order'],
  'BDA - Cancellation and Invoice related': ['BDA-incorrect invoice'],
  'BDA-Product Quality Related': ['BDA - Product Quality'],
  'BDA-Behaviour Related': ['BDA - Rude Behaviour'],
  'BDA-Pricing related': ['BDA - Prices are higher than Market/Store'],
  'BDA Order-Delivery Related (order status not dispatched)': ['Delayed Delivery'],
  'BDA Order-Delivery Related (order status dispatched)': ['Delayed Delivery'],
  'BDA-Others': ['BDA - Others'],
  'Member request': ['Request for Add on card', 'Request related to Membership data', 'Request related to Membership card'],
  'Operational Requests': ['Support Request'],
  'Payment or invoice Related Request': ['Gst related', 're-issue invoive'],
  'Pricing Related Request': ['Price higher than market'],
  'Delivery related Request': ['Delivery Time', 'Delivery Status'],
  'Return of goods related Request': ['Request to return/ Exchange'],
  'Stock availablity related Request': ['Request to increase Assortment', 'Request to increase Stock'],
  'Offer related Request': ['Request related to Offers'],
  'Website Account/profile related Request': ['Login support', 'Address updation', 'Change in Profile details'],
  'Website Cancellation & Refund related request': ['Request to cancel order', 'Request for Return', 'Request for Refund'],
  'Website Pricing related - Request': ['Price higher than market/ store'],
  'Website Order status inquiry Request': ['Request about order status', 'Request for order delivery'],
  'Lots-App Account/profile related Request': ['Login support', 'Address updation', 'Change in Profile details'],
  'Lots-App Cancellation & Refund related request': ['Request to cancel order', 'Request for Return', 'Request for Refund'],
  'Lots-App Pricing related - Request': ['Price higher than market/ store'],
  'Lots-App Order status inquiry Request': ['Request about order status', 'Request for order delivery'],
  'BDA - Order Related Requests': ['Request to cancel order', 'Request for order status'],
  'BDA - Product Return Request': ['Request to Return products', 'Others'],
};


// Which case types (and, for Request, which categories) each type of contact has in the sheet.
export const CASE_TYPES_FOR = {
  'Not Registered': ['Inquiry', 'Issues and Complaint (NR)', 'Request'],
  'Registered With Lots': ['Inquiry', 'Issues or Complaint', 'Request'],
  Others: ['Not Relevent or Spam'],
};
const NR_REQUESTS = ['New Member', 'New Supplier'];
/** Categories of a case type for a type of contact (sheet: New Member / New Supplier only for Not Registered). */
export function categoriesFor(caseType, callerType, tree = CASE_TREE) {
  const cats = Object.keys(tree?.[caseType] || {});
  if (caseType !== 'Request' || !CASE_TYPES_FOR[callerType]) return cats;
  return cats.filter((c) => (callerType === 'Not Registered') === NR_REQUESTS.includes(c) || !Object.keys(CASE_TREE.Request).includes(c)); // added categories: everyone
}

// Every sub-2 value of the sheet
export const SUB2 = [...new Set(Object.values(SUB2_TREE).flat())];

// Names used before 17 Oct 2026 (older case master) → the sheet's. Only the 1-to-1 renames; old sub-categories stay as they were.
export const CASE_ALIASES = {
  caseType: { Requests: 'Request', 'Issues or Complaints - NR': 'Issues or Complaint' },
  category: {
    'Store Related': 'Store related',
    'ECommerce Related': 'E-Comm Related',
    'App Related': 'LOTS-App Related',
    'BDA Related': 'BDA related',
    'Membership Related - NR': 'Member related -NR',
    'Membership Related Request': 'Membership related Request',
    'Store Related Request': 'Store related Request',
    'App Related Requests': 'Lots-App Related Request',
    'Marketing Related': 'Marketing related',
  },
};
/** The case's case type / category under the sheet's names (changes nothing else). */
export function normalizeCaseNames(c) {
  const out = {};
  const t = CASE_ALIASES.caseType[c.caseType];
  const cat = CASE_ALIASES.category[c.category];
  if (t) out.caseType = t === 'Issues or Complaint' && cat === 'Member related -NR' ? 'Issues and Complaint (NR)' : t;
  if (cat) out.category = cat;
  return out;
}

// The case master's other columns, per category: request_for, sub2 (supplier type), invoice_detail_required, resolution_type.
const INQUIRY_RESOLUTION = ['Answer Received', 'Clarity required from LOTS', 'Escalated and Auto Closed'];
const REQUEST_MASTER = { requestFor: ['Re-issuing of Lost Card'], invoiceRequired: true, resolution: ['Answer Received', 'Clarity required from LOTS'] };
export const CASE_MASTER = {
  ...Object.fromEntries(Object.keys(CASE_TREE.Inquiry).map((c) => [c, { resolution: INQUIRY_RESOLUTION }])),
  'New Member': { requestFor: ['New Member - Customer'], resolution: ['Information Provided'] },
  'New Supplier': { requestFor: ['New Vendor - Supplier'], sub2: SUPPLIER_TYPES, invoiceRequired: false, resolution: ['Information Provided'] },
  ...Object.fromEntries(['Membership related Request', 'Store related Request', 'E Commerce Related Request', 'Lots-App Related Request', 'BDA Related REQUESTS'].map((c) => [c, REQUEST_MASTER])),
  ...Object.fromEntries([...Object.keys(CASE_TREE['Issues or Complaint']), ...Object.keys(CASE_TREE['Issues and Complaint (NR)'])].map((c) => [c, { resolution: ['Escalated to LOTS'] }])),
};

export const PRODUCT_CATEGORIES = ['Fresh', 'FMCG – Food', 'Commodities', 'FMCG – Non food', 'Non food'];

// Case master `product_type` under `product_category` (e.g. Fresh → Fruits); the types are the SOP's "Product Category" examples.
export const PRODUCT_TYPES = {
  Fresh: ['Fruits', 'Vegetables', 'Meat', 'Fish', 'Dairy products'],
  'FMCG – Food': ['Beverages', 'Processed food', 'Baked food', 'Packed meat', 'Packed dairy products', 'Frozen foods', 'Dry fruits'],
  Commodities: ['Grains', 'Metals', 'Flour', 'Oils'],
  'FMCG – Non food': ['Cleaning products', 'Cosmetics', 'Toiletries', 'Office supplies', 'Medicine (without prescription)'],
  'Non food': ['Household items', 'Blankets', 'Food plastic sheets', 'Buckets and containers', 'Cooking items', 'Soap', 'Pet foods', 'Cleaning supplies', 'Paper products'],
};

export const CUSTOMER_GROUPS = {
  Distributor: ['Exporter', 'FMCG Wholesaler', 'Food W/S', 'Fresh Food Wholesaler', 'Grocery Retail Shop/Stall', 'Non Food Wholesaler', 'Up Country Distributor'],
  'Food Retailer (FR)': ['Bakery/Sweet Shop', 'Fresh Food Retail Shop', 'Fruit and Vegetable Shop', 'Grocery Retail Shop/Stall', 'Kirana', 'Organised Retailer', 'Supermarket'],
  HoReCa: ['Bakery/Sweet Shop', 'Caterer', 'Quick service restaurant', 'Multi Cuisine Restaurants', 'Speciality Restaurants', 'Budget Hotel (1-3 Stars)', 'Street Food Shop', 'Online Food Services', 'Pub & Bar'],
  'Catering Business': ['Hotel', 'Hotel & Resort', 'Restaurant'],
  'Non-food Retailer (NFR)': ['Electronic appliance shop', 'Medicine Shop', 'Non Food Wholesaler', 'Stationary Shop', 'Stationery/Office supply shop'],
  'Self Employed Professionals (SEP)': ['Educational Service', 'Self Employed Professionals', 'Small and Medium Office'],
  'Service (SV)': ['Educational Institute', 'Exporter', 'Hospital', 'Institution', 'Institutional Service', 'Other Service'],
};

// SOP outbound purposes: acquisition (New registration), follow-up, communication (Festival offers),
// non-buying activation (Inactive customer), customer survey, loyalty (LCC), plus confirmation calls.
export const LEAD_TYPES = ['New registration', 'Inactive customer', 'Order on call', 'LCC (Lots Club Card)', 'Confirmation / resolution', 'Follow-up', 'Customer survey', 'Festival & seasonal offers'];

export const LEAD_OUTCOMES = ['Interested', 'Not interested', 'Call back', 'Not reachable', 'Order placed', 'Converted'];

// SOP "Follow-up – giving updates or asking for missing info". Info received moves a Waiting case back to Pending.
export const FOLLOWUP_OUTCOMES = ['Info received', 'Update given', 'Call back', 'Not reachable'];

// SOP "Customer survey – collecting feedback to improve our service".
export const SURVEY_OUTCOMES = ['Survey completed', 'Refused survey', 'Call back', 'Not reachable'];
export const SURVEY_QUESTIONS = [
  { key: 'overall', label: 'Overall, how satisfied are you with LOTS?', type: 'rating' },
  { key: 'store', label: 'Store experience (staff, billing, availability)', type: 'rating' },
  { key: 'care', label: 'How was your experience with customer care?', type: 'rating' },
  { key: 'recommend', label: 'Would you recommend LOTS to other businesses?', type: 'yesno' },
  { key: 'comments', label: 'What should we improve?', type: 'text' },
];

// Confirmation calls act on the case: confirmed → Closed, not satisfied → back to the store.
export const CONFIRMATION_OUTCOMES = ['Confirmed resolved', 'Not satisfied', 'Call back', 'Not reachable'];

/** Outcomes offered for a lead, by its type. */
export function outcomesFor(lead) {
  if (lead.type === 'Customer survey') return SURVEY_OUTCOMES;
  if (lead.type === 'Follow-up') return FOLLOWUP_OUTCOMES;
  if (lead.caseId) return CONFIRMATION_OUTCOMES;
  return LEAD_OUTCOMES;
}

export const MISSED_REASONS = ['Agent busy on another call', 'Caller hung up', 'Non-working hours'];

// Which transitions each status offers in the UI, with the action label an agent sees.
export const ACTIONS = {
  Pending: [
    { to: 'Closed', label: 'Resolved on call (ROT)', kind: 'ok' },
    { to: 'Waiting', label: 'Info missing → Waiting', kind: 'warn' },
    { to: 'Escalated', label: 'Escalate to store', kind: 'danger' },
  ],
  Waiting: [{ to: 'Pending', label: 'Customer provided details → Pending' }],
  Escalated: [{ to: 'Resolved', label: 'Store replied → Resolution', kind: 'ok' }],
  Resolved: [
    { to: 'Closed', label: 'Confirmation call: customer confirmed → Close', kind: 'ok' },
    { to: 'Escalated', label: 'Not satisfied → Re-escalate', kind: 'danger' },
  ],
  Closed: [{ to: 'Pending', label: 'Reopen' }],
};
