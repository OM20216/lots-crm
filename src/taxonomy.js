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

// Excel `sub1` (generic request / complaint sub-categories)
export const SUB1 = [
  'Behavior of staff',
  'Delivery Related',
  'Offer related',
  'Operational issues',
  'Others (st)',
  'Payment or invoice',
  'Pricing issue',
  'Quality issue',
  'Return Of Goods',
  'Stock availability',
];

// Excel `sub2` (membership sub-categories; the supplier sub-types are separate)
export const SUB2 = ['Add-On Cards', 'Address updation'];

// Excel `sub2` for New Supplier
export const SUPPLIER_TYPES = ['Suppliers - Fresh', 'Suppliers - FMCG - Food', 'Suppliers - FMCG - Commodities', 'Suppliers - Non Food'];

// Excel `resolution_type`
export const RESOLUTION_TYPES = ['Answer Received', 'Clarity required from LOTS', 'Escalated and Auto Closed', 'Escalated to LOTS', 'Information Provided'];

export const CALL_TYPES = ['Inbound'];

// ---------- the case master ("lot cases excel.xlsx") ----------
// Every type of contact (Not Registered / Registered With Lots / Others) gets the same case types and categories.
// case_type → case_category → sub-category (Requests: the master's sub1).
// The master has no sub-categories for Inquiry and Complaints; where the SOP ("Incoming Call Process") lists them,
// those are used. LOTS can add more on the Picklists / Dependencies screens.
export const CASE_TREE = {
  Inquiry: {
    Legal: [],
    'Real Estate': [],
    'HR or Jobs': ['Job vacancy', 'HR contact details', 'Jobs in store', 'Jobs in corporate office'],
    'General Query': [
      'Store timings',
      'Store address',
      'Membership registration process',
      'Documents for new membership',
      'Supplier registration',
      'Documents for supplier registration',
      'Product availability / stock',
      'Product price',
      'Mode of payment',
      'Add-on card',
      'Delivery enquiry / timings / charges',
      'Privilege card',
      'Offers & schemes',
    ],
    'IT or Website': [],
    'Festive Gifting': [],
    'Admin Related': [],
    'Marketing Related': [],
  },
  Requests: {
    'New Member': [],
    'New Supplier': [],
    'Membership Related Request': SUB1,
    'Store Related Request': SUB1,
    'E Commerce Related Request': SUB1,
    'BDA Related REQUESTS': SUB1,
    'App Related Requests': SUB1,
  },
  'Issues or Complaints - NR': {
    'Store Related': [
      'Rude staff behaviour',
      'Unsupportive staff',
      'Price mismatch',
      'Wrong product billed',
      'GST issue',
      'Late delivery',
      'Incomplete delivery',
      'Poor product quality',
      'Near expiry product',
      'Freebie not given',
      'SMS coupon not given',
      'Other',
    ],
    'Membership Related': [],
    'ECommerce Related': [
      'Incomplete order delivered',
      'Wrong products received',
      'Amount overcharged',
      'Incorrect invoice details',
      'Refund not received',
      'Poor product quality',
      'Near expiry product',
      'Delayed delivery – dispatched',
      'Delayed delivery – not dispatched',
      'Other',
    ],
    'BDA Related': [
      'Incomplete order',
      'Wrong products delivered',
      'Order cancelled without communication',
      'Rude / unsupportive BDA',
      'BDA pricing issue',
      'BDA product quality issue',
      'Delayed delivery – dispatched',
      'Delayed delivery – not dispatched',
      'Other',
    ],
    'App Related': ['Site / app not opening', 'Wrong profile details', 'OTP / login issue', 'Other'],
    'Membership Related - NR': [],
  },
};

// The case master's other columns, per category: request_for, sub2, invoice_detail_required, resolution_type.
const INQUIRY_RESOLUTION = ['Answer Received', 'Clarity required from LOTS', 'Escalated and Auto Closed'];
const REQUEST_MASTER = { requestFor: ['Re-issuing of Lost Card'], sub2: SUB2, invoiceRequired: true, resolution: ['Answer Received', 'Clarity required from LOTS'] };
export const CASE_MASTER = {
  ...Object.fromEntries(['Legal', 'Real Estate', 'HR or Jobs', 'General Query', 'IT or Website', 'Festive Gifting', 'Admin Related', 'Marketing Related'].map((c) => [c, { resolution: INQUIRY_RESOLUTION }])),
  'New Member': { requestFor: ['New Member - Customer'], resolution: ['Information Provided'] },
  'New Supplier': { requestFor: ['New Vendor - Supplier'], sub2: SUPPLIER_TYPES, invoiceRequired: false, resolution: ['Information Provided'] },
  'Membership Related Request': REQUEST_MASTER,
  'Store Related Request': REQUEST_MASTER,
  'E Commerce Related Request': REQUEST_MASTER,
  'BDA Related REQUESTS': REQUEST_MASTER,
  'App Related Requests': REQUEST_MASTER,
  ...Object.fromEntries(['Store Related', 'Membership Related', 'ECommerce Related', 'BDA Related', 'App Related', 'Membership Related - NR'].map((c) => [c, { resolution: ['Escalated to LOTS'] }])),
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
