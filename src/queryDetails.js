// "The Details of the Query" — the block LOTS's Vtiger put in every email to a store / team (user's sample, 22 Oct 2026).
// Plain text: a "Label<TAB>value" line is one row of the details table (the HTML email and the Teams card show
// those lines as a table); blank lines separate the groups. Empty values show as "—".

export const DETAILS_HEADING = 'The Details of the Query are:\n____________';

const v = (x) => (x == null || String(x).trim() === '' ? '—' : String(x).trim());
const row = (label, value) => `${label}\t${v(value)}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const money = (n) => (n === '' || n == null || isNaN(Number(n)) ? '' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/**
 * The details block of a case.
 * @param c        the case
 * @param o.level  escalation level name ("First Time Resolution", "Level 1", "Level 2")
 * @param o.member the contact record (membership ID, business city, segments), if the caller is a known contact
 * @param o.store  the case's store record ({ code, name, short })
 * @param o.emailContent  the customer's email (email cases)
 */
export function queryDetails(c, { level, member, store, emailContent } = {}) {
  const files = (c.attachments || []).map((a) => a.name || a.file).filter(Boolean);
  return [
    `Escalation Level: ${v(level)}`,
    [
      row('Case Number', c.id),
      row('Contact Name', c.name || member?.ownerName),
      row('Contact Type', c.callerType),
      row('Membership ID', member?.cardNo),
      row('Business Name', c.businessName || member?.businessName),
      row('Business City', member?.businessCity),
      row('Mobile', c.phone || member?.phone),
      row('Primary Email', c.email || member?.email),
    ].join('\n'),
    [row('Type of Customer (Segment1)', member?.customerGroup), row('Type of Business (Segment2)', member?.customerType)].join('\n'),
    [
      row('Category', c.caseType),
      row('Case Category', c.category),
      row('Request For', c.requestFor),
      row('Issues (Sub 1)', c.subCategory),
      row('Sub Issue (Sub 2)', c.sub2),
      row('Store Name', store ? `${store.code} ${store.name}` : c.store === 'NS' ? 'Not Specific' : c.store),
    ].join('\n'),
    [
      'Invoice Details (If Any)',
      row('Date of Purchase', date(c.purchaseDate)),
      row('Invoice Number or Order ID', c.orderRef),
      row('Membership ID (As provided by Customer)', c.cardNo),
      row('Purchase Amount', money(c.purchaseAmount)),
      row('Amount To be Refunded', money(c.refundAmount)),
    ].join('\n'),
    `Complaint Details (if Any): ${v(c.description)}`,
    `Email Content:\n\n${v(emailContent)}`,
    `NOTE: ${files.length ? `attachments (attached to this email): ${files.join(', ')}` : 'no attachments on this case'}`,
  ].join('\n\n');
}
