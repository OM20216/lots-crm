// "Request requirements" / "Information complete?" from the workflow — only what the SOP lists.
// Used by the agent screens (checklist) and by the server's automatic email check.

// Keyed by sub-category. `docs`: the customer must send documents (so an email needs attachments).
export const REQUIREMENTS = {
  'New membership': {
    docs: true,
    items: [
      'Any one business licence: GST · FSSAI · Drug licence · Certificate of Incorporation · Society / Public Trust registration · APMC · Govt department authorisation letter · MSME / Udyam · Weights & Measures · Trade licence · Shops & Establishments',
      'No GST? A supporting document: visiting card · menu photo · copy of bill · hoarding board · flex board',
      'Mandatory: PAN card · mobile no. · Aadhaar card · selfie · store preference',
      'Customer must be physically present at the store at registration',
      'Online application: signed consent form (store emails the PDF → print, sign, scan, send back)',
    ],
  },
  'New add-on card': {
    docs: true,
    items: [
      'Maximum 4 add-on cards per member',
      'Authority letter on business letterhead (or plain A4 with business stamp + signature)',
      'Aadhaar card of the person being added',
      'Normal photo of the person being added',
      'Mobile number of the person being added',
    ],
  },
  'New supplier registration': {
    docs: true,
    items: ['Company profile / portfolio', 'Product catalogue (details and images of the products)'],
  },
  'Block membership card / lost card': {
    docs: true,
    items: ['Lost card application on business letterhead', 'Valid govt ID proof'],
  },
  'Update registered business address': {
    docs: true,
    items: ['New address proof', 'Govt-approved business licence', 'Authority letter'],
  },
  'Return / exchange': {
    items: ['Original bill stamped by the store guard (no bill → the store verifies the purchase internally)', 'Within 7 working days · packaging intact, unused, saleable, with free articles · before expiry'],
  },
  'Bulk booking': {
    items: ['Product details', 'Quantity'],
  },
};

export function requirementsFor(subCategory) {
  return REQUIREMENTS[subCategory] || null;
}

/**
 * What an email case still lacks before it can go to the store. Empty array = complete.
 * Documents can only be checked for presence (attachments), not content.
 */
export function missingInfo(c) {
  const missing = [];
  if (!c.caseType || !c.category) return ['Details of your query or concern'];
  const req = REQUIREMENTS[c.subCategory];
  if (req?.docs && !(c.attachments || []).length && !c.source?.hasAttachments) missing.push(...req.items.filter((i) => !/physically present|store verifies|^Maximum/i.test(i)));

  const registered = c.category !== 'Not registered member';
  if (registered && !c.memberId && !c.phone && !c.cardNo) missing.push('Your registered mobile number or membership card number');
  if (['Store related', 'BDA related'].includes(c.category) && !c.store) missing.push('The LOTS store concerned (NSP, Ithum, Akshardham, Sarita Vihar or Greater Noida)');
  if (c.category === 'App / E-comm related' && !c.orderRef) missing.push('Your app / website order number');
  return missing;
}

// Pull reference numbers out of free text (email body).
export function extractRefs(text) {
  const t = String(text || '');
  const order = t.match(/\b(?:invoice|bill|order)\s*(?:no\.?|number|num|id|#)?\s*[:\-#]?\s*((?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{3,})/i);
  const card = t.match(/\b(?:membership|member|card)\s*(?:card\s*)?(?:no\.?|number|num|id|#)\s*[:\-#]?\s*((?=[A-Z0-9\-]*\d)[A-Z0-9][A-Z0-9\-]{3,})/i);
  return { orderRef: order?.[1] || '', cardNo: card?.[1] || '' };
}

// ---------- SOP rules checked while a case is logged (shown as warnings; the agent still decides) ----------
const NON_RETURNABLE = /\b(oil|ghee|milk|curd|dahi|paneer|butter|cheese|cream|dairy|fruits?|vegetables?|sabzi|meat|chicken|mutton|fish|eggs?|frozen|ice ?cream|chilled)\b/i;
const B2C_STORES = { '101': 'NSP', '103': 'AKD' };

function workingDaysSince(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  let n = 0;
  while (d < today) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) n++; // Sunday is not a working day
  }
  return n;
}

export function sopWarnings(c) {
  const w = [];
  const text = `${c.description || ''} ${c.subject || ''}`;

  // Return and exchange policy
  if (c.subCategory === 'Return / exchange') {
    if (c.productCategory === 'Fresh' || NON_RETURNABLE.test(text))
      w.push('Return policy: oil, ghee, fresh dairy, fruits, vegetables, meat, fish and temperature-controlled products cannot be returned or exchanged.');
    const days = c.purchaseDate ? workingDaysSince(c.purchaseDate) : null;
    if (days != null && days > 7) w.push(`Return policy: bought ${days} working days ago. Returns and exchanges are accepted within 7 working days of purchase.`);
    if (!c.purchaseDate) w.push('Return policy: ask for the purchase date (within 7 working days) and the original bill stamped by the store guard. No bill: the store verifies internally.');
    w.push('Return policy: packaging intact with tags, unused, saleable, with any free promo articles, before expiry. A credit note is issued (valid 1 year, single purchase).');
  }

  // B2C outlets (AKD from Sep 2025, NSP from Nov 2025)
  if (c.callerType === 'B2C customer') {
    if (c.store && !B2C_STORES[c.store]) w.push('B2C: walk-in customers without membership can shop only at the Akshardham (AKD) and NSP B2C outlets.');
    if (['FMCG – Non food', 'Non food'].includes(c.productCategory)) w.push('B2C: only food items of Indian origin can be sold to B2C customers.');
    if (c.category === 'App / E-comm related') w.push('B2C: e-commerce retail is not allowed for B2C customers. The app and website are for registered members only.');
  }
  return w;
}
