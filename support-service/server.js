// LOTS Support - a standalone support-token service.
//
// It runs as its own process/task on its own port and keeps tokens in its own JSON store, so the
// support button's tokens still work when the CRM server, its build or its database is down.
// The CRM talks to it through the same API the two browser portals use.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { SUGGESTED, SUPPORT_ARTICLES, matchArticle, relatedArticles } from '../src/supportKb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const privateDir = path.join(os.homedir(), '.lots-crm');
const envFile = process.env.LOTS_SUPPORT_ENV || path.join(privateDir, 'support.env');
try {
  process.loadEnvFile(envFile);
} catch {
  /* defaults below */
}

const PORT = Number(process.env.SUPPORT_PORT) || 4100;
const HOST = process.env.SUPPORT_HOST || '0.0.0.0';
const AGENT_CODE = process.env.SUPPORT_AGENT_CODE || '';
const ADMIN_CODE = process.env.SUPPORT_ADMIN_CODE || '';
const SERVICE_TOKEN = process.env.SUPPORT_SERVICE_TOKEN || '';
const DATA_DIR = process.env.SUPPORT_DATA_DIR || path.join(privateDir, 'support');
const CRM_URL = (process.env.SUPPORT_CRM_URL || 'http://localhost:4000').replace(/\/$/, '');
const TEAMS_WEBHOOK = process.env.SUPPORT_TEAMS_WEBHOOK || '';

if (!AGENT_CODE || !ADMIN_CODE || !SERVICE_TOKEN) {
  console.error(`Missing access codes. Set SUPPORT_AGENT_CODE, SUPPORT_ADMIN_CODE and SUPPORT_SERVICE_TOKEN in ${envFile}`);
  process.exit(1);
}

const store = createStore(DATA_DIR);
const now = () => new Date().toISOString();
const clean = (v, n = 400) => String(v || '').trim().slice(0, n);
const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i;
const emails = (v) => [...new Set(String(v || '').split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean))];
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------- tickets ----------

function sortTickets(list) {
  const open = (t) => (t.status === 'Open' || t.status === 'Answered' ? 0 : 1);
  return [...list].sort((a, b) => open(a) - open(b) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function findTicket(id) {
  return store.tickets().find((t) => t.id === id);
}

export function ticketsFor(agent) {
  const list = agent ? store.tickets().filter((t) => String(t.agent).toLowerCase() === String(agent).toLowerCase()) : store.tickets();
  return sortTickets(list);
}

async function createTicket({ question, agent, context } = {}) {
  const q = clean(question, 1000);
  if (!q) throw httpError(400, 'Type your question first');
  const t = {
    id: store.nextId(),
    question: q,
    agent: clean(agent || 'Unknown', 80),
    status: 'Open',
    createdAt: now(),
    updatedAt: now(),
    context: { page: clean(context?.page, 120), caseId: clean(context?.caseId, 20) },
    replies: [],
    notified: {},
  };
  store.tickets().push(t);
  await store.save();
  notifyManager(t).catch((e) => console.error('[support] notify', e.message));
  return t;
}

async function replyTicket(id, text, by, from = 'manager') {
  const t = findTicket(id);
  if (!t) throw httpError(404, 'Support token not found');
  if (t.status === 'Closed') throw httpError(400, `${t.id} is closed - ask again to open a new token`);
  const body = clean(text, 2000);
  if (!body) throw httpError(400, from === 'agent' ? 'Write your message first' : 'Write the answer first');
  t.replies.push({ at: now(), by: clean(by || (from === 'agent' ? t.agent : 'Help desk'), 80), text: body, from });
  t.status = from === 'agent' ? 'Open' : 'Answered';
  t.updatedAt = now();
  await store.save();
  if (from === 'agent') notifyMessage(t, body).catch((e) => console.error('[support] notify', e.message));
  return t;
}

async function closeTicket(id, by) {
  const t = findTicket(id);
  if (!t) throw httpError(404, 'Support token not found');
  t.status = 'Closed';
  t.closedAt = now();
  t.closedBy = clean(by || 'Help desk', 80);
  t.updatedAt = now();
  await store.save();
  return t;
}

async function deleteTicket(id) {
  const list = store.tickets();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) throw httpError(404, 'Support token not found');
  list.splice(i, 1);
  await store.save();
  return { ok: true };
}

// ---------- notifications (independent of the CRM mailbox) ----------

async function postToTeams(payload) {
  if (!TEAMS_WEBHOOK) return { state: 'not configured' };
  const res = await fetch(TEAMS_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ '@type': 'MessageCard', '@context': 'https://schema.org/extensions', ...payload }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Teams returned HTTP ${res.status}`);
  return { state: 'sent' };
}

async function notifyManager(ticket) {
  const s = store.settings();
  const notified = {};
  if (s.teamsNotify && TEAMS_WEBHOOK) {
    try {
      await postToTeams({
        themeColor: 'D13438',
        summary: `Support token ${ticket.id}`,
        title: `Support token ${ticket.id}`,
        text: ticket.question,
        sections: [
          {
            facts: [
              { name: 'Agent', value: ticket.agent },
              { name: 'Page', value: ticket.context?.page || '-' },
              { name: 'Case', value: ticket.context?.caseId || '-' },
              { name: 'Raised', value: new Date(ticket.createdAt).toLocaleString('en-IN') },
            ],
          },
        ],
      });
      notified.teams = 'sent';
    } catch (e) {
      notified.teams = 'failed';
      notified.teamsError = e.message;
    }
  }
  ticket.notified = notified;
  ticket.updatedAt = now();
  await store.save();
}

async function notifyMessage(ticket, body) {
  const s = store.settings();
  if (!s.teamsNotify || !TEAMS_WEBHOOK) return;
  try {
    await postToTeams({
      themeColor: '0078D7',
      summary: `${ticket.agent} wrote on ${ticket.id}`,
      title: `${ticket.agent} wrote on ${ticket.id}`,
      text: body,
      sections: [{ facts: [{ name: 'Token', value: ticket.id }, { name: 'Question', value: ticket.question.slice(0, 200) }] }],
    });
  } catch {
    /* the message is saved; Teams is best-effort */
  }
}

// ---------- HTTP helpers ----------

function send(res, status, body, type = 'application/json') {
  const text = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type === 'application/json' ? 'application/json; charset=utf-8' : type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const eq = (a, b) => Boolean(a && b && String(a) === String(b));

// service = the CRM server (full access); admin = manager portal; agent = agent portal
function roleOf(req) {
  if (eq(req.headers['x-support-token'], SERVICE_TOKEN)) return 'service';
  if (eq(req.headers['x-support-admin'], ADMIN_CODE)) return 'admin';
  if (eq(req.headers['x-support-code'], AGENT_CODE)) return 'agent';
  return null;
}

function page(name) {
  return fs.readFileSync(path.join(here, 'public', name), 'utf8');
}

function agentName(url) {
  return clean(url.searchParams.get('agent') || '', 80);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/agent')) return send(res, 200, page('agent.html'), 'text/html; charset=utf-8');
  if (req.method === 'GET' && (p === '/admin' || p === '/admin/')) return send(res, 200, page('admin.html'), 'text/html; charset=utf-8');
  if (p === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

  if (req.method === 'GET' && p === '/api/health')
    return send(res, 200, { ok: true, service: 'LOTS Support', port: PORT, tickets: store.tickets().length, data: store.dir });

  if (req.method === 'GET' && p === '/api/overview') {
    const s = store.settings();
    return send(res, 200, {
      suggested: SUGGESTED,
      articles: SUPPORT_ARTICLES.map((a) => ({ id: a.id, title: a.title })),
      managerEmail: s.managerEmail,
      managerKnown: Boolean(s.managerEmail) || Boolean(TEAMS_WEBHOOK),
      teamsConfigured: Boolean(TEAMS_WEBHOOK),
      crmUrl: CRM_URL,
    });
  }

  const role = roleOf(req);
  if (!role) return send(res, 401, { error: 'Access code required' });

  if (req.method === 'POST' && p === '/api/ask') {
    const { question } = await readBody(req);
    const text = clean(question, 1000);
    if (!text) return send(res, 400, { error: 'Type your question first' });
    const m = matchArticle(text);
    if (m) return send(res, 200, { answered: true, answer: { id: m.article.id, title: m.article.title, text: m.article.answer, matched: m.matched } });
    return send(res, 200, {
      answered: false,
      related: relatedArticles(text, 3),
      hint: 'This one is not in the help articles - raise a support token and the help desk manager will answer.',
    });
  }

  const art = p.match(/^\/api\/articles\/([^/]+)$/);
  if (req.method === 'GET' && art) {
    const a = SUPPORT_ARTICLES.find((x) => x.id === decodeURIComponent(art[1]));
    if (!a) return send(res, 404, { error: 'No such help topic' });
    return send(res, 200, { id: a.id, title: a.title, text: a.answer });
  }

  if (p === '/api/settings') {
    if (role === 'agent') return send(res, 403, { error: 'Only the help desk manager can change support settings' });
    if (req.method === 'GET') return send(res, 200, { ...store.settings(), teamsConfigured: Boolean(TEAMS_WEBHOOK), agentPortal: `http://localhost:${PORT}/`, adminPortal: `http://localhost:${PORT}/admin` });
    if (req.method === 'PUT') {
      const patch = await readBody(req);
      const bad = [...emails(patch.managerEmail), ...emails(patch.clientCc)].find((e) => !EMAIL.test(e));
      if (bad) return send(res, 400, { error: `Not a valid email: ${bad}` });
      return send(res, 200, store.updateSettings(patch));
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  if (p === '/api/tickets') {
    if (req.method === 'GET') {
      const agent = role === 'agent' ? agentName(url) : '';
      if (role === 'agent' && !agent) return send(res, 400, { error: 'Agent name required' });
      return send(res, 200, ticketsFor(agent));
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      // an agent portal can only raise a token in its own name
      const agent = role === 'agent' ? agentName(url) || clean(body.agent, 80) : clean(body.agent, 80);
      const t = await createTicket({ question: body.question, agent, context: body.context });
      return send(res, 201, t);
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  const one = p.match(/^\/api\/tickets\/([^/]+)$/);
  if (one) {
    const id = decodeURIComponent(one[1]);
    const t = findTicket(id);
    const agent = agentName(url);
    if (!t) return send(res, 404, { error: 'Support token not found' });
    if (role === 'agent' && String(t.agent).toLowerCase() !== agent.toLowerCase()) return send(res, 403, { error: 'That token belongs to another agent' });

    if (req.method === 'GET') return send(res, 200, t);

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const action = body.action || (body.status === 'Closed' ? 'close' : 'reply');
      if (action === 'close') return send(res, 200, await closeTicket(id, role === 'agent' ? t.agent : clean(body.by || 'Help desk', 80)));
      // an agent can only write back as the agent; the manager replies as the manager
      const from = role === 'agent' || action === 'message' ? 'agent' : 'manager';
      const by = role === 'agent' ? t.agent : clean(body.by || (from === 'agent' ? t.agent : 'Help desk'), 80);
      return send(res, 200, await replyTicket(id, body.reply, by, from));
    }

    if (req.method === 'DELETE') {
      if (role === 'agent') return send(res, 403, { error: 'Only the help desk manager can delete a token' });
      return send(res, 200, await deleteTicket(id));
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!res.headersSent) send(res, e.status || 500, { error: e.message || 'Support service error' });
    if (!e.status || e.status >= 500) console.error('[support]', req.method, req.url, e.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`LOTS Support running on http://localhost:${PORT}`);
  console.log(`  Agents:  http://localhost:${PORT}/`);
  console.log(`  Manager: http://localhost:${PORT}/admin`);
  console.log(`  Data:    ${store.dir}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
