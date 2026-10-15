// Automatic workflow: categorise, assign, auto-reply, escalate by email, chase stores, remind, close, report.
// Every rule can be switched off in Settings → Automation. Everything it does is written to the activity log.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from './core.js';
import * as mail from './mail.js';
import * as store from './db.js';
import { EMAIL_TEMPLATES, fillTemplate } from '../src/knowledge.js';
import { extractRefs, missingInfo } from '../src/requirements.js';
import { workflowFor } from '../src/workflows.js';

const { db, save, now, log, on, applyStatus } = core;
const ATTACH_DIR = path.join(store.DATA_DIR, 'attachments');
const BOT = 'Automation';

export const SHIFTS = { '9-18': [9, 18], '10-19': [10, 19], '11-20': [11, 20], '12-21': [12, 21] };

export const DEFAULTS = {
  autoImport: true, // every new mail becomes a Pending case (SOP); off = agents log cases from the Email inbox
  mailTestTo: '', // test mode (like VMM's TEST_MODE): every outgoing email goes to this address instead
  autoCategorise: true,
  autoAssign: true,
  autoAck: true,
  autoAnswer: false, // SOP: call the customer before creating the case, so standard enquiries are not answered automatically
  autoEscalationEmail: true,
  autoStoreReplyResolve: true,
  autoResolutionEmail: true,
  autoConfirmationLead: true,
  autoInfoCheck: false, // SOP: the agent calls the customer before acting on an email case
  autoEscalateComplete: false,
  overdueReminder: true,
  l2Email: '',
  storeDigestTime: '10:00',
  waitingReminderHours: 48,
  supervisorEmail: '',
  dailyReportTime: '21:00',
};

const SETTINGS_VERSION = 3; // v2: auto-answer off · v3: no automatic info requests / escalation (SOP: call the customer first)

export function settings() {
  const d = db();
  const saved = d.settings?.automation;
  if (saved && (saved._v || 1) < SETTINGS_VERSION) {
    // settings saved before the SOP review: switch auto-answer off once; it can be switched on again on the Automation page
    const v = saved._v || 1;
    d.settings.automation = { ...saved, ...(v < 2 ? { autoAnswer: false } : {}), autoInfoCheck: false, autoEscalateComplete: false, _v: SETTINGS_VERSION };
    save();
  }
  return { ...DEFAULTS, ...(d.settings?.automation || {}) };
}

export function updateSettings(patch) {
  const d = db();
  d.settings ||= {};
  d.settings.automation = { ...settings(), _v: SETTINGS_VERSION };
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in patch)) continue;
    const def = DEFAULTS[k];
    d.settings.automation[k] = typeof def === 'boolean' ? Boolean(patch[k]) : typeof def === 'number' ? Math.max(0, Number(patch[k]) || 0) : String(patch[k] ?? '').trim();
  }
  if (patch.agentShifts && typeof patch.agentShifts === 'object') d.agentShifts = { ...(d.agentShifts || {}), ...patch.agentShifts };
  save();
  return settings();
}

export function activity(text, caseId) {
  const d = db();
  d.automationLog ||= [];
  d.automationLog.push({ at: now(), text, caseId: caseId || null });
  if (d.automationLog.length > 1000) d.automationLog = d.automationLog.slice(-1000);
}

// ---------- email out ----------
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

// LOTS-branded HTML around a plain-text message (like the VMM CRM's HTML emails).
export function brandedHtml(text, c) {
  const esc = mail.escapeHtml;
  const paras = String(text || '')
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const rows = c
    ? [
        ['Case number', c.id],
        ['Concern', [c.caseType, c.category, c.subCategory].filter(Boolean).join(' › ')],
        ['Status', c.status === 'Resolved' ? 'Resolution shared' : c.status],
      ].filter(([, v]) => v)
    : [];
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1d2230;max-width:640px;margin:0 auto">
  <div style="background:#d7141a;padding:16px 24px;border-radius:8px 8px 0 0">
    <div style="color:#fecaca;font-size:11px;letter-spacing:.08em;text-transform:uppercase">LOTS Wholesale Solutions</div>
    <div style="color:#ffffff;font-size:17px;font-weight:bold">Customer Care</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px">
    ${paras}
    ${rows.length ? `<table style="border-collapse:collapse;margin-top:8px;font-size:13px">${rows.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${esc(k)}</td><td style="padding:3px 0;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>` : ''}
  </div>
  <div style="padding:10px 24px;background:#f8fafc;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:11px;color:#6b7280">
    LOTS Wholesale Solutions · Customer care 1860-123-5687 · contactus@cpwi.in · Everyday 9 AM – 9 PM
  </div>
</div>`;
}

/**
 * Send (or, without a mail connection, record as not sent) and put it on the case timeline.
 * To the customer of an email case → a reply inside their own thread. Test mode → everything to the test address.
 */
export async function sendEmail({ to, cc = '', subject, body, caseId, kind, by = BOT, replyToId }) {
  const d = db();
  d.outbox ||= [];
  const c = caseId && core.findCase(caseId);
  const test = settings().mailTestTo;
  const entry = { id: store.nextId('mail', 'OUT-', 6), at: now(), to, cc, subject, body, caseId: caseId || null, kind, by, status: 'sending', test: test || undefined };
  d.outbox.push(entry);
  if (d.outbox.length > 2000) d.outbox = d.outbox.slice(-2000);

  // thread: the customer's latest mail on this case, unless a specific message is given
  const threadId = replyToId || (c && c.source?.lastInboundGraphId && String(to).toLowerCase() === String(c.email || '').toLowerCase() ? c.source.lastInboundGraphId : null);
  const finalTo = test || to;
  const finalCc = test ? '' : cc;
  const finalSubject = test ? `[TEST] ${subject}` : subject;
  const note = test ? `[TEST MODE — would have gone to ${to}${cc ? ', cc ' + cc : ''}]\n\n` : '';
  const html = brandedHtml(note + body, c);

  if (!mail.configured()) {
    entry.status = 'not sent';
    entry.error = 'Mailbox not connected';
  } else {
    try {
      if (threadId) {
        await mail.reply(threadId, { to: finalTo, cc: finalCc, subject: finalSubject, html });
        entry.inThread = true;
      } else await mail.send({ to: finalTo, cc: finalCc, subject: finalSubject, html });
      entry.status = 'sent';
    } catch (e) {
      // a deleted / moved original can't be replied to: fall back to a new email
      if (threadId) {
        try {
          await mail.send({ to: finalTo, cc: finalCc, subject: finalSubject, html });
          entry.status = 'sent';
        } catch (e2) {
          entry.status = 'failed';
          entry.error = e2.message;
        }
      } else {
        entry.status = 'failed';
        entry.error = e.message;
      }
    }
  }
  if (c) {
    const tag = entry.status === 'sent' ? `Email sent${entry.inThread ? ' (in the customer’s thread)' : ''}${test ? ' [TEST to ' + test + ']' : ''}` : `Email ${entry.status}${entry.error ? ' (' + entry.error + ')' : ''}`;
    log(c, { by, type: 'email-out', subject, text: `${tag} to ${to}${cc ? ' cc ' + cc : ''}\n\n${body}` });
  }
  save();
  return entry;
}

function template(id, c, extra = {}) {
  const t = EMAIL_TEMPLATES.find((x) => x.id === id);
  const vals = { ...c, ...extra };
  return { subject: fillTemplate(t.subject, vals, db().stores), body: fillTemplate(t.body, vals, db().stores) };
}

async function emailCustomer(c, templateId, kind, extra) {
  if (!validEmail(c.email)) {
    activity(`${kind}: skipped — no customer email on ${c.id}`, c.id);
    return null;
  }
  const t = template(templateId, c, extra);
  if (extra?.body) t.body = extra.body;
  return sendEmail({ to: c.email, ...t, caseId: c.id, kind });
}

// ---------- categorisation ----------
// First matching rule wins. `answer` = template sent automatically; `then` = status after answering.
const APP = /\b(app|application|website|site|online|order\s*(id|no|number)?|delivery boy)\b/i;
const RULES = [
  { name: 'Job enquiry', re: /\b(job|jobs|vacanc\w*|career|resume|cv|hiring|naukri|interview)\b/i, caseType: 'Inquiry', category: 'HR or Jobs', subCategory: '', answer: 'hr', then: 'Closed' },
  { name: 'Supplier registration', re: /\b(supplier|vendor|manufactur\w*|supply (our|my)|list (our|my) products?|distributorship)\b/i, caseType: 'Requests', category: 'New Supplier', subCategory: 'New Vendor - Supplier', answer: 'supplier', then: 'Waiting' },
  { name: 'Lost / block card', re: /(lost|block|stolen|misplace\w*).{0,25}card|card.{0,25}(lost|block|stolen|misplace)/i, caseType: 'Requests', category: 'Membership Related Request', subCategory: 'Re-issuing of Lost Card' },
  { name: 'Add-on card', re: /add[\s-]?on card|additional card|secondary card/i, caseType: 'Requests', category: 'Membership Related Request', subCategory: 'Add-On Cards' },
  { name: 'Change mobile', re: /(change|update|modify).{0,30}(mobile|phone|contact) ?(no|number)?/i, caseType: 'Requests', category: 'Membership Related Request', subCategory: 'Operational issues' },
  { name: 'Change address', re: /(change|update|modify).{0,30}address/i, caseType: 'Requests', category: 'Membership Related Request', subCategory: 'Address updation' },
  { name: 'Cancel order', re: /cancel.{0,25}order|order.{0,25}cancel/i, caseType: 'Requests', category: 'E Commerce Related Request', subCategory: 'Operational issues' },
  { name: 'Refund', re: /\brefund\b|money (not|nahi) (received|aaya)|amount debited/i, caseType: 'Issues or Complaints - NR', category: 'ECommerce Related', subCategory: '' },
  { name: 'Login / OTP', re: /\b(otp|log ?in|sign ?in|password)\b/i, caseType: 'Issues or Complaints - NR', category: 'App Related', subCategory: '' },
  { name: 'App not working', re: /(app|website|site).{0,25}(not (working|opening|loading)|down|error|crash)/i, caseType: 'Issues or Complaints - NR', category: 'App Related', subCategory: '' },
  { name: 'BDA', re: /\bbda\b|sales ?(man|person|representative)|field (staff|executive)/i, caseType: 'Issues or Complaints - NR', category: 'BDA Related', subCategory: '' },
  { name: 'Late delivery', re: /(not (yet )?(delivered|received)|late delivery|delay\w*|still waiting).{0,40}(order|delivery|goods)?/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Incomplete delivery', re: /(incomplete|missing|short) (order|delivery|items?|quantity)/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Wrong product', re: /(wrong|different|incorrect) (product|item|article)/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Expiry', re: /expir\w*|near.?expiry|stale|rotten|fungus|spoil\w*/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Quality', re: /(bad|poor|damaged|broken|leak\w*|kharab) (quality|product|item|packet|pack)|quality issue/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Overcharged / price', re: /overcharg\w*|extra (charged|amount)|price (mismatch|difference|different)|charged more|mrp/i, app: ['ECommerce Related', ''], shop: ['Store Related', ''], caseType: 'Issues or Complaints - NR' },
  { name: 'Staff behaviour', re: /\b(rude|misbehav\w*|behaviou?r|arrogant|shout\w*|abus\w*)\b/i, caseType: 'Issues or Complaints - NR', category: 'Store Related', subCategory: '' },
  { name: 'Freebie / coupon', re: /(freebie|free (gift|item)|coupon|voucher).{0,30}(not|nahi)|(not|didn.?t) (get|receive).{0,20}(freebie|free|coupon|voucher)/i, caseType: 'Issues or Complaints - NR', category: 'Store Related', subCategory: '' },
  { name: 'Invoice copy', re: /(invoice|bill).{0,25}(copy|reissue|re-issue|again|resend|duplicate)|(copy|duplicate) (of )?(invoice|bill)/i, caseType: 'Requests', category: 'Store Related Request', subCategory: 'Payment or invoice' },
  { name: 'GST', re: /\bgst(in)?\b/i, caseType: 'Requests', category: 'Store Related Request', subCategory: 'Payment or invoice' },
  { name: 'Return / exchange', re: /\b(return|exchange|replace\w*)\b/i, caseType: 'Requests', category: 'Store Related Request', subCategory: 'Return Of Goods' },
  { name: 'Bulk booking', re: /\b(bulk|wholesale quantity|regular supply|book (the )?products?)\b/i, caseType: 'Requests', category: 'Store Related Request', subCategory: 'Stock availability' },
  { name: 'Privilege card', re: /privilege/i, caseType: 'Inquiry', category: 'General Query', subCategory: '' },
  { name: 'New membership', re: /\b(new membership|become a member|membership (card|registration|process)|register|registration|membership)\b/i, caseType: 'Requests', category: 'New Member', subCategory: 'New Member - Customer', answer: 'membership', then: 'Closed', onlyNonMember: true },
  { name: 'Offers', re: /\b(offers?|scheme|discount|sale)\b/i, caseType: 'Inquiry', category: 'General Query', subCategory: '' },
  { name: 'Delivery enquiry', re: /delivery (charge|fee|time|timing)|minimum order|\bmov\b|handling fee/i, caseType: 'Inquiry', category: 'General Query', subCategory: '' },
  { name: 'Store timings / address', re: /\b(timing|timings|open|closing time|sunday|address|location|where is)\b/i, caseType: 'Inquiry', category: 'General Query', subCategory: '' },
];

const STORE_WORDS = [
  ['101', /\b(nsp|netaji|subhash place|pitampura)\b/i],
  ['102', /\b(ithum|sector[- ]?62)\b/i],
  ['103', /\b(akd|akshardham|parsvnath)\b/i],
  ['104', /\b(srv|sarita vihar|mohan estate)\b/i],
  ['105', /\b(duhai|ghaziabad|gzb)\b/i],
  ['106', /\b(gni|greater noida|knowledge park)\b/i],
];

export function classify(text, { isMember } = {}) {
  const out = {};
  for (const r of RULES) {
    if (r.onlyNonMember && isMember) continue;
    if (!r.re.test(text)) continue;
    const pair = r.app ? (APP.test(text) ? r.app : r.shop) : [r.category, r.subCategory];
    Object.assign(out, { rule: r.name, caseType: r.caseType, category: pair[0], subCategory: pair[1], answer: r.answer, then: r.then });
    break;
  }
  const st = STORE_WORDS.find(([, re]) => re.test(text));
  if (st) out.store = st[0];
  return out.rule || out.store ? out : null;
}

// ---------- assignment ----------
function onShift(name, date = new Date()) {
  const shift = SHIFTS[(db().agentShifts || {})[name]];
  const h = date.getHours();
  if ((db().agentShifts || {})[name] === 'Off') return false;
  const [start, end] = shift || [9, 21]; // no shift set → any process hour
  return h >= start && h < end;
}

export function pickAgent() {
  const d = db();
  const agents = d.agents.filter((a) => onShift(a));
  if (!agents.length) return '';
  const load = (a) => d.cases.filter((c) => c.assignedTo === a && c.status !== 'Closed').length + d.missedCalls.filter((m) => m.assignedTo === a && m.status === 'Open').length;
  d.automationState ||= {};
  const last = (d.automationState.lastAssigned ||= {});
  const pick = [...agents].sort((a, b) => load(a) - load(b) || (last[a] || '').localeCompare(last[b] || ''))[0];
  last[pick] = now();
  return pick;
}

// ---------- event hooks ----------
const isBot = (e) => /no-?reply|mailer-daemon|postmaster|notification/i.test(e || '');
const isAutoReply = (s) => /^(automatic reply|auto[- ]?reply|out of (the )?office|undeliverable|delivery status)/i.test(s || '');

async function onCaseCreated({ c }) {
  const s = settings();
  if (c.channel === 'Email' && c.createdBy !== 'System') {
    // Logged by an agent on the New Case page: the agent already categorised it and chose the outcome.
    if (s.autoAck && !isBot(c.email)) await emailCustomer(c, 'ack', 'Acknowledgement');
    return;
  }
  if (c.channel === 'Email') {
    if (s.autoCategorise && !c.caseType) {
      const r = classify(`${c.subject}\n${c.description}`, { isMember: Boolean(c.memberId) });
      if (r) {
        for (const k of ['caseType', 'category', 'subCategory']) if (r[k] && !c[k]) c[k] = r[k];
        if (r.store) c.store = r.store; // store named in the mail
        log(c, { by: BOT, type: 'edit', text: `Auto-categorised${r.rule ? ` (${r.rule})` : ''}: ${[c.caseType, c.category, c.subCategory].filter(Boolean).join(' › ') || '—'}${r.store ? ` · store ${r.store}` : ''}` });
        activity(`Categorised ${c.id} as ${r.rule || 'store ' + r.store}`, c.id);
        c.auto = r;
      }
    }
    if (s.autoAssign && !c.assignedTo) assign(c);
    save();
    if (isBot(c.email) || isAutoReply(c.subject)) return activity(`No auto-reply for ${c.id}: automated sender`, c.id);

    if (s.autoAnswer && c.auto?.answer) {
      const sent = await emailCustomer(c, c.auto.answer, 'Auto-answer');
      if (sent?.status === 'sent' && c.auto.then) {
        try {
          applyStatus(c, c.auto.then, BOT, `Standard answer sent automatically (${c.auto.rule})`);
          save();
        } catch (e) {
          activity(`Could not move ${c.id} to ${c.auto.then}: ${e.message}`, c.id);
        }
      }
      return;
    }
    const step = await infoStep(c);
    if (s.autoAck && step !== 'requested') await emailCustomer(c, 'ack', 'Acknowledgement');
    return;
  }
  if (s.autoAssign && !c.assignedTo) {
    assign(c);
    save();
  }
}

/**
 * Who an escalated case is with: the store's SPOC or a team (E-commerce, IT, BDA, …),
 * per the case type's workflow. Contact details are read fresh, so a team email
 * added later in Settings is used by follow-ups too.
 */
function recipient(c) {
  const t = c.escalatedTo || { kind: 'store', code: c.store };
  if (t.kind === 'team') {
    const team = core.teams()[t.code] || {};
    return { key: `team:${t.code}`, label: team.name || t.name || t.code, email: team.email || t.email || '', contact: team.contact || '' };
  }
  const st = db().stores.find((x) => x.code === (t.code || c.store));
  return { key: `store:${st?.code || c.store}`, label: st ? `store ${st.short || st.code}` : `store ${c.store}`, email: st?.spocEmail || '', contact: st?.spocName || '' };
}

function assign(c) {
  const a = pickAgent();
  if (!a) return activity(`${c.id} left unassigned — no agent on shift`, c.id);
  c.assignedTo = a;
  log(c, { by: BOT, type: 'edit', text: `Assigned to ${a}` });
  activity(`Assigned ${c.id} to ${a}`, c.id);
}

async function onStatus({ c, from, to, by, note }) {
  const s = settings();

  if (to === 'Escalated' && s.autoEscalationEmail) {
    const r = recipient(c);
    if (r.email) {
      const t = template('escalate', c);
      if (r.contact) t.body = t.body.replace(/^Dear [^,\n]*,/, `Dear ${r.contact},`);
      const tat = workflowFor(c)?.tatDays || 1;
      if (tat !== 1) t.body = t.body.replace('the TAT for Level 1 is 1 working day', `the TAT for this case is ${tat} working days`);
      if (note) t.body = t.body.replace('\n\nAs per the escalation matrix', `\nAction needed: ${note}\n\nAs per the escalation matrix`);
      await sendEmail({ to: r.email, subject: t.subject, body: t.body, caseId: c.id, kind: `Escalation to ${r.label}` });
    } else activity(`Escalation email for ${c.id} not sent — ${r.label} has no email (Stores & settings)`, c.id);
  }

  if (to === 'Resolved') {
    if (s.autoResolutionEmail) {
      // an agent's note is the resolution; when automation moved it, quote the store's reply
      const resolution = (by !== BOT && note) || lastStoreReply(c) || 'Our store team has addressed your concern.';
      const t = template('resolved', c);
      await emailCustomer(c, 'resolved', 'Resolution', { body: t.body.replace('[Resolution details]', resolution) });
    }
    if (s.autoConfirmationLead && c.phone && !db().leads.some((l) => l.caseId === c.id && ['New', 'Call back', 'Not reachable'].includes(l.status))) {
      const l = {
        id: store.nextId('lead', 'LD-', 5),
        createdAt: now(),
        type: 'Confirmation / resolution',
        name: c.name,
        businessName: c.businessName,
        phone: c.phone,
        store: c.store,
        notes: `Confirm resolution of ${c.id}: ${[c.category, c.subCategory].filter(Boolean).join(' › ')}`,
        caseId: c.id,
        status: 'New',
        callbackAt: null,
        assignedTo: c.assignedTo || '',
        log: [],
      };
      db().leads.push(l);
      activity(`Confirmation call ${l.id} queued for ${c.id}`, c.id);
    }
  }

  if (to === 'Closed') {
    for (const l of db().leads.filter((l) => l.caseId === c.id && ['New', 'Call back', 'Not reachable'].includes(l.status))) {
      l.status = 'Case closed';
      l.log.push({ at: now(), by: BOT, outcome: 'Case closed', note: `${c.id} closed` });
    }
  }
  save();
}

function lastStoreReply(c) {
  const e = [...c.timeline].reverse().find((t) => t.type === 'email-in' && core.storeForSender(t.from));
  return e?.text?.split(/\n-{2,}|\nFrom:|\nOn .+ wrote:/)[0].trim().slice(0, 1500);
}

function onThreaded({ c, staff, fromEmail, body, hasAttachments }) {
  if (staff && c.status === 'Escalated' && settings().autoStoreReplyResolve) {
    applyStatus(c, 'Resolved', BOT, `Store replied by email (${fromEmail})`);
    activity(`${c.id} moved to Resolved — store replied`, c.id);
    return;
  }
  if (staff) return;
  activity(`Customer replied on ${c.id} (${c.status})`, c.id);
  // Reply to an "information required" email: read what they sent and check again.
  if (c.status === 'Waiting' && c.infoRequests) {
    if (hasAttachments) c.source.hasAttachments = true;
    const refs = extractRefs(body);
    if (refs.orderRef && !c.orderRef) c.orderRef = refs.orderRef;
    if (refs.cardNo && !c.cardNo) c.cardNo = refs.cardNo;
    const phone = (String(body).match(/(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})/) || [])[1];
    if (phone && !c.phone) c.phone = phone.replace(/\D/g, '');
    const st = classify(body)?.store;
    if (st && !c.store) c.store = st;
    applyStatus(c, 'Pending', BOT, 'Customer replied — checking the information again');
    infoStep(c).catch((e) => console.error('[auto:info]', e));
  }
}

// "Information complete?" — complaints and requests only (enquiries are answered, not escalated).
// Returns 'requested' (asked the customer for missing items), 'escalated', or null (left for an agent).
const STORE_REQUIRED = ['Store Related', 'BDA Related', 'Store Related Request', 'BDA Related REQUESTS'];
async function infoStep(c) {
  const s = settings();
  if (!s.autoInfoCheck || !['Issues or Complaints - NR', 'Requests'].includes(c.caseType) || ['New Member', 'New Supplier'].includes(c.category)) return null;
  const missing = missingInfo(c);
  if (missing.length) {
    if ((c.infoRequests || 0) >= 2) {
      log(c, { by: BOT, type: 'note', text: `Still missing after 2 requests: ${missing.join('; ')} — left for an agent to call` });
      activity(`${c.id} still incomplete after 2 requests — needs an agent`, c.id);
      save();
      return null;
    }
    const body = `Dear ${c.name || 'Customer'},\n\nThank you for contacting LOTS Wholesale Solutions. Your concern is registered under reference ${c.id}.\n\nTo proceed, please reply to this email with the following:\n\n${missing.map((m) => '• ' + m).join('\n')}\n\nPlease keep the reference number in the subject line.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions\n1860-123-5687 | contactus@cpwi.in`;
    const sent = await emailCustomer(c, 'waiting', 'Information required', { body });
    if (sent?.status !== 'sent') return null; // customer was not told — keep it Pending for an agent
    c.infoRequests = (c.infoRequests || 0) + 1;
    applyStatus(c, 'Waiting', BOT, `Information required: ${missing.join('; ')}`);
    activity(`${c.id} incomplete — asked customer for ${missing.length} item(s)`, c.id);
    save();
    return 'requested';
  }
  if (!s.autoEscalateComplete) return null;
  if (!c.store && c.source?.homeStore && !STORE_REQUIRED.includes(c.category)) c.store = c.source.homeStore;
  if (!c.store) return null;
  applyStatus(c, 'Escalated', BOT, 'Information complete — escalated to the store automatically');
  activity(`${c.id} complete — escalated to store ${c.store}`, c.id);
  save();
  return 'escalated';
}

function onMissed({ m }) {
  if (!settings().autoAssign) return;
  m.assignedTo = pickAgent();
  if (m.assignedTo) activity(`Missed call ${m.id} (${m.phone}) assigned to ${m.assignedTo}`);
}

// ---------- mailbox polling ----------
// SOP: "Email needs to be checked in every 5 min". The scheduler ticks every minute
// for the other jobs, so the mailbox is throttled here; "Run now" passes force.
const MAIL_POLL_MS = 5 * 60 * 1000;
let polling = false;
let lastMailPollAt = 0;
export const mailState = { lastPoll: null, lastError: null, imported: 0 };

export async function pollMailbox(force = false) {
  if (!mail.configured() || polling) return mailState;
  if (!force && Date.now() - lastMailPollAt < MAIL_POLL_MS) return mailState;
  lastMailPollAt = Date.now();
  polling = true;
  try {
    // Like VMM: Graph delta query on the inbox; mail stays in the inbox and is tagged "LOTS CRM" + case number.
    // Only mail received after the mailbox was connected is picked up, so an existing inbox is not imported.
    const d = db();
    const ms = ((d.automationState ||= {}).mail ||= {});
    const connectedAt = mail.signinStatus().connectedAt || 'app';
    if (ms.connectedAt !== connectedAt) Object.assign(ms, { connectedAt, deltaLink: null, since: now() });
    let r = await mail.inboxDelta(ms.deltaLink, ms.since);
    if (r.reset) {
      ms.deltaLink = null;
      ms.since = mailState.lastPoll || now();
      r = await mail.inboxDelta(null, ms.since);
    }
    const own = mail.mailbox().toLowerCase();
    for (const m of r.messages) {
      if (m.fromEmail.toLowerCase() === own) continue; // our own replies
      if (core.caseForMessage(m)) continue; // already on a case (delta also returns changed mail, e.g. our tags)
      if (!settings().autoImport && !core.threadTarget(m)) continue; // new mail waits in the Email inbox for an agent
      await importMessage(m, 'Mailbox');
    }
    if (r.deltaLink) ms.deltaLink = r.deltaLink;
    mailState.lastError = null;
  } catch (e) {
    mailState.lastError = e.message;
    console.error('[mailbox]', e.message);
  } finally {
    mailState.lastPoll = now();
    polling = false;
    save();
  }
  return mailState;
}

/** One mailbox message → case (new, or added to its case), attachments saved, tagged in the mailbox. */
export async function importMessage(m, by) {
  const r = core.intakeEmail({ ...m, graphId: m.id }, by); // m.hasAttachments tells the info check files are coming
  if (m.hasAttachments) await saveAttachments(r.case, m.id).catch((e) => activity(`Attachments of ${r.case.id} not saved: ${e.message}`, r.case.id));
  await mail.setCategories(m.id, [...new Set([...(m.categories || []), 'LOTS CRM', r.case.id])]).catch(() => {});
  mailState.imported++;
  activity(`${r.threaded ? 'Reply added to' : 'New email case'} ${r.case.id} from ${m.fromEmail}`, r.case.id);
  save();
  return r;
}

async function saveAttachments(c, messageId) {
  const dir = path.join(ATTACH_DIR, c.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const a of await mail.fetchAttachments(messageId)) {
    const file = `${Date.now()}-${a.name.replace(/[^\w.\- ]+/g, '_')}`;
    fs.writeFileSync(path.join(dir, file), a.bytes);
    (c.attachments ||= []).push({ name: a.name, file, size: a.size, contentType: a.contentType, at: now() });
  }
  log(c, { by: 'Mailbox', type: 'note', text: `Attachments saved: ${c.attachments.map((x) => x.name).join(', ')}` });
}

export function attachmentPath(caseId, file) {
  const c = core.findCase(caseId);
  const a = c?.attachments?.find((x) => x.file === file);
  return a ? { path: path.join(ATTACH_DIR, c.id, a.file), name: a.name, contentType: a.contentType } : null;
}

// ---------- scheduled jobs ----------
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const timeReached = (hhmm) => {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() >= h * 60 + m;
};

async function overdueEscalations(s) {
  if (!s.overdueReminder) return;
  for (const c of db().cases.filter((c) => c.status === 'Escalated' && c.dueAt && c.dueAt < now())) {
    const r = recipient(c);
    const level = (c.escalationLevel || 1) + 1;
    c.escalationLevel = level;
    c.dueAt = core.addWorkingDays(now(), 1);
    log(c, { by: BOT, type: 'status', from: 'Escalated', to: 'Escalated', text: `TAT breached — escalation level ${level}` });
    activity(`${c.id} overdue with ${r.label} — level ${level}`, c.id);
    if (r.email) {
      await sendEmail({
        to: r.email,
        cc: s.l2Email,
        subject: `OVERDUE (Level ${level}): pending case ${c.id} – ${c.category} / ${c.subCategory}`,
        body: `Dear ${r.contact || 'Sir'},\n\nThe case below has crossed its TAT and is now at escalation level ${level}. Kindly share the resolution with customer care today.\n\nCase: ${c.id}\nCustomer: ${c.name} (${c.businessName || '—'}) · ${c.phone || c.email}\nConcern: ${c.caseType} – ${c.category} – ${c.subCategory}\nDetails: ${c.description}\nEscalated on: ${new Date(c.escalatedAt).toLocaleString('en-IN')}\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions`,
        caseId: c.id,
        kind: 'Overdue reminder',
      });
    }
  }
}

async function storeDigest(s) {
  const st8 = (db().automationState ||= {});
  if (!s.storeDigestTime || !timeReached(s.storeDigestTime) || st8.lastDigest === today()) return;
  st8.lastDigest = today();
  // one email per store / team holding escalated cases
  const groups = new Map();
  for (const c of db().cases.filter((c) => c.status === 'Escalated')) {
    const r = recipient(c);
    if (!groups.has(r.key)) groups.set(r.key, { r, list: [] });
    groups.get(r.key).list.push(c);
  }
  for (const { r, list } of groups.values()) {
    if (!r.email) continue;
    const lines = list.map((c) => `• ${c.id} | ${c.businessName || c.name} | ${c.subCategory || c.category} | escalated ${new Date(c.escalatedAt).toLocaleDateString('en-IN')}${c.dueAt < now() ? ' | OVERDUE' : ''}`);
    await sendEmail({
      to: r.email,
      cc: list.some((c) => c.dueAt < now()) ? s.l2Email : '',
      subject: `Pending customer cases – ${r.label} – ${new Date().toLocaleDateString('en-IN')}`,
      body: `Dear ${r.contact || 'Sir'},\n\nThe following customer cases are pending with your ${r.key.startsWith('team:') ? 'team' : 'store'}. We kindly request you to share an update on each at the earliest.\n\n${lines.join('\n')}\n\nAccording to the existing escalation matrix, the TAT for Level 1 is 1 working day.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions`,
      kind: 'Daily store follow-up',
    });
    for (const c of list) log(c, { by: BOT, type: 'store-followup', text: `Included in daily follow-up email to ${r.label}` });
  }
  save();
}

async function waitingCases(s) {
  for (const c of db().cases.filter((c) => c.status === 'Waiting')) {
    const age = hoursSince(c.statusAt || c.updatedAt);
    c.reminded ||= {};
    if (s.waitingReminderHours && age >= s.waitingReminderHours && !c.reminded.waiting) {
      c.reminded.waiting = now();
      await emailCustomer(c, 'waiting', 'Reminder for missing info', {
        body: `Dear ${c.name || 'Customer'},\n\nThis is a gentle reminder regarding your concern (ref. ${c.id}). We are still waiting for the details requested earlier so that we can proceed.\n\nPlease reply to this email keeping the reference number in the subject.\n\nRegards,\nCustomer Care – LOTS Wholesale Solutions\n1860-123-5687 | contactus@cpwi.in`,
      });
    }
  }
}

async function dailyReport(s) {
  const st8 = (db().automationState ||= {});
  if (!validEmail(s.supervisorEmail) || !timeReached(s.dailyReportTime) || st8.lastReport === today()) return;
  st8.lastReport = today();
  const d = db();
  const day = today();
  const isToday = (iso) => iso && new Date(iso).toLocaleDateString('en-CA') === day;
  const created = d.cases.filter((c) => isToday(c.createdAt));
  const closed = d.cases.filter((c) => isToday(c.closedAt));
  const count = (arr, k) => Object.entries(arr.reduce((a, x) => ((a[x[k] || '—'] = (a[x[k] || '—'] || 0) + 1), a), {})).map(([a, b]) => `  ${a}: ${b}`).join('\n') || '  —';
  const open = d.cases.filter((c) => c.status !== 'Closed');
  const missedToday = d.missedCalls.filter((m) => isToday(m.at));
  const body = [
    `Customer care summary – ${new Date().toLocaleDateString('en-IN')}`,
    '',
    `Cases created today: ${created.length}`,
    count(created, 'channel'),
    '',
    `By type:`,
    count(created, 'caseType'),
    '',
    `Closed today: ${closed.length} (ROT ${closed.filter((c) => c.resolutionType === 'ROT').length})`,
    `Open now: ${open.length} — ${['Pending', 'Waiting', 'Escalated', 'Resolved'].map((x) => `${x} ${open.filter((c) => c.status === x).length}`).join(' · ')}`,
    `Escalations overdue: ${open.filter((c) => c.status === 'Escalated' && c.dueAt < now()).length}`,
    `Missed calls today: ${missedToday.length} · still open ${missedToday.filter((m) => m.status === 'Open').length} · past 30-min TAT ${missedToday.filter((m) => (m.calledBackAt || now()) > m.dueAt).length}`,
    '',
    'Per agent (closed today / open assigned):',
    ...d.agents.map((a) => `  ${a}: ${closed.filter((c) => c.assignedTo === a).length} / ${open.filter((c) => c.assignedTo === a).length}`),
    '',
    'Escalated by store:',
    count(open.filter((c) => c.status === 'Escalated'), 'store'),
  ].join('\n');
  await sendEmail({ to: s.supervisorEmail, subject: `LOTS customer care – daily report ${new Date().toLocaleDateString('en-IN')}`, body, kind: 'Daily report' });
}

let ticking = false;
export async function tick(opts = {}) {
  if (ticking) return;
  ticking = true;
  const s = settings();
  try {
    await pollMailbox(!!opts.forceMail);
    await overdueEscalations(s);
    await waitingCases(s);
    await storeDigest(s);
    await dailyReport(s);
  } catch (e) {
    console.error('[automation]', e);
  } finally {
    ticking = false;
    save();
  }
}

export function start() {
  on('case:created', (p) => onCaseCreated(p).catch((e) => console.error('[auto:created]', e)));
  on('status', (p) => onStatus(p).catch((e) => console.error('[auto:status]', e)));
  on('email:threaded', onThreaded);
  on('missed:created', onMissed);
  setTimeout(tick, 5000);
  setInterval(tick, 60000);
}
