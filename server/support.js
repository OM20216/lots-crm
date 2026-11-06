// The support button: answers questions about the CRM from the local help articles (src/supportKb.js)
// and, when it cannot answer, raises a support token.
//
// Tokens are NOT stored in the CRM database. They are owned by the standalone LOTS Support service
// (support-service/, its own process, port and JSON store), so tokens keep working when the CRM server,
// its build or MySQL is down. The CRM is only an API client of that service; the same service also
// serves the agent portal (/) and the manager desk (/admin).
import { SUPPORT_ARTICLES, SUGGESTED, matchArticle, relatedArticles } from '../src/supportKb.js';

const SERVICE_URL = (process.env.SUPPORT_SERVICE_URL || 'http://127.0.0.1:4100').replace(/\/$/, '');
const SERVICE_TOKEN = process.env.SUPPORT_SERVICE_TOKEN || '';
const SERVICE_TIMEOUT = 5000;

const DEFAULT_SETTINGS = { managerEmail: '', clientCc: '', teamsNotify: true };

function unavailable(detail) {
  const error = new Error(
    `The support service is not reachable at ${SERVICE_URL}.${detail ? ' ' + detail : ''} The help articles still work; open ${SERVICE_URL} to raise or read a support token.`
  );
  error.status = 503;
  error.serviceDown = true;
  return error;
}

/** Call the standalone support service as the CRM (full access). */
async function call(path, { method = 'GET', body } = {}) {
  if (!SERVICE_TOKEN) {
    const error = new Error(
      `The support service is not configured: add SUPPORT_SERVICE_URL and SUPPORT_SERVICE_TOKEN to the CRM secrets file (${SERVICE_URL} is the service).`
    );
    error.status = 503;
    error.serviceDown = true;
    throw error;
  }
  let res;
  try {
    res = await fetch(SERVICE_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-support-token': SERVICE_TOKEN },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(SERVICE_TIMEOUT),
    });
  } catch (e) {
    throw unavailable(e.name === 'TimeoutError' ? 'It did not answer within 5 seconds.' : e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `The support service returned HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// ---------- answers (local, work even when the support service is down) ----------

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

/** The articles closest to a question (for "did you mean"). */
export function related(question, limit = 3) {
  return relatedArticles(question, limit);
}

/**
 * What the support button shows on open: the suggested questions and the article list.
 * The manager-notification status comes from the support service; if it is down the answers still work.
 */
export async function overview() {
  const base = {
    suggested: SUGGESTED,
    articles: SUPPORT_ARTICLES.map((a) => ({ id: a.id, title: a.title })),
    managerEmail: '',
    managerKnown: false,
    teamsConfigured: false,
    service: 'down',
    portal: SERVICE_URL,
  };
  try {
    const s = await call('/api/overview');
    return {
      ...base,
      managerEmail: s.managerEmail || '',
      managerKnown: Boolean(s.managerKnown),
      teamsConfigured: Boolean(s.teamsConfigured),
      service: 'up',
    };
  } catch (e) {
    return { ...base, serviceError: e.message };
  }
}

// ---------- settings (owned by the support service) ----------

export async function settings() {
  try {
    const s = await call('/api/settings');
    return { ...DEFAULT_SETTINGS, ...s };
  } catch (e) {
    // Let the Settings page render and say the service is down, instead of failing the whole page.
    if (e.status === 503) return { ...DEFAULT_SETTINGS, teamsConfigured: false, serviceDown: true, serviceError: e.message };
    throw e;
  }
}

export async function updateSettings(patch = {}) {
  const body = {};
  if ('managerEmail' in patch) body.managerEmail = patch.managerEmail;
  if ('clientCc' in patch) body.clientCc = patch.clientCc;
  if ('teamsNotify' in patch) body.teamsNotify = patch.teamsNotify;
  const saved = await call('/api/settings', { method: 'PUT', body });
  return { ...DEFAULT_SETTINGS, ...saved };
}

// ---------- support tokens (stored by the standalone service) ----------

/** All tokens, open first then newest (the manager desk). */
export async function listTickets() {
  return call('/api/tickets');
}

/** One token, or null when it does not exist. */
export async function getTicket(id) {
  try {
    return await call('/api/tickets/' + encodeURIComponent(id));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/**
 * Create a support token (SUP-000123) in the support service. The service notifies the manager
 * (Teams webhook when configured) independently of the CRM mailbox.
 * @param o.question  what the agent asked
 * @param o.agent     who asked
 * @param o.context   where it came from ({ page, caseId })
 */
export async function createTicket({ question, agent, context } = {}) {
  return call('/api/tickets', {
    method: 'POST',
    body: { question, agent, context: context || {} },
  });
}

/**
 * A message on a token — the chat between the agent and the help desk manager.
 * from 'manager': the answer (status Answered); from 'agent': the agent writes back (status Open again).
 */
export async function replyTicket(id, text, by, from = 'manager') {
  return call('/api/tickets/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: { action: from === 'agent' ? 'message' : 'reply', reply: text, by },
  });
}

export async function closeTicket(id, by) {
  return call('/api/tickets/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: { action: 'close', by },
  });
}

/** Remove a token (the manager does not want it in the list). */
export async function deleteTicket(id) {
  return call('/api/tickets/' + encodeURIComponent(id), { method: 'DELETE' });
}

/** Open tokens, for the dashboard. A support-service outage must not break /stats. */
export async function openCount() {
  try {
    const list = await listTickets();
    return list.filter((t) => t.status !== 'Closed').length;
  } catch {
    return 0;
  }
}
