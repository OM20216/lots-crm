// Workflow per case type (from the SOP): who owns the case, the TAT, and the steps. Shared by the screens and the server.
// Case types / categories / sub-categories are the LOTS case master (src/taxonomy.js);
// the owners, TATs and steps follow the SOP ("Lots Process Documents 2026").
// Steps with `auto` tick themselves from what happened on the case.

// Teams a case can be escalated to. 'store' = the case's store contact; 'homeStore' = the member's registered store.
export const TEAMS = {
  careDesk: { name: 'Care desk', note: 'Resolved by the agent on the call (ROT)' },
  store: { name: 'Store team', note: 'Store contact of the store on the case (Stores & settings)' },
  homeStore: { name: 'Home store (membership desk)', note: "Store contact of the member's registered store" },
  ecom: { name: 'E-commerce / App team', note: 'App and website orders, cancellations, returns, refunds' },
  it: { name: 'IT / Website team', note: 'Site or app not opening, OTP / login issues' },
  bda: { name: 'BDA team', note: 'Field sales (BDA) orders and behaviour' },
  hr: { name: 'HR / Careers', note: 'Job enquiries (SOP: careers@cpwi.in)', email: 'careers@cpwi.in' },
  admin: { name: 'Administration', note: 'Admin, legal and real-estate enquiries' },
  marketing: { name: 'Marketing team', note: 'Marketing, offers, festive gifting and campaigns' },
  supplier: { name: 'Category / Supplier team', note: 'New supplier / vendor registration (SOP: reply within 7 days)' },
};

// ---------- steps that tick themselves ----------
const hasStatus = (c, s) => c.status === s || (c.timeline || []).some((t) => t.type === 'status' && t.to === s);
const A = {
  details: (c) => Boolean(c.caseType && c.category && (c.description || '').trim()),
  called: (c) => (c.calls || []).length > 0 || (c.timeline || []).some((t) => t.type === 'call'),
  emailed: (c) => (c.timeline || []).some((t) => t.type === 'email-out'),
  escalated: (c) => hasStatus(c, 'Escalated'),
  followedUp: (c) => (c.timeline || []).some((t) => t.type === 'store-followup'),
  resolution: (c) => hasStatus(c, 'Resolved'),
  confirmed: (c) => c.status === 'Closed' && c.resolutionType === 'Store',
  closed: (c) => c.status === 'Closed',
  store: (c) => Boolean(c.store),
  orderRef: (c) => Boolean((c.orderRef || '').trim()),
  member: (c) => Boolean(c.memberId) || c.callerType !== 'Registered member',
};

const step = (id, label, auto, hint) => ({ id, label, auto, hint });

// The SOP path for anything a store or team has to resolve.
const escalationPath = (owner, first = []) => [
  step('identify', 'Identify the caller (registered member?)', A.member),
  ...first,
  step('details', 'Case type, category and details captured', A.details),
  step('call', 'Call the customer to understand the complete details (SOP)', A.called),
  step('escalate', `Escalate to ${owner} (escalation email sent)`, A.escalated),
  step('followup', 'Daily follow-up until resolved (update the CRM after each call)', A.followedUp),
  step('resolution', 'Resolution received', A.resolution),
  step('confirm', 'Confirmation call: customer satisfied', A.confirmed),
  step('close', 'Case closed', A.closed),
];

const answerPath = (answer) => [
  step('identify', 'Identify the caller', A.member),
  step('details', 'Case type and category captured', A.details),
  step('answer', answer),
  step('anything', '“Is there anything else I can assist you with?”'),
  step('close', 'Closed as resolved on call (ROT)', A.closed),
];

const W = (key, title, owner, tatDays, steps, extra = {}) => ({ key, title, owner, tatDays, steps, ...extra });

// Most specific match wins: sub-category, then category, then case type.
export const WORKFLOWS = [
  // ----- Inquiry -----
  W('inq-general', 'General query', 'careDesk', 0, answerPath('Answer from the SOP / FAQ (answers shown beside the case form)'), { match: { caseType: 'Inquiry', category: 'General Query' } }),
  W('inq-hr', 'HR & jobs enquiry', 'hr', 1, [
    step('identify', 'Identify the caller', A.member),
    step('details', 'Case type and details captured', A.details),
    step('answer', 'Share: apply at careers@cpwi.in (Yuktanshi.Srivastava@cpwi.in / Apoorv.Tyagi@cpwi.in)'),
    step('escalate', 'Forward to HR if the caller sent a CV or needs HR (optional)', A.escalated),
    step('close', 'Case closed', A.closed),
  ], { match: { caseType: 'Inquiry', category: 'HR or Jobs' } }),
  W('inq-it', 'IT / website enquiry', 'it', 1, escalationPath('the IT / Website team'), { match: { caseType: 'Inquiry', category: 'IT or Website' } }),
  W('inq-admin', 'Administration enquiry', 'admin', 1, escalationPath('Administration'), { match: { caseType: 'Inquiry', category: 'Admin Related' } }),
  W('inq-legal', 'Legal enquiry', 'admin', 1, escalationPath('Administration', [step('legal', 'Legal details recorded for the Legal team')]), { match: { caseType: 'Inquiry', category: 'Legal' }, note: 'Administration handles legal correspondence first.' }),
  W('inq-marketing', 'Marketing enquiry', 'marketing', 1, escalationPath('the Marketing team'), { match: { caseType: 'Inquiry', category: 'Marketing Related' } }),
  W('inq-festive', 'Festive gifting enquiry', 'marketing', 1, escalationPath('the Marketing team'), { match: { caseType: 'Inquiry', category: 'Festive Gifting' } }),
  W('inq-realestate', 'Real estate enquiry', 'admin', 1, escalationPath('Administration'), { match: { caseType: 'Inquiry', category: 'Real Estate' } }),

  // ----- Issues or Complaints - NR -----
  W('cmp-store', 'Store complaint', 'store', 1, escalationPath('the store contact', [
    step('store', 'Store of purchase recorded', A.store),
    step('bill', 'Bill / invoice number and purchase details taken', A.orderRef, 'Not always available: the store can verify'),
  ]), { match: { caseType: 'Issues or Complaints - NR', category: 'Store Related' }, requires: ['store'] }),
  W('cmp-app', 'App complaint', 'it', 1, escalationPath('the IT / Website team', [step('device', 'Note the registered mobile, device and error shown')]), { match: { caseType: 'Issues or Complaints - NR', category: 'App Related' } }),
  W('cmp-ecom', 'E-commerce complaint', 'ecom', 1, escalationPath('the E-commerce / App team', [
    step('order', 'App / website order number recorded', A.orderRef),
    step('status', 'Order status checked (dispatched / not dispatched)'),
  ]), { match: { caseType: 'Issues or Complaints - NR', category: 'ECommerce Related' }, requires: ['orderRef'] }),
  W('cmp-bda', 'BDA complaint', 'bda', 1, escalationPath('the BDA team', [step('bdaorder', 'BDA order details / BDA name recorded')]), { match: { caseType: 'Issues or Complaints - NR', category: 'BDA Related' } }),
  W('cmp-membership', 'Membership complaint', 'homeStore', 1, escalationPath("the member's home store"), { match: { caseType: 'Issues or Complaints - NR', category: ['Membership Related', 'Membership Related - NR'] } }),

  // ----- Requests -----
  W('req-membership', 'Membership request', 'homeStore', 1, escalationPath("the member's home store", [
    step('docs', 'Required documents received (see Request requirements)'),
  ]), { match: { caseType: 'Requests', category: 'Membership Related Request' } }),
  W('req-return', 'Return / exchange request', 'store', 1, escalationPath('the store contact', [
    step('store', 'Store of purchase recorded', A.store),
    step('policy', 'Return policy checked: 7 working days, original stamped bill, item returnable'),
  ]), { match: { caseType: 'Requests', subCategory: 'Return Of Goods' }, requires: ['store'] }),
  W('req-stock', 'Stock availability / price request', 'store', 1, escalationPath('the store team'), { match: { caseType: 'Requests', subCategory: ['Stock availability', 'Pricing issue'] } }),
  W('req-store', 'Store request', 'store', 1, escalationPath('the store contact', [step('store', 'Store recorded', A.store)]), { match: { caseType: 'Requests', category: 'Store Related Request' }, requires: ['store'] }),
  W('req-ecom', 'App / E-comm request', 'ecom', 1, escalationPath('the E-commerce / App team', [step('order', 'Order number recorded', A.orderRef)]), { match: { caseType: 'Requests', category: ['App Related Requests', 'E Commerce Related Request'] }, requires: ['orderRef'] }),
  W('req-bda', 'BDA request', 'bda', 1, escalationPath('the BDA team'), { match: { caseType: 'Requests', category: 'BDA Related REQUESTS' } }),
  W('req-new-member', 'New membership', 'careDesk', 0, answerPath('Explain: membership is free; visit the preferred store with a business licence (or supporting documents), PAN, Aadhaar, mobile and selfie'), { match: { caseType: 'Requests', category: 'New Member' } }),
  W('req-supplier', 'New supplier registration', 'supplier', 7, escalationPath('the Category / Supplier team', [step('docs', 'Company profile and product catalogue received')]), { match: { caseType: 'Requests', category: 'New Supplier' } }),
];

const DEFAULT = W('default', 'Standard case', 'store', 1, escalationPath('the store contact'), { match: {} });

const hit = (want, have) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);
const specificity = (m) => (m.subCategory ? 4 : 0) + (m.category ? 2 : 0) + (m.caseType ? 1 : 0);

/** The workflow for a case (or any object with caseType / category / subCategory). */
export function workflowFor(c) {
  if (!c?.caseType) return null;
  const found = WORKFLOWS.filter((w) => hit(w.match.caseType, c.caseType) && hit(w.match.category, c.category) && hit(w.match.subCategory, c.subCategory));
  return found.sort((a, b) => specificity(b.match) - specificity(a.match))[0] || DEFAULT;
}

/** Steps with their state: done (auto or ticked), and which one is next. */
export function workflowSteps(c, wf = workflowFor(c)) {
  if (!wf) return [];
  const ticks = c.checklist || {};
  let nextFound = false;
  return wf.steps.map((s) => {
    const autoDone = s.auto ? s.auto(c) : false;
    const tick = ticks[s.id];
    const done = autoDone || Boolean(tick?.done);
    const isNext = !done && !nextFound && !c.status?.startsWith('Closed');
    if (isNext) nextFound = true;
    return { ...s, done, auto: Boolean(s.auto), by: tick?.by, at: tick?.at, isNext };
  });
}

const REQ_LABEL = { store: 'the store', orderRef: 'the order / invoice number' };

/** What must be on the case before it can be escalated under its workflow (null = ok). */
export function escalationBlocker(c) {
  const wf = workflowFor(c);
  if (!wf) return null;
  if (wf.owner === 'careDesk') return null; // agent may still escalate to the case's store
  for (const r of wf.requires || []) if (!String(c[r] || '').trim()) return `${wf.title}: record ${REQ_LABEL[r] || r} before escalating.`;
  return null;
}

/** Where an escalation goes: { kind: 'store'|'team', code, name, email, phone }. */
export function escalationTarget(c, stores = [], teams = {}, members = []) {
  const wf = workflowFor(c) || DEFAULT;
  let owner = wf.owner;
  if (owner === 'careDesk') owner = 'store'; // care-desk cases that still need escalating go to the store
  if (owner === 'store' || owner === 'homeStore') {
    const code = owner === 'homeStore' ? members.find((m) => m.id === c.memberId)?.homeStore || c.store : c.store;
    const s = stores.find((x) => x.code === code);
    return { kind: 'store', code: code || '', name: s ? `${s.code} ${s.name}` : 'Store (not set)', email: s?.spocEmail || '', phone: s?.spocPhone || '', contact: s?.spocName || '' };
  }
  const t = { ...TEAMS[owner], ...(teams[owner] || {}) };
  return { kind: 'team', code: owner, name: t.name, email: t.email || '', phone: t.phone || '', contact: t.contact || '' };
}
