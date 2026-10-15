// Case taxonomy, aligned to LOTS's case master "lot cases excel.xlsx"
// (every possible case: case_type → case_category → sub-categories, plus the
// request / resolution / channel dimensions that file lists).
// The SOP ("Lots Process Documents 2026") still drives the workflow rules
// (src/workflows.js) and the answers / templates (src/knowledge.js).

export const CHANNELS = ['Inbound call', 'Outbound call', 'Missed call callback', 'Email'];

// Excel `type_of_contact` maps: "Registered With Lots" → Registered member ·
// "Not Registered" → Not registered · "Others" → B2C customer.
export const CALLER_TYPES = ['Registered member', 'Not registered', 'B2C customer'];

export const STATUSES = ['Pending', 'Waiting', 'Escalated', 'Resolved', 'Closed'];

export const STATUS_HELP = {
  Pending: 'Received, not yet addressed',
  Waiting: 'Missing info requested from customer',
  Escalated: 'With store team · L1 TAT 1 working day',
  Resolved: 'Store replied · confirm with customer',
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

const REQUEST_SUBS = [...SUB1, ...SUB2];

// case_type → case_category → sub-categories (exactly the case master)
export const CASE_TREE = {
  Inquiry: {
    'Admin Related': [],
    'Festive Gifting': [],
    'General Query': [],
    'HR or Jobs': [],
    'IT or Website': [],
    Legal: [],
    'Marketing Related': [],
    'Real Estate': [],
  },
  'Issues or Complaints - NR': {
    'App Related': [],
    'BDA Related': [],
    'ECommerce Related': [],
    'Membership Related': [],
    'Membership Related - NR': [],
    'Store Related': [],
  },
  Requests: {
    'App Related Requests': REQUEST_SUBS,
    'BDA Related REQUESTS': REQUEST_SUBS,
    'E Commerce Related Request': REQUEST_SUBS,
    'Membership Related Request': REQUEST_SUBS,
    'New Member': ['New Member - Customer'],
    'New Supplier': ['New Vendor - Supplier', ...SUPPLIER_TYPES],
    'Store Related Request': REQUEST_SUBS,
  },
};

export const PRODUCT_CATEGORIES = ['Fresh', 'FMCG – Food', 'Commodities', 'FMCG – Non food', 'Non food'];

export const CUSTOMER_GROUPS = {
  Distributor: ['Exporter', 'FMCG Wholesaler', 'Food W/S', 'Fresh Food Wholesaler', 'Grocery Retail Shop/Stall', 'Non Food Wholesaler', 'Up Country Distributor'],
  'Food Retailer (FR)': ['Bakery/Sweet Shop', 'Fresh Food Retail Shop', 'Fruit and Vegetable Shop', 'Grocery Retail Shop/Stall', 'Kirana', 'Organised Retailer', 'Supermarket'],
  HoReCa: ['Bakery/Sweet Shop', 'Caterer', 'Quick service restaurant', 'Multi Cuisine Restaurants', 'Speciality Restaurants', 'Budget Hotel (1-3 Stars)', 'Street Food Shop', 'Online Food Services', 'Pub & Bar'],
  'Catering Business': ['Hotel', 'Hotel & Resort', 'Restaurant'],
  'Non-food Retailer (NFR)': ['Electronic appliance shop', 'Medicine Shop', 'Non Food Wholesaler', 'Stationary Shop', 'Stationery/Office supply shop'],
  'Self Employed Professionals (SEP)': ['Educational Service', 'Self Employed Professionals', 'Small and Medium Office'],
  'Service (SV)': ['Educational Institute', 'Exporter', 'Hospital', 'Institution', 'Institutional Service', 'Other Service'],
  B2C: ['Walk-in customer'],
};

export const LEAD_TYPES = ['New registration', 'Inactive customer', 'Order on call', 'LCC (Lots Club Card)', 'Confirmation / resolution', 'Festival & seasonal offers'];

export const LEAD_OUTCOMES = ['Interested', 'Not interested', 'Call back', 'Not reachable', 'Order placed', 'Converted'];

// Confirmation calls act on the case: confirmed → Closed, not satisfied → back to the store.
export const CONFIRMATION_OUTCOMES = ['Confirmed resolved', 'Not satisfied', 'Call back', 'Not reachable'];

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
