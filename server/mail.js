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
const LOGGED_FOLDER = 'CRM-Logged';

// Public Microsoft app used for sign-in when no own app is configured ("Microsoft Graph Command Line Tools",
// the app behind Connect-MgGraph). An own app registration can be set with MS_SIGNIN_CLIENT_ID (public client flows on).
const GRAPH_CLI_APP = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
const SCOPES = 'offline_access openid profile https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite.Shared https://graph.microsoft.com/Mail.Send.Shared';
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
    loggedFolderId = null;
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
  loggedFolderId = null;
  try {
    fs.rmSync(SIGNIN_FILE, { force: true });
  } catch {
    /* already gone */
  }
  signin = null;
}

async function graph(method, path, body, headers = {}) {
  const res = await fetch(GRAPH + path, {
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

let loggedFolderId = null;
async function loggedFolder() {
  if (loggedFolderId) return loggedFolderId;
  const found = await graph('GET', `${mb()}/mailFolders?$filter=displayName eq '${LOGGED_FOLDER}'`);
  loggedFolderId = found.value?.[0]?.id || (await graph('POST', `${mb()}/mailFolders`, { displayName: LOGGED_FOLDER })).id;
  return loggedFolderId;
}

// Oldest first, plain-text bodies. Everything in the inbox is new: logged mail is moved out.
export async function fetchInbox(top = 25) {
  const data = await graph(
    'GET',
    `${mb()}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime asc&$select=id,subject,from,receivedDateTime,body,hasAttachments,internetMessageId`,
    null,
    { Prefer: 'outlook.body-content-type="text"' }
  );
  return (data.value || []).map((m) => ({
    id: m.id,
    messageId: m.internetMessageId,
    fromEmail: m.from?.emailAddress?.address || '',
    fromName: m.from?.emailAddress?.name || '',
    subject: m.subject || '',
    body: (m.body?.content || '').trim(),
    receivedAt: m.receivedDateTime,
    hasAttachments: m.hasAttachments,
  }));
}

export async function fetchAttachments(id) {
  const data = await graph('GET', `${mb()}/messages/${id}/attachments`);
  return (data.value || [])
    .filter((a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline)
    .map((a) => ({ name: a.name, contentType: a.contentType, size: a.size, bytes: Buffer.from(a.contentBytes, 'base64') }));
}

export async function markLogged(id) {
  await graph('POST', `${mb()}/messages/${id}/move`, { destinationId: await loggedFolder() });
}

export async function send({ to, cc = [], subject, body }) {
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).filter(Boolean).map((address) => ({ emailAddress: { address } }));
  await graph('POST', `${mb()}/sendMail`, {
    message: { subject, body: { contentType: 'Text', content: body }, toRecipients: list(to), ccRecipients: list(cc) },
    saveToSentItems: true,
  });
}

export async function test() {
  await getToken();
  const data = await graph('GET', `${mb()}/mailFolders/inbox?$select=totalItemCount,unreadItemCount`);
  return { mailbox: cfg().mailbox, inboxItems: data.totalItemCount, unread: data.unreadItemCount };
}
