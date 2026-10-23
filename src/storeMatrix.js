// LOTS store escalation matrix (workbook "Escalation Matrix LOTS", one tab per store and kind: Lots-App, Ecommerce,
// BDA, Store related). Every store has the same rows; the people differ per store. This file has the rows and which
// cases go to each row (case master names, src/taxonomy.js). The people per store are in server/storeMatrix.json
// (read from the workbook) and can be edited on Stores & settings or updated from the Excel.
// `confirmed` on a route = the sheet doesn't say it directly; LOTS confirmed it (23 Oct 2026).

export const STORE_MATRIX_SOURCE = 'Escalation Matrix LOTS – store tabs (Lots-App, Ecommerce, BDA, Store related)';

const R = (category, subCategory, sub2, extra = {}) => ({ category, ...(subCategory ? { subCategory } : {}), ...(sub2 ? { sub2 } : {}), ...extra });
const confirmed = { confirmed: 'LOTS, 23 Oct 2026' };

// Lots-App and Ecommerce tabs: the same 16 rows, "Lots-App …" / "Website …" (the app tab has one more, Product Damage)
function onlineRows(P, complaint, request, app) {
  const t = (s) => s.replace(/\{P\}/g, P); // the workbook's text (SUB1 / SUB 2)
  const n = (s) => (app ? s.replace(/\{P\} /g, '').replace(/^related- Others$/, 'Others') : t(s)); // case-master name: the app's have no prefix
  const tech = n('{P} Technical issues and Pricing Issue');
  const order = n('{P} Order Related');
  const orderSheet = t('{P} Order Related');
  return [
    { key: 'tech', sheet: app ? ['Lots-App Technical issues', 'App not opening'] : ['Website Technical issues and Pricing Issue', 'site not opening, Pricing mismatched'], routes: [R(complaint, tech)] },
    { key: 'content', sheet: [t('{P} Content issues'), 'page/images not clear'], routes: [R(complaint, n('{P} Content issues'))] },
    { key: 'account', sheet: [t('{P} Account/ Profile Related,'), 'wrong details, Login Issues, OTP Issues, Unable to update address'], routes: [R(complaint, n('{P} Account/ Profile Related'))] },
    { key: 'account-req', sheet: [t('{P} Account/ Profile Related- REQUESTS'), 'Login support, address updation request etc'], routes: [R(request, n('{P} Account/profile related Request'))] },
    { key: 'payment', sheet: [t('{P} Payment & Refund Related'), 'Payment Related complaint, Refund Related'], routes: [R(complaint, n('{P} Payment & Refund Related'))] },
    // the app tab puts "Pricing mismatched" here; the website tab puts it with the technical issues
    { key: 'pricing', sheet: [t('{P} Pricing Related,'), app ? 'Price higher than market/store / Pricing mismatched' : 'Price higher than market/store'], routes: [R(complaint, n('{P} Pricing Related')), ...(app ? [R(complaint, tech, 'Pricing mismatched')] : [])] },
    { key: 'pricing-req', sheet: [t('{P} Pricing Related - REQUESTS'), 'Price higher than market/store'], routes: [R(request, n('{P} Pricing related - Request'))] },
    { key: 'product', sheet: [t('{P} Product related'), 'Stock non availability, order or items in order cancelled without informing'], routes: [R(complaint, n('{P} Product related'))] },
    { key: 'offers', sheet: [t('{P} Offers and scheme'), 'Online Offers and scheme'], routes: [R(complaint, n('{P} Offers and scheme'))] },
    { key: 'order', sheet: [orderSheet, 'order not complete, Wrong products received'], routes: [R(complaint, order, 'order not complete'), R(complaint, order, 'Wrong products received')] },
    {
      key: 'undispatched',
      sheet: [t('{P} Order - Delivery Related (Order Status - Not Dispatched)'), `${app ? 'App' : 'Website'} Delivery Related (Order not received) Order Status is not Dispatched`],
      routes: [R(complaint, n('{P} Order-Delivery Related (order status not dispatched)')), R(complaint, order, n('{P} Delivery Related'), confirmed)],
    },
    { key: 'dispatched', sheet: [t('{P} Order - Delivery Related (Order Status - Dispatched)'), `${app ? 'App' : 'Website'} Delivery Related (Order not received) Order Status Dispatched`], routes: [R(complaint, n('{P} Order-Delivery Related (order status dispatched)'))] },
    { key: 'cancel', sheet: [orderSheet, `${app ? 'App' : 'Website'} Order Cancellations Related`], routes: [R(complaint, order, n('{P} Order Cancellations Related'))] },
    { key: 'invoice', sheet: [t('{P} Invoice Related, {P} Cancellation & Refund related request'), 'Invoice related, incorrect invoice'], routes: [R(complaint, n('{P} Invoice Related')), R(request, n('{P} Cancellation & Refund related request'))] },
    {
      key: 'other',
      sheet: [t('{P} Order Related, {P} Order status Enquiry Request (Only after query cannot be resolved through FAQs)'), 'Others'],
      routes: [R(complaint, order), R(complaint, n('{P} related- Others')), R(request, n('{P} Order status inquiry Request')), R(request, n('{P} related- Others')), R(complaint, '', '', confirmed), R(request, '', '', confirmed)],
    },
    { key: 'quality', sheet: app ? ['Lots App-Product Quality', 'Product Quality'] : ['Product Quality', 'Product Quality'], routes: [R(complaint, n('{P} Product Quality Related'))] },
    ...(app ? [{ key: 'damage', sheet: ['Lots App-Product Damage', 'Product Damage'], routes: [] }] : []), // no such category in the case master
  ];
}

const BDA = 'BDA related';
const BDA_REQ = 'BDA Related REQUESTS';
const STORE = 'Store related';
const STORE_REQ = 'Store related Request';

export const STORE_TABS = [
  { tab: 'app', label: 'App', sheetName: /lots-?\s*app/i, rows: onlineRows('Lots-App', 'App Related', 'App Related Request', true) },
  { tab: 'web', label: 'Ecommerce (website)', sheetName: /e-?\s*commerce|e-?\s*comm\b/i, rows: onlineRows('Website', 'E-Comm Related', 'E Commerce Related Request', false) },
  {
    tab: 'bda',
    label: 'BDA',
    sheetName: /\bbda\b/i,
    rows: [
      { key: 'req-cancel', sheet: ['BDA - Order Related Requests', 'Request to cancel order'], routes: [R(BDA_REQ, 'BDA - Order Related Requests', 'Request to cancel order')] },
      { key: 'req-status', sheet: ['BDA - Order Related Requests', 'Request for order status'], routes: [R(BDA_REQ, 'BDA - Order Related Requests', 'Request for order status'), R(BDA_REQ, 'BDA - Order Related Requests')] },
      { key: 'incomplete', sheet: ['BDA - Order Related', 'BDA-Incomplete Order'], routes: [R(BDA, 'BDA - Order Related', 'BDA-Incomplete Order')] },
      { key: 'cancelled', sheet: ['BDA - Order Related', 'BDA - Order Cancelled without communication'], routes: [R(BDA, 'BDA - Order Related', 'BDA - Order Cancelled without communication'), R(BDA, 'BDA - Order Related', 'BDA-Order Cancelled', confirmed)] },
      { key: 'complaint', sheet: ['BDA - Order Related', 'BDA-Complaint about order'], routes: [R(BDA, 'BDA - Order Related', 'BDA-Complaint about order'), R(BDA, 'BDA - Order Related')] },
      { key: 'undispatched', sheet: ['BDA - Order - Delayed Deliver Related (Order Status Not Dispatch)', 'BDA-Complaint about order'], routes: [R(BDA, 'BDA Order-Delivery Related (order status not dispatched)'), R(BDA, 'BDA - Order Related', 'BDA-delayed delivery', confirmed)] },
      { key: 'dispatched', sheet: ['BDA - Order - Delayed Deliver Related (Order Status Dispatch)', 'BDA-delayed delivery (Order Status- Dispatch)'], routes: [R(BDA, 'BDA Order-Delivery Related (order status dispatched)')] },
      { key: 'return', sheet: ['BDA - Product Return Request', 'Request to Return products'], routes: [R(BDA_REQ, 'BDA - Product Return Request', 'Request to Return products'), R(BDA_REQ, 'BDA - Product Return Request')] },
      { key: 'invoice', sheet: ['BDA - Cancellation and Invoice related', 'BDA-incorrect invoice'], routes: [R(BDA, 'BDA - Cancellation and Invoice related')] },
      { key: 'other-req', sheet: ['BDA - Other Requests', 'Others'], routes: [R(BDA_REQ, 'BDA - Product Return Request', 'Others'), R(BDA_REQ, '', '', confirmed)] },
      { key: 'others', sheet: ['BDA - Others', 'BDA - Others'], routes: [R(BDA, 'BDA-Others'), R(BDA, '', '', confirmed)] },
      { key: 'pricing', sheet: ['BDA-Pricing related', 'BDA - Prices are higher than Market/Store'], routes: [R(BDA, 'BDA-Pricing related')] },
      { key: 'behaviour', sheet: ['BDA-Behaviour Related', 'BDA - Rude Behaviour'], routes: [R(BDA, 'BDA-Behaviour Related')] },
      { key: 'quality', sheet: ['BDA-Product Quality Related', 'BDA - Product Quality'], routes: [R(BDA, 'BDA-Product Quality Related')] },
    ],
  },
  {
    tab: 'store',
    label: 'Store related',
    sheetName: /store\s*related/i,
    // the tab has complaints only; a store request goes to the row of the same kind (confirmed by LOTS)
    rows: [
      { key: 'behaviour', sheet: ['Behavior of staff', 'Rude behaviour,No knowledge,No Support'], routes: [R(STORE, 'Behaviour of staff')] },
      { key: 'operational', sheet: ['Operational issues', 'Cash tills/ checkout issue,Signage issue,parking issue,others'], routes: [R(STORE, 'Operational issues'), R(STORE_REQ, 'Operational Requests', '', confirmed)] },
      { key: 'payment', sheet: ['Payment or invoice', 'price mismatch ,GST related,re-issue invoive, wrong product billed'], routes: [R(STORE, 'Payment or invoice'), R(STORE_REQ, 'Payment or invoice Related Request', '', confirmed)] },
      { key: 'pricing', sheet: ['Pricing issue', 'Price higher than market'], routes: [R(STORE, 'Pricing issue'), R(STORE_REQ, 'Pricing Related Request', '', confirmed)] },
      { key: 'delivery', sheet: ['Delivery related', 'order not complete,Late delivery,COD issues,rude delivery staff'], routes: [R(STORE, 'Delivery related'), R(STORE_REQ, 'Delivery related Request', '', confirmed)] },
      { key: 'quality', sheet: ['Quality issue', 'Poor product quality'], routes: [R(STORE, 'Quality issue')] },
      { key: 'return', sheet: ['Return of goods', 'goods return'], routes: [R(STORE, 'Return of goods'), R(STORE_REQ, 'Return of goods related Request', '', confirmed)] },
      { key: 'stock', sheet: ['Stock availablity', 'Assortment, Low stock'], routes: [R(STORE, 'Stock availablity'), R(STORE_REQ, 'Stock availablity related Request', '', confirmed)] },
      { key: 'offer', sheet: ['Offer related', 'coupon/sms offer not given, cashback, freebie not given'], routes: [R(STORE, 'Offer related'), R(STORE_REQ, 'Offer related Request', '', confirmed)] },
      { key: 'others', sheet: ['Others', 'Others'], routes: [R(STORE, 'others'), R(STORE, '', '', confirmed), R(STORE_REQ, '', '', confirmed)] },
      {
        key: 'member',
        sheet: ['Member complaint', 'Member card not received, Not receiving offer communication, incorrect member details on card, others'],
        routes: [R('Membership Related', 'Member complaint'), R('Membership Related', '', '', confirmed), R('Member related -NR', '', '', confirmed), R('Membership related Request', '', '', confirmed)],
      },
    ],
  },
];

/** Every row of one store's matrix: { key: 'app-tech', tab, tabLabel, sheet: [SUB1, SUB2], routes }. */
export const STORE_ROWS = STORE_TABS.flatMap((t) => t.rows.map((r) => ({ ...r, key: `${t.tab}-${r.key}`, tab: t.tab, tabLabel: t.label })));

export const storeRowKey = (code, rowKey) => `s${code}.${rowKey}`;
/** 's101.app-tech' → { code: '101', rowKey: 'app-tech' } (null if not a store-matrix key). */
export function parseStoreRowKey(key) {
  const m = String(key || '').match(/^s(\d{3})\.([a-z0-9-]+)$/);
  return m ? { code: m[1], rowKey: m[2] } : null;
}

const hit = (want, have) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);
const specificity = (r) => (r.sub2 ? 4 : 0) + (r.subCategory ? 2 : 0) + 1;

/** The store-matrix row for a case's category (most specific route wins): { row, route } or null. */
export function storeRouteFor(c) {
  if (!c?.category) return null;
  let best = null;
  for (const row of STORE_ROWS)
    for (const route of row.routes)
      if (hit(route.category, c.category) && hit(route.subCategory, c.subCategory) && hit(route.sub2, c.sub2) && (!best || specificity(route) > specificity(best.route))) best = { row, route };
  return best;
}

/** A workbook row's text as shown in the CRM: without "Lots-App" (user, 22 Oct 2026) and the stray trailing comma. */
export const shownText = (s) => String(s || '').replace(/\bLots[- ]?App[- ]/gi, '').replace(/,\s*$/, '');
