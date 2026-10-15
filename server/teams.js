// Microsoft Teams preview: every email the CRM would send is posted to a Teams channel instead
// (Power Automate "post to a channel when a webhook request is received" workflow).
// The workflow link carries a signature, so it lives only in the private secrets file: TEAMS_WEBHOOK_URL.

const url = () => process.env.TEAMS_WEBHOOK_URL || '';
export const configured = () => /^https:\/\//.test(url()) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url()); // plain http only for a local test

const MAX_LINES = 60;

/** Post an Adaptive Card with a title, facts (label → value) and text lines. */
export async function postCard({ title, subtitle, facts = [], lines = [] }) {
  if (!configured()) throw new Error('Teams is not connected (TEAMS_WEBHOOK_URL is not in the secrets file)');
  const shown = lines.slice(0, MAX_LINES);
  const body = [
    { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
    ...(subtitle ? [{ type: 'TextBlock', text: subtitle, isSubtle: true, spacing: 'None', wrap: true }] : []),
    ...(facts.length ? [{ type: 'FactSet', facts: facts.filter(([, v]) => v).map(([t, v]) => ({ title: t, value: String(v).slice(0, 500) })) }] : []),
    ...(shown.length ? [{ type: 'Container', style: 'emphasis', separator: true, items: shown.map((l, i) => ({ type: 'TextBlock', text: l.trim() ? l.slice(0, 1000) : ' ', wrap: true, spacing: i ? 'None' : 'Default' })) }] : []),
    ...(lines.length > MAX_LINES ? [{ type: 'TextBlock', text: `… ${lines.length - MAX_LINES} more line(s)`, isSubtle: true, wrap: true }] : []),
  ];
  const res = await fetch(url(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body } }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Teams returned ${res.status} ${res.statusText}`.trim());
  return true;
}

/** One would-be email as a Teams card, laid out like the real branded email. */
export async function postEmailPreview({ kind, to, cc, subject, paragraphs = [], rows = [], brand, footer, inThread, sample, attachments = [] }) {
  if (!configured()) throw new Error('Teams is not connected (TEAMS_WEBHOOK_URL is not in the secrets file)');
  const text = (t, extra = {}) => ({ type: 'TextBlock', text: String(t ?? ''), wrap: true, ...extra });
  // each line of a paragraph as its own block, so line breaks show exactly as in the email
  const paraBlocks = paragraphs.flatMap((p, i) => String(p).split('\n').map((line, j) => text(line.trim() ? line : ' ', { spacing: j ? 'None' : i ? 'Medium' : 'Default' })));
  const body = [
    // what Teams adds: this is a preview, and the envelope
    text(`👁️ EMAIL PREVIEW — NOT SENT${sample ? ' · SAMPLE' : ''}`, { size: 'Small', weight: 'Bolder', color: 'Warning', spacing: 'None' }),
    {
      type: 'FactSet',
      facts: [
        ['Type', kind],
        ['To', to || '(no address set)'],
        ['Cc', cc],
        ['Subject', subject],
        ['Thread', inThread ? 'Reply in the customer’s email thread' : ''],
        ['📎 Attached', attachments.join(', ')],
      ].filter(([, v]) => v).map(([t, v]) => ({ title: t, value: String(v).slice(0, 500) })),
    },
    // the email itself, as the recipient would see it
    {
      type: 'Container',
      style: 'attention',
      bleed: false,
      spacing: 'Medium',
      items: [text((brand?.top || 'LOTS Wholesale Solutions').toUpperCase(), { size: 'Small', spacing: 'None' }), text(brand?.title || 'Customer Care', { size: 'Medium', weight: 'Bolder', spacing: 'None' })],
    },
    { type: 'Container', spacing: 'None', items: paraBlocks.slice(0, 80) },
    ...(rows.length ? [{ type: 'FactSet', spacing: 'Medium', facts: rows.map(([t, v]) => ({ title: t, value: String(v) })) }] : []),
    { type: 'Container', style: 'emphasis', spacing: 'Medium', items: [text(footer || '', { size: 'Small', isSubtle: true })] },
  ];
  const res = await fetch(url(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', msteams: { width: 'Full' }, body } }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Teams returned ${res.status} ${res.statusText}`.trim());
  return true;
}
