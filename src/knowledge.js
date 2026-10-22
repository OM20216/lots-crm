// Quick answers and reply templates, taken from "Lots Process Documents 2026".
// Items marked conflict: true are where the SOP contradicts itself — confirm with the process owner.

export const CONTACT = {
  phone: '1860-123-5687',
  email: 'contactus@cpwi.in',
  hours: 'Everyday 9:00 AM – 9:00 PM',
  careers: 'careers@cpwi.in · Yuktanshi.Srivastava@cpwi.in / Apoorv.Tyagi@cpwi.in',
  optIn: '08061914105',
};

export const KB = [
  {
    title: 'Membership – new registration',
    tags: 'membership documents gst licence register new card',
    points: [
      'Membership is free. B2B only — a valid business licence and govt ID are required.',
      'Any one licence: GST · FSSAI · Drug licence · Certificate of Incorporation · Society / Public Trust registration · APMC · Govt department authorisation letter · MSME / Udyam · Weights & Measures · Municipal / Trade licence · Shops & Establishments / Labour licence.',
      'No GST? Supporting documents: visiting card · menu photo · copy of bill · hoarding board · flex board.',
      'Mandatory: PAN card · mobile no. · Aadhaar card · selfie · store preference.',
      'Customer must be physically present at the store at the time of registration.',
      'Consent form — offline: sign in store. Online: store emails a PDF → customer prints, signs, scans and sends back to the store email.',
      'Available only in Delhi NCR (not pan India).',
    ],
  },
  {
    title: 'Add-on (secondary) card',
    tags: 'add on addon secondary card family friend',
    points: [
      'Up to 4 add-on cards per member (1 member card + 4 add-on cards per business establishment).',
      'Linked to the owner’s card — if the owner’s card is blocked, the add-on is blocked too.',
      'Can be issued offline and online.',
      'Documents: authority letter on business letterhead (or plain A4 with business stamp + signature) · Aadhaar, normal photo and mobile number of the person being added.',
    ],
  },
  {
    title: 'Privilege card',
    tags: 'privilege card fee 799 1450 1499',
    points: ['Fee ₹799 / ₹1450 / ₹1499, valid 3–6 months.', 'Issued only during in-store visits; gives additional offers and benefits.'],
  },
  {
    title: 'Stores & timings',
    tags: 'store address timing hours open sunday location',
    points: [
      'Open 7 days a week.',
      '101 NSP — Netaji Subhash Place Metro, New Delhi 110034 · 9 AM–8 PM',
      '102 Ithum — Plot A40, Sector-62, Ithum Tower, Noida (near Fortis) · 7 AM–9 PM',
      '103 AKD — Parsvnath Mall, Akshardham Metro, New Delhi 110096 · 9 AM–9 PM',
      '104 SRV — NDRAVG Business Park, opp. Mohan Estate Metro, Sarita Vihar · 9 AM–8 PM',
      '105 DH — Duhai, Ghaziabad · online store',
      '106 GNI — Plot 5, Knowledge Park 1, Greater Noida (near Cloud Nine) · 9 AM–8 PM',
    ],
  },
  {
    title: 'B2C outlets (AKD & NSP)',
    tags: 'b2c walk in without membership normal customer',
    points: [
      'AKD from Sep 2025, NSP from Nov 2025 — shop without membership or documents.',
      'Food items of Indian origin only; no non-food; no e-commerce for B2C.',
      'Separate B2C billing counters; B2B area needs membership card scan at the gate.',
    ],
  },
  {
    title: 'Return & exchange',
    tags: 'return exchange refund credit note bill invoice',
    points: [
      'Within 7 working days with the original invoice (bill stamped by store guard). No bill → store verifies internally.',
      'Packaging intact with tags, unused, saleable, with any free promo articles, before expiry.',
      'Not returnable: oil, ghee, fresh dairy, fruits, vegetables, meat, fish, temperature-controlled products.',
      'Credit note issued — valid 1 year, single purchase.',
      'No warranty from LOTS; brand / manufacturer warranty and service centres apply.',
    ],
  },
  {
    title: 'Delivery',
    tags: 'delivery charges handling fee tat radius address',
    points: [
      'No delivery charge on orders of ₹9,000 or more.',
      'Handling fee ₹69 at GNI, ₹99 other stores — waived for the month if more than 8 orders in that month.',
      'Shipping charges apply based on the article.',
      'Only to the registered business licence address, within 25 km.',
      'Delivery TAT 2–3 working days.',
      'Change of delivery address: new address proof + govt-approved business licence + authority letter.',
    ],
  },
  {
    title: 'Minimum order value (app / website)',
    tags: 'mov minimum order value app website horeca',
    points: [
      'HoReCa ₹3,000 for: Quick service restaurant · Multi cuisine · Speciality restaurants · Budget hotel (1–3★) · Street food · Online food services · Pub & bar.',
      'Others store-wise: NSP 9,000 · Ithum 6,000 · AKD 3,000 & 6,000 · SRV 5,000 · Microhub 3,000 · GNI 6,000.',
      'In-store: minimum ₹500 per invoice.',
    ],
  },
  {
    title: 'Payments & online orders',
    tags: 'payment card cash paytm amex split order cancel refund debited',
    points: [
      'Credit / debit cards (except American Express), cash, Paytm. Split payment allowed.',
      'Order online via website or app using the registered mobile number (Google Play / App Store).',
      'Cancel any time before the order status is Dispatched.',
      'Amount debited but not received: auto-refund within 7 working days, or contact the bank.',
      'Billed items cannot be held / pre-booked. No loyalty programme currently.',
    ],
  },
  {
    title: 'Supplier / vendor registration',
    tags: 'supplier vendor manufacturer register',
    points: ['Email company profile / portfolio + product catalogue to contactus@cpwi.in.', 'Our representatives get in touch within 7 days.'],
  },
  {
    title: 'Carrying goods / vehicle help',
    tags: 'carry goods vehicle trolley',
    points: [
      'Our staff will assist you with your vehicle or organise delivery.',
      'Please contact the Customer Support Helpdesk at the store for help carrying goods to your vehicle or stores.',
    ],
  },
  {
    title: 'Cash on Delivery (COD)',
    tags: 'cod cash on delivery',
    points: [
      'We provide Cash on Delivery (COD). Purchases made through our ecommerce platform can be paid via the payment facilities provided therein.',
      'Credit/debit cards are available as per the payment options shown at checkout for COD-enabled orders.',
    ],
  },
  {
    title: 'Non-member shopping',
    tags: 'non member cannot shop',
    points: [
      'A non-member cannot shop at the store as we are open only for registered business/institutional customers.',
      'Non-members may register for membership with valid business licence and documents.',
    ],
  },
  {
    title: 'Other requests',
    tags: 'lost card offer sms bda bulk booking job hr careers',
    points: [
      'Lost card: application on business letterhead + valid govt ID — at store or to contactus@cpwi.in.',
      'Offer SMS not received: missed call to 08061914105 from the registered number; messages start within 48 hours.',
      'Bulk / regular quantities: contact store helpdesk or email product details and quantity.',
      'BDA: field representatives take orders at the registered business address.',
      'Jobs: careers@cpwi.in · Yuktanshi.Srivastava@cpwi.in / Apoorv.Tyagi@cpwi.in',
      'LCC (Lots Club Card): delivery within 24 hours, zero delivery charges, personal assistance in store.',
    ],
  },
];

export const SCRIPTS = [
  {
    title: 'Inbound greeting',
    text: 'Good morning! [Name] this side from Lots Wholesale Solution. How may I assist you today?',
  },
  {
    title: 'Hold procedure',
    text: 'Explain the reason for the hold · ask for their phone number in case the call is cut · give your best estimate of the hold time · if longer than a couple of minutes, ask for a number and time to call back.',
  },
  {
    title: 'Inbound closing',
    text: 'Is there anything else I can assist you with? … Thank you for your time and for contacting Lots Wholesale Solution. Have a great day ahead!',
  },
  {
    title: 'Outbound opening',
    text: 'Namaskar! Main [Name] bol raha/rahi hoon LOTS Wholesale Solutions se. Kya abhi aapse baat karne ka yeh sahi samay hai?',
  },
  {
    title: 'Outbound closing',
    text: 'Dhanyavaad Sir/Ma’am, LOTS Wholesale mein samay dene ke liye shukriya. Aapka din shubh ho!',
  },
  {
    title: 'Store follow-up call',
    text: 'Good afternoon [Name] ji, Main [Your Name] bol rahi/raha hoon, Lots Wholesale Solutions ke customer support se. Pending cases ke regarding follow-up karna tha. Current status aur resolution timeline batane ki kripa karein. … Jankari dene ke liye shukriya. Dhanyavaad!',
  },
];

// {{placeholders}} are filled from the case when used from a case page.
export const EMAIL_TEMPLATES = [
  {
    id: 'ack',
    title: 'Acknowledgement',
    subject: 'Re: {{subject}} [{{id}}]',
    body: 'Dear {{name}},\n\nThank you for contacting LOTS Wholesale Solutions. We have registered your concern under reference number {{id}}. Our team is looking into it and will update you shortly.\n\nPlease keep the reference number in the subject line for any further communication.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions\n1860-123-5687 | contactus@cpwi.in',
  },
  {
    id: 'waiting',
    title: 'Request missing information (→ Waiting)',
    subject: 'Information required – [{{id}}]',
    body: 'Dear {{name}},\n\nThank you for writing to us. To help us resolve your concern (ref. {{id}}), please share the following details:\n\n• \n• \n\nOnce we receive these, we will proceed at the earliest.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions\n1860-123-5687 | contactus@cpwi.in',
  },
  {
    id: 'membership',
    title: 'New membership – documents',
    subject: 'Membership registration – [{{id}}]',
    body: 'Dear {{name}},\n\nThank you for your interest in LOTS Wholesale Solutions. Membership is free of cost. To register, please visit your preferred store with:\n\nBusiness licence (any one): GST registration, FSSAI licence, Drug licence, Trade licence, Shops & Establishments registration, MSME/Udyam registration, etc.\nIf you do not have GST: visiting card, menu photo, copy of bill, hoarding or flex board.\nMandatory: PAN card, Aadhaar card, mobile number, selfie photo and store preference.\n\nPlease note the applicant must be physically present at the store at the time of registration.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
  {
    id: 'supplier',
    title: 'Supplier registration',
    subject: 'Supplier registration – [{{id}}]',
    body: 'Dear {{name}},\n\nThank you for your interest in partnering with LOTS Wholesale Solutions. Please share your company profile / portfolio and product catalogue (details and images of the products you manufacture) at contactus@cpwi.in. Our representatives will get in touch with you within 7 days.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
  {
    id: 'hr',
    title: 'Job enquiry',
    subject: 'Re: {{subject}} [{{id}}]',
    body: 'Dear {{name}},\n\nThank you for your interest in working with LOTS Wholesale Solutions. Please send your application / resume to careers@cpwi.in and our HR team will get in touch with you.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
  {
    id: 'escalate',
    title: 'Escalation to store',
    subject: 'Customer concern – {{id}} – {{category}} / {{subCategory}}',
    // layout of LOTS's Vtiger mails (user's sample, 22 Oct 2026); {{queryDetails}} is filled by the server (src/queryDetails.js)
    body: 'Hi Team,\n\nGreeting for the day!\n\nPlease find below a customer concern for your action. Kindly share the resolution with customer care within the TAT of the escalation matrix.\n\nThe Details of the Query are:\n____________\n\n{{queryDetails}}\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
  {
    id: 'store-followup',
    title: 'Store follow-up',
    subject: 'Follow-up: pending case {{id}}',
    body: 'Hi Team,\n\nGreeting for the day!\n\nAs per our discussion over the call regarding the pending case {{id}}, we kindly request you to share an update on the same at the earliest.\n\nThe Details of the Query are:\n____________\n\n{{queryDetails}}\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
  {
    id: 'resolved',
    title: 'Resolution to customer',
    subject: 'Resolution – [{{id}}]',
    body: 'Dear {{name}},\n\nWe are pleased to inform you that your concern (ref. {{id}}) has been addressed by our store team.\n\n[Resolution details]\n\nIf you need any further help, please reply to this email or call us on 1860-123-5687 (everyday 9 AM – 9 PM).\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions',
  },
];

export const CRM_NOTE_TEMPLATES = [
  'Had a discussion with the store contact person, [Name]. As per the update, the case is still pending due to [reason]. A follow-up email has been sent to the store.',
  'Called the customer to understand complete details. [Details]',
  'Called the customer to confirm the resolution. Customer confirmed the concern is resolved.',
  'Customer not reachable. Will try again.',
];

export function fillTemplate(text, c = {}, stores = []) {
  const st = stores.find((s) => s.code === c.store);
  const vals = { ...c, storeSpoc: st?.spocName || 'Store Team' };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vals[k] ? String(vals[k]) : k === 'name' ? 'Customer' : '—'));
}
