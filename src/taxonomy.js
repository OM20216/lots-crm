// Everything here comes from "Lots Process Documents 2026".

export const CHANNELS = ['Inbound call', 'Outbound call', 'Missed call callback', 'Email'];

export const CALLER_TYPES = ['Registered member', 'Not registered', 'B2C customer'];

export const STATUSES = ['Pending', 'Waiting', 'Escalated', 'Resolved', 'Closed'];

export const STATUS_HELP = {
  Pending: 'Received, not yet addressed',
  Waiting: 'Missing info requested from customer',
  Escalated: 'With store team · L1 TAT 1 working day',
  Resolved: 'Store replied · confirm with customer',
  Closed: 'Customer confirmed / resolved on call',
};

// caseType → category → sub-categories
export const CASE_TREE = {
  Enquiry: {
    'General query': [
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
      'B2C outlet',
      'Offers & schemes',
      'Other',
    ],
    'HR & jobs': ['Job vacancy', 'HR contact details', 'Jobs in store', 'Jobs in corporate office'],
    'Admin, IT & marketing': ['Administration', 'IT / website', 'Marketing', 'Other'],
  },
  'Issue & Complaint': {
    'Store related': [
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
    'App / E-comm related': [
      'Site / app not opening',
      'Wrong profile details',
      'OTP / login issue',
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
    'BDA related': [
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
  },
  Request: {
    'Membership related': [
      'Change registered contact number',
      'Update registered business address',
      'Update business licence',
      'New add-on card',
      'Reissue membership card',
      'Block membership card / lost card',
    ],
    'Store related': ['Reissue invoice', 'GST related', 'Return / exchange', 'Increase stock', 'Bulk booking', 'Other'],
    'App / E-comm related': ['Cancel order', 'Return order', 'Refund', 'Other'],
    'BDA related': ['Cancel BDA order', 'Return BDA order', 'Other'],
    'Not registered member': ['New membership', 'New supplier registration'],
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
