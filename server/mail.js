// Microsoft 365 (Graph API) access to the LOTS mailbox (MAILBOX, default contactus@cpwi.in).
//
// Two ways to connect — whichever is set up is used:
//  1. "Sign in with Microsoft" (default): a supervisor signs in once on the Automation page with a Microsoft account
//     that can open the mailbox (device-code sign-in). The CRM keeps the sign-in (refresh token) in the private
//     .lots-crm folder and renews it by itself. Needs Full Access + Send As on the mailbox for that account.
//  2. IT app secret: MS_TENANT_ID + MS_CLIENT_ID + MS_CLIENT_SECRET in the secrets file (application permissions).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// URL overrides exist only for testing against a local mock.
const GRAPH = process.env.MS_GRAPH_URL || 'https://graph.microsoft.com/v1.0';
const LOGIN = process.env.MS_LOGIN_URL || 'https://login.microsoftonline.com';

// Public Microsoft app used for sign-in when no own app is configured ("Microsoft Graph Command Line Tools",
// the app behind Connect-MgGraph). An own app registration can be set with MS_SIGNIN_CLIENT_ID (public client flows on).
const GRAPH_CLI_APP = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
const SCOPES = 'offline_access openid profile https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite.Shared https://graph.microsoft.com/Mail.Send.Shared https://graph.microsoft.com/Files.Read.All'; // Files: the linked escalation-matrix Excel
const PRIVATE_DIR = process.env.LOTS_SECRETS_FILE ? path.dirname(process.env.LOTS_SECRETS_FILE) : path.join(os.homedir(), '.lots-crm');
const SIGNIN_FILE = path.join(PRIVATE_DIR, 'ms-signin.json');

function cfg() {
  return {
    tenant: process.env.MS_TENANT_ID || '',
    clientId: process.env.MS_CLIENT_ID || '',
    secret: process.env.MS_CLIENT_SECRET || '',
    mailbox: process.env.MAILBOX || 'contactus@cpwi.in',
  };
}
const signinApp = () => ({ clientId: process.env.MS_SIGNIN_CLIENT_ID || GRAPH_CLI_APP, tenant: process.env.MS_SIGNIN_TENANT || 'organizations' });

const appMode = () => {
  const c = cfg();
  return Boolean(c.tenant && c.clientId && c.secret);
};

let signin; // cached contents of SIGNIN_FILE
function readSignin() {
  if (signin === undefined) {
    try {
      signin = JSON.parse(fs.readFileSync(SIGNIN_FILE, 'utf8'));
    } catch {
      signin = null;
    }
  }
  return signin;
}
function writeSignin(data) {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(SIGNIN_FILE, JSON.stringify(data, null, 2));
  signin = data;
  // private to this Windows user, like secrets.env
  if (process.platform === 'win32') execFile('icacls', [SIGNIN_FILE, '/inheritance:r', '/grant:r', `${os.userInfo().username}:(R,W)`], () => {});
  else fs.chmodSync(SIGNIN_FILE, 0o600);
}

export function configured() {
  return appMode() || Boolean(readSignin()?.refreshToken);
}
export const mode = () => (appMode() ? 'app' : readSignin()?.refreshToken ? 'signin' : null);
export const mailbox = () => cfg().mailbox;

async function tokenRequest(tenant, params) {
  const res = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const claims = (jwt) => {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

let token = null;
let renewing = null; // one renewal at a time — refresh tokens rotate, so parallel renewals would race
async function getToken() {
  if (token && token.expires > Date.now() + 60000) return token.value;
  renewing ||= renewToken().finally(() => (renewing = null));
  return renewing;
}

async function renewToken() {
  if (appMode()) {
    const c = cfg();
    const { ok, data } = await tokenRequest(c.tenant, { client_id: c.clientId, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
    if (!ok) throw new Error(`Microsoft sign-in failed: ${data.error_description || data.error}`);
    token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return token.value;
  }
  const s = readSignin();
  if (!s?.refreshToken) throw new Error('Mailbox not connected — use "Sign in with Microsoft" on the Automation page');
  const { ok, data } = await tokenRequest(s.tenant, { client_id: s.clientId, grant_type: 'refresh_token', refresh_token: s.refreshToken, scope: SCOPES });
  if (!ok) {
    writeSignin({ ...s, error: data.error_description || data.error, errorAt: new Date().toISOString() });
    throw new Error(`Microsoft sign-in has expired or was revoked — sign in again on the Automation page (${data.error})`);
  }
  // refresh tokens rotate: keep the newest
  writeSignin({ ...s, refreshToken: data.refresh_token || s.refreshToken, error: null, lastRefresh: new Date().toISOString() });
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

// ---------- "Sign in with Microsoft" (device code) ----------
let pending = null;

export async function startSignin() {
  const app = signinApp();
  const res = await fetch(`${LOGIN}/${app.tenant}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.clientId, scope: SCOPES }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Microsoft did not start the sign-in: ${d.error_description || d.error || res.status}`), { status: 502 });
  const job = {
    status: 'waiting',
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    expiresAt: new Date(Date.now() + d.expires_in * 1000).toISOString(),
    error: null,
    account: null,
  };
  pending = job;
  let interval = (d.interval || 5) * 1000;
  const poll = async () => {
    if (pending !== job) return; // superseded or cancelled
    if (Date.now() > new Date(job.expiresAt).getTime()) return Object.assign(job, { status: 'failed', error: 'The code expired before sign-in finished. Start again.' });
    const { ok, data } = await tokenRequest(app.tenant, { client_id: app.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: d.device_code });
    if (!ok) {
      if (data.error === 'authorization_pending') return setTimeout(poll, interval);
      if (data.error === 'slow_down') return setTimeout(poll, (interval += 5000));
      return Object.assign(job, { status: 'failed', error: data.error_description?.split('\r\n')[0] || data.error });
    }
    const who = claims(data.id_token);
    writeSignin({
      refreshToken: data.refresh_token,
      clientId: app.clientId,
      tenant: who.tid || app.tenant,
      account: who.preferred_username || who.email || who.name || 'Microsoft account',
      connectedAt: new Date().toISOString(),
      error: null,
    });
    token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    Object.assign(job, { status: 'connected', account: readSignin().account });
  };
  setTimeout(poll, interval);
  return job;
}

export function signinStatus() {
  const s = readSignin();
  return {
    mode: mode(),
    mailbox: cfg().mailbox,
    account: s?.account || null,
    connectedAt: s?.connectedAt || null,
    error: s?.error || null,
    pending: pending && pending.status !== 'connected' ? pending : null,
  };
}

export function signOut() {
  pending = null;
  token = null;
  try {
    fs.rmSync(SIGNIN_FILE, { force: true });
  } catch {
    /* already gone */
  }
  signin = null;
}

async function graph(method, path, body, headers = {}) {
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 202 || res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Microsoft Graph ${method} ${path.split('?')[0]}: ${data.error?.message || res.status}`);
  return data;
}

const mb = () => `/users/${encodeURIComponent(cfg().mailbox)}`;

// ---------- a file shared from OneDrive / SharePoint (the escalation matrix Excel, linked in Stores & settings) ----------
const shareId = (link) => 'u!' + Buffer.from(String(link).trim()).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');

/** Name, version and last change of a shared file (from its share link). */
export async function sharedFileInfo(link) {
  const d = await graph('GET', `/shares/${shareId(link)}/driveItem?$select=id,name,eTag,cTag,size,lastModifiedDateTime,lastModifiedBy,webUrl`);
  return { name: d.name, version: d.cTag || d.eTag, size: d.size, modifiedAt: d.lastModifiedDateTime, modifiedBy: d.lastModifiedBy?.user?.displayName || d.lastModifiedBy?.user?.email || '', webUrl: d.webUrl };
}

/** The file's bytes. */
export async function sharedFileContent(link) {
  const res = await fetch(`${GRAPH}/shares/${shareId(link)}/driveItem/content`, { headers: { Authorization: `Bearer ${await getToken()}` }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Microsoft Graph could not download the file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- mailbox (same Graph calls as the VMM CRM: delta inbox, threads, reply in thread, categories) ----------
const LIST_SELECT = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,conversationId,isRead,hasAttachments,categories,internetMessageId';
const addr = (r) => r?.emailAddress?.address || '';
const recips = (list) => (list || []).map(addr).filter(Boolean);

function shape(m) {
  return {
    id: m.id,
    messageId: m.internetMessageId || '',
    conversationId: m.conversationId || '',
    subject: m.subject || '',
    fromEmail: addr(m.from || m.sender),
    fromName: m.from?.emailAddress?.name || m.sender?.emailAddress?.name || addr(m.from),
    to: recips(m.toRecipients),
    cc: recips(m.ccRecipients),
    receivedAt: m.receivedDateTime || m.sentDateTime || '',
    isRead: Boolean(m.isRead),
    hasAttachments: Boolean(m.hasAttachments),
    categories: m.categories || [],
    preview: m.bodyPreview || '',
  };
}

/**
 * New inbox mail since the last call (Graph delta query, as in VMM).
 * First call: only mail received at or after `since`, so an existing inbox is not imported.
 * Returns { messages (plain-text bodies), deltaLink }. A stale link → { reset: true }.
 */
export async function inboxDelta(deltaLink, since) {
  let url = deltaLink || `${mb()}/mailFolders/inbox/messages/delta?$select=${LIST_SELECT},body&$filter=receivedDateTime+ge+${new Date(since).toISOString()}`;
  const out = [];
  let link = null;
  for (let pages = 0; url && pages < 20; pages++) {
    let data;
    try {
      data = await graph('GET', url, null, { Prefer: 'outlook.body-content-type="text", odata.maxpagesize=50' });
    } catch (e) {
      if (/\b(410|400)\b|SyncStateNotFound|resync/i.test(e.message) && deltaLink) return { reset: true };
      throw e;
    }
    for (const m of data.value || []) if (!m['@removed']) out.push({ ...shape(m), body: (m.body?.content || '').trim() });
    link = data['@odata.deltaLink'] || link;
    url = data['@odata.nextLink'] || null;
  }
  return { messages: out, deltaLink: link };
}

/** Inbox or Sent items for the mailbox screen (newest first), optionally searched. */
export async function listFolder(folder = 'inbox', { q = '', top = 50 } = {}) {
  const f = folder === 'sent' ? 'sentitems' : 'inbox';
  const url = q
    ? `${mb()}/mailFolders/${f}/messages?$search=${encodeURIComponent(`"${q.replace(/"/g, '')}"`)}&$select=${LIST_SELECT}&$top=${top}`
    : `${mb()}/mailFolders/${f}/messages?$select=${LIST_SELECT}&$orderby=receivedDateTime desc&$top=${top}`;
  const data = await graph('GET', url, null, q ? { ConsistencyLevel: 'eventual' } : {});
  return (data.value || []).map(shape).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** One message with its plain-text body (used to log a case from it). */
export async function getMessage(id) {
  const m = await graph('GET', `${mb()}/messages/${id}?$select=${LIST_SELECT},body`, null, { Prefer: 'outlook.body-content-type="text"' });
  return { ...shape(m), body: (m.body?.content || '').trim() };
}

/** Whole conversation, oldest first, with HTML bodies (shown sandboxed in the browser). */
export async function getThread(conversationId) {
  const sel = `${LIST_SELECT},body,uniqueBody,sender`;
  const filter = `conversationId eq '${String(conversationId).replace(/'/g, "''")}'`;
  let data;
  try {
    data = await graph('GET', `${mb()}/messages?$filter=${encodeURIComponent(filter)}&$select=${sel}&$top=50`);
  } catch {
    data = { value: [] };
  }
  const own = cfg().mailbox.toLowerCase();
  return (data.value || [])
    .map((m) => ({ ...shape(m), html: m.body?.contentType === 'html' ? m.body.content : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(m.body?.content || '')}</pre>`, sentByUs: addr(m.from).toLowerCase() === own }))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export async function setCategories(id, categories) {
  await graph('PATCH', `${mb()}/messages/${id}`, { categories });
}

export async function markRead(id, isRead = true) {
  await graph('PATCH', `${mb()}/messages/${id}`, { isRead });
}

export async function listAttachments(id) {
  const data = await graph('GET', `${mb()}/messages/${id}/attachments?$select=id,name,contentType,size,isInline`);
  return (data.value || []).filter((a) => !a.isInline).map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size }));
}

export async function getAttachment(id, attId) {
  const a = await graph('GET', `${mb()}/messages/${id}/attachments/${attId}`);
  return { name: a.name, contentType: a.contentType || 'application/octet-stream', bytes: Buffer.from(a.contentBytes || '', 'base64') };
}

export async function fetchAttachments(id) {
  const data = await graph('GET', `${mb()}/messages/${id}/attachments`);
  return (data.value || [])
    .filter((a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline)
    .map((a) => ({ name: a.name, contentType: a.contentType, size: a.size, bytes: Buffer.from(a.contentBytes, 'base64') }));
}

const toRecipients = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).filter(Boolean).map((address) => ({ emailAddress: { address } }));

// Files for Graph: [{ name, contentType, bytes }] → fileAttachment (each up to 3 MB; the caller keeps to that)
const fileAttachment = (f) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: f.name, contentType: f.contentType || 'application/octet-stream', contentBytes: Buffer.from(f.bytes).toString('base64') });

/** New email (HTML) from the mailbox, with any file attachments; a copy is kept in Sent Items. */
export async function send({ to, cc = [], subject, html, body, attachments = [] }) {
  await graph('POST', `${mb()}/sendMail`, {
    message: {
      subject,
      body: html ? { contentType: 'HTML', content: html } : { contentType: 'Text', content: body },
      toRecipients: toRecipients(to),
      ccRecipients: toRecipients(cc),
      ...(attachments.length ? { attachments: attachments.map(fileAttachment) } : {}),
    },
    saveToSentItems: true,
  });
}

/**
 * Reply inside the customer's own thread (as VMM's replyOnThread): createReply → set body/subject/recipients → send.
 * The case number stays in the subject so replies always come back to the case.
 */
export async function reply(messageId, { to, cc = [], subject, html, attachments = [] }) {
  const draft = await graph('POST', `${mb()}/messages/${messageId}/createReply`, {});
  const patch = { body: { contentType: 'HTML', content: html } };
  if (subject) patch.subject = subject;
  if (to) patch.toRecipients = toRecipients(to);
  patch.ccRecipients = toRecipients(cc);
  await graph('PATCH', `${mb()}/messages/${draft.id}`, patch);
  for (const f of attachments) await graph('POST', `${mb()}/messages/${draft.id}/attachments`, fileAttachment(f));
  await graph('POST', `${mb()}/messages/${draft.id}/send`);
  return { draftId: draft.id, conversationId: draft.conversationId };
}

export function escapeHtml(t) {
  return String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export async function test() {
  await getToken();
  const data = await graph('GET', `${mb()}/mailFolders/inbox?$select=totalItemCount,unreadItemCount`);
  return { mailbox: cfg().mailbox, inboxItems: data.totalItemCount, unread: data.unreadItemCount };
}
