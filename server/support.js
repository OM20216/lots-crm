// The support button: answers questions about the CRM from the help articles (src/supportKb.js) and,
// when it cannot answer, creates a support token so the agent can chat with the help desk manager.
import * as store from './db.js';
import * as mail from './mail.js';
import * as teams from './teams.js';
import * as auto from './automation.js';
import { SUPPORT_ARTICLES, SUGGESTED, matchArticle, relatedArticles } from '../src/supportKb.js';

const db = () => store.get();
const save = () => store.save();
const now = () => new Date().toISOString();

// managerEmail = the support email (To of every new token); clientCc = fixed addresses copied on it (e.g. a LOTS
// supervisor). The agent who raised the token is copied too, from their email in Stores & settings → Agents.
const DEFAULTS = { managerEmail: '', clientCc: '', teamsNotify: true };
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i;
const emails = (v) => [...new Set(String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean))];

/** Support settings (Stores & settings → Support): who gets the token, who is copied, and whether Teams is told too. */
export function settings() {
  return { ...DEFAULTS, ...(db().settings?.support || {}) };
}

export function updateSettings(patch) {
  const fail = (message) => Object.assign(new Error(message), { status: 400 });
  const d = db();
  d.settings ||= {};
  const next = { ...settings() };
  if ('managerEmail' in patch) next.managerEmail = String(patch.managerEmail || '').trim();
  if ('clientCc' in patch) next.clientCc = emails(patch.clientCc).join(', ');
  if ('teamsNotify' in patch) next.teamsNotify = Boolean(patch.teamsNotify);
  const bad = [...emails(next.managerEmail), ...emails(next.clientCc)].find((e) => !EMAIL.test(e));
  if (bad) throw fail(`Not a valid email: ${bad}`);
  d.settings.support = next;
  save();
  return settings();
}

/** Who a token's email goes to: To = the support email, Cc = the agent who raised it + the fixed client copy. */
export function recipients(ticket) {
  const s = settings();
  const to = emails(s.managerEmail);
  const agent = String(db().agentEmails?.[ticket.agent] || '').trim();
  const cc = [...(EMAIL.test(agent) ? [agent] : []), ...emails(s.clientCc)].filter((e, i, a) => !to.some((t) => t.toLowerCase() === e.toLowerCase()) && a.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === i);
  return { to, cc, agentEmail: EMAIL.test(agent) ? agent : '' };
}

// ---------- answers ----------

/** The answer to a question, or null when the articles do not cover it. */
export function answer(question) {
  const m = matchArticle(question);
  if (!m) return null;
  return { id: m.article.id, title: m.article.title, text: m.article.answer, matched: m.matched };
}

/** One article in full (the support button shows the topics as a list). */
export function article(id) {
  const a = SUPPORT_ARTICLES.find((x) => x.id === id);
  return a ? { id: a.id, title: a.title, text: a.answer } : null;
}

/** What the support button shows on open: a greeting, the suggested questions and the article list. */
export function overview() {
  return {
    suggested: SUGGESTED,
    articles: SUPPORT_ARTICLES.map((a) => ({ id: a.id, title: a.title })),
    managerEmail: settings().managerEmail,
    managerKnown: Boolean(settings().managerEmail) || teams.configured(),
  };
}

/** The articles closest to a question (for "did you mean"). */
export function related(question, limit = 3) {
  return relatedArticles(question, limit);
}

// ---------- support tokens ----------

export function tickets() {
  const d = db();
  d.supportTickets ||= [];
  return d.supportTickets;
}

const clean = (v, n = 400) => String(v || '').trim().slice(0, n);

export function findTicket(id) {
  return tickets().find((t) => t.id === id);
}

/**
 * Create a support token (SUP-000123) for the help desk manager and tell them about it.
 * @param o.question  what the agent asked
 * @param o.agent     who asked
 * @param o.context   where it came from ({ page, caseId })
 */
export async function createTicket({ question, agent, context } = {}) {
  const q = clean(question, 1000);
  if (!q) {
    const err = new Error('Type your question first');
    err.status = 400;
    throw err;
  }
  const d = db();
  d.supportTickets ||= [];
  const ticket = {
    id: store.nextId('support', 'SUP-', 6),
    question: q,
    agent: clean(agent || 'Unknown', 80),
    status: 'Open',
    createdAt: now(),
    updatedAt: now(),
    context: {
      page: clean(context?.page, 120),
      caseId: clean(context?.caseId, 20),
    },
    replies: [],
    notified: {},
  };
  d.supportTickets.push(ticket);
  save();
  await notifyManager(ticket);
  return ticket;
}

/** The help desk manager: an email to the configured address and a card in Teams. */
async function notifyManager(ticket) {
  const s = settings();
  const notified = {};
  const { to: supportTo, cc, agentEmail } = recipients(ticket);

  if (supportTo.length) {
    const subject = `Support token ${ticket.id}: ${ticket.question.slice(0, 120)}`;
    const body = [
      `Hi,`,
      ``,
      `An agent on the LOTS CRM needs help and has raised a support token.`,
      ``,
      [
        `Token: ${ticket.id}`,
        `Raised by: ${ticket.agent}${agentEmail ? ` (${agentEmail})` : ''}`,
        `Raised at: ${new Date(ticket.createdAt).toLocaleString('en-IN')}`,
        ticket.context?.page ? `Page: ${ticket.context.page}` : null,
        ticket.context?.caseId ? `Case: ${ticket.context.caseId}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      ``,
      `Question:\n${ticket.question}`,
      ``,
      `Reply in the CRM: Admin → Support tokens (the agent sees the answer in the support panel).`,
      ``,
      `Regards,\nLOTS CRM support`,
    ].join('\n');

    // sent straight from the mailbox (not through the email preview mode — the support team has to get it);
    // test mode: only to the test address
    const test = auto.settings().mailTestTo;
    const d = db();
    d.outbox ||= [];
    const entry = {
      id: store.nextId('mail', 'OUT-', 6),
      at: now(),
      to: supportTo.join(', '),
      cc: cc.join(', '),
      subject: test ? `[TEST] ${subject}` : subject,
      body,
      caseId: null,
      kind: 'Support token',
      by: ticket.agent,
      status: 'sending',
      test: test || undefined,
    };
    d.outbox.push(entry);
    if (d.outbox.length > 2000) d.outbox = d.outbox.slice(-2000);
    try {
      if (!mail.configured()) throw new Error('Mailbox not connected');
      await mail.send({ to: test || supportTo, cc: test ? [] : cc, subject: entry.subject, html: auto.brandedHtml(body, null) });
      entry.status = 'sent';
      notified.email = 'sent';
    } catch (e) {
      entry.status = 'failed';
      entry.error = e.message;
      notified.email = 'failed';
      notified.emailError = e.message;
    }
    notified.emailTo = entry.to;
    notified.emailCc = entry.cc;
    save();
  }

  if (s.teamsNotify && teams.configured()) {
    try {
      await teams.postCard({
        title: `🆘 Support token ${ticket.id}`,
        subtitle: `${ticket.agent} · ${new Date(ticket.createdAt).toLocaleString('en-IN')}`,
        facts: [
          ['Agent', ticket.agent],
          ['Page', ticket.context?.page || ''],
          ['Case', ticket.context?.caseId || ''],
          ['Email to', notified.emailTo || ''],
          ['Cc', notified.emailCc || ''],
        ],
        lines: [ticket.question, 'Reply in the CRM: Admin → Support tokens.'],
      });
      notified.teams = 'sent';
    } catch (e) {
      notified.teams = 'failed';
      notified.teamsError = e.message;
    }
  }

  ticket.notified = notified;
  ticket.updatedAt = now();
  if (notified.email === 'failed') {
    ticket.warning = `The email to the support address failed (${notified.emailError || 'unknown error'}). The token is saved — the answer can still be given in Admin → Support tokens.`;
  } else if (notified.email !== 'sent' && notified.teams !== 'sent') {
    ticket.warning = 'Nobody was notified — no support email (Stores & settings → Support) and Teams is not connected.';
  } else delete ticket.warning;
  // the agent is copied on the email only when their email is saved (Stores & settings → Agents)
  if (notified.email === 'sent' && !agentEmail) ticket.warning = `You were not copied on the email: your email is not saved (Stores & settings → Agents).`;
  save();
  return notified;
}

/**
 * A message on a token — the chat between the agent and the help desk manager.
 * from 'manager': the answer (status Answered); from 'agent': the agent writes back (status Open again, the manager
 * is told in Teams). A closed token takes no more messages.
 */
export function replyTicket(id, text, by, from = 'manager') {
  const t = findTicket(id);
  if (!t) {
    const err = new Error('Support token not found');
    err.status = 404;
    throw err;
  }
  if (t.status === 'Closed') {
    const err = new Error(`${t.id} is closed — ask again to open a new token`);
    err.status = 400;
    throw err;
  }
  const body = clean(text, 2000);
  if (!body) {
    const err = new Error(from === 'agent' ? 'Write your message first' : 'Write the answer first');
    err.status = 400;
    throw err;
  }
  t.replies.push({ at: now(), by: clean(by || (from === 'agent' ? t.agent : 'Help desk'), 80), text: body, from });
  t.status = from === 'agent' ? 'Open' : 'Answered';
  t.updatedAt = now();
  save();
  if (from === 'agent' && settings().teamsNotify && teams.configured())
    teams.postCard({ title: `💬 ${t.agent} wrote on ${t.id}`, subtitle: t.question.slice(0, 200), lines: [body, 'Reply in the CRM: Admin → Support tokens.'] }).catch(() => {});
  return t;
}

export function closeTicket(id, by) {
  const t = findTicket(id);
  if (!t) {
    const err = new Error('Support token not found');
    err.status = 404;
    throw err;
  }
  t.status = 'Closed';
  t.closedAt = now();
  t.closedBy = clean(by || 'Help desk', 80);
  t.updatedAt = now();
  save();
  return t;
}

/** Remove a token (the manager does not want it in the list). */
export function deleteTicket(id) {
  const d = db();
  const before = (d.supportTickets || []).length;
  d.supportTickets = (d.supportTickets || []).filter((t) => t.id !== id);
  if (d.supportTickets.length === before) {
    const err = new Error('Support token not found');
    err.status = 404;
    throw err;
  }
  save();
  return { ok: true };
}

/** Open tokens first, then the newest. */
export function listTickets() {
  return [...tickets()].sort((a, b) => {
    const open = (t) => (t.status === 'Open' || t.status === 'Answered' ? 0 : 1);
    return open(a) - open(b) || b.createdAt.localeCompare(a.createdAt);
  });
}
