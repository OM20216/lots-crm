// Sign-in with passwords and roles (agent / admin). Off until an admin switches on "Require sign-in"
// (Admin → Users); before that the CRM works as before (the agent picks their name).
// Passwords: scrypt hashes in the CRM's data (key `users`). Sessions: a signed, HttpOnly cookie (12 hours).
// Emergency: CRM_AUTH_OFF=1 in the private secrets file turns sign-in off (e.g. every admin password forgotten).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from './db.js';

const db = () => store.get();
const save = () => store.save();
const now = () => new Date().toISOString();
const fail = (message, status = 400, data) => Object.assign(new Error(message), { status, data });

export const ROLES = ['agent', 'admin'];
const COOKIE = 'lots_session';
const SESSION_HOURS = 12;
const MIN_PASSWORD = 8;

// ---------- the signing key (private folder, next to the secrets file; made once) ----------
const PRIVATE_DIR = process.env.LOTS_SECRETS_FILE ? path.dirname(process.env.LOTS_SECRETS_FILE) : path.join(os.homedir(), '.lots-crm');
let KEY;
function key() {
  if (KEY) return KEY;
  const file = path.join(PRIVATE_DIR, 'session.key');
  try {
    KEY = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  } catch {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    KEY = crypto.randomBytes(32);
    fs.writeFileSync(file, KEY.toString('hex'), { mode: 0o600 });
  }
  return KEY;
}

// ---------- users and passwords ----------
/** { [agent name]: { role, hash, active, setAt, setBy } } */
export function users() {
  const d = db();
  d.users ||= {};
  return d.users;
}
const userOf = (name) => users()[name] || null;

function hash(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}
function verify(password, stored) {
  const [kind, salt, h] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !h) return false;
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Sign-in switched on (and not turned off in the secrets file). */
export const required = () => !process.env.CRM_AUTH_OFF && Boolean(db().settings?.auth?.required);
const adminsWithPassword = () => Object.entries(users()).filter(([, u]) => u.role === 'admin' && u.hash && u.active !== false).map(([n]) => n);

/** Everyone in the agent list, with their role and whether a password is set (never the hash). */
export function list() {
  const u = users();
  return db().agents.map((name) => ({ name, role: u[name]?.role || 'agent', hasPassword: Boolean(u[name]?.hash), active: u[name]?.active !== false, setAt: u[name]?.setAt || null, setBy: u[name]?.setBy || null }));
}

/** Set a user's role, password or active flag (Admin → Users). Adds the name to the agent list if new. */
export function setUser(name, { role, password, active } = {}, by) {
  name = String(name || '').trim();
  if (!name) throw fail('Enter the name');
  const d = db();
  if (!d.agents.includes(name)) d.agents.push(name);
  const u = { ...(users()[name] || { role: 'agent' }) };
  if (role !== undefined) {
    if (!ROLES.includes(role)) throw fail('Role must be agent or admin');
    u.role = role;
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < MIN_PASSWORD) throw fail(`The password needs at least ${MIN_PASSWORD} characters`);
    u.hash = hash(String(password));
    u.setAt = now();
    u.setBy = by || name;
  }
  if (active !== undefined) u.active = Boolean(active);
  // never leave a CRM that requires sign-in without an admin who can sign in
  const next = { ...users(), [name]: u };
  if (required() && !Object.values(next).some((x) => x.role === 'admin' && x.hash && x.active !== false)) throw fail('At least one active admin with a password is needed while sign-in is required');
  d.users = next;
  save();
  return list().find((x) => x.name === name);
}

// ---------- sessions ----------
const b64 = (s) => Buffer.from(s).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${crypto.createHmac('sha256', key()).update(body).digest('base64url')}`;
}
function unsign(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
const cookieOf = (req) => (String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)) || [])[1];

/** The signed-in user of a request: { name, role }, or null. The password change time is in the session, so a new password ends old sessions. */
export function sessionUser(req) {
  const p = unsign(cookieOf(req));
  if (!p) return null;
  const u = userOf(p.n);
  if (!u?.hash || u.active === false || (u.setAt || '') !== (p.s || '')) return null;
  return { name: p.n, role: u.role || 'agent' };
}
function setSession(res, name) {
  const u = userOf(name);
  const token = sign({ n: name, s: u.setAt || '', exp: Date.now() + SESSION_HOURS * 3600e3 });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
}
const clearSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);

// ---------- wrong passwords: 5 tries, then 10 minutes' wait ----------
const tries = new Map();
function checkTries(name) {
  const t = tries.get(name);
  if (t && t.until > Date.now()) throw fail(`Too many wrong passwords for ${name}. Try again in ${Math.ceil((t.until - Date.now()) / 60000)} min.`, 429);
}
function wrong(name) {
  const t = tries.get(name) || { n: 0, until: 0 };
  t.n += 1;
  if (t.n >= 5) (t.until = Date.now() + 10 * 60e3), (t.n = 0);
  tries.set(name, t);
}

function login(name, password) {
  name = String(name || '').trim();
  checkTries(name);
  const u = userOf(name);
  if (!u?.hash || u.active === false || !verify(password, u.hash)) {
    wrong(name);
    throw fail('Wrong name or password', 401);
  }
  tries.delete(name);
  return { name, role: u.role || 'agent' };
}

// ---------- what each role may do ----------
// Paths are below /api. Agents do the daily work; the setup (Admin pages, matrices, automation, users, backup) is admin only.
const ADMIN_ONLY = [
  ['PUT', /^\/agents\/[^/]+$/],
  ['POST', /^\/agents$/],
  ['DELETE', /^\/(picklists|dependencies)$/],
  ['POST', /^\/teams-preview\/(test|samples)$/],
  ['PUT', /^\/(teams|stores)\/[^/]+$/],
  ['POST', /^\/cases\/[^/]+\/set-level$/],
  [/^(PUT|DELETE)$/, /^\/(escalation-matrix|escalation-rows|ho-matrix|store-matrix)\/[^/]+$/],
  ['POST', /^\/(escalation-rows|ho-matrix|store-matrix)\/[^/]+\/sample$/],
  ['POST', /^\/matrix-import(\/[^/]+\/(apply|undo))?$/],
  [/^(PUT|POST|DELETE)$/, /^\/matrix-link(\/check)?$/],
  ['PUT', /^\/(work-hours|holidays|automation|support\/settings|auth\/settings)$/],
  ['POST', /^\/automation\/run$/],
  [/^(POST|DELETE)$/, /^\/mail\/signin$/],
  ['DELETE', /^\/support\/tickets\/[^/]+$/],
  ['GET', /^\/(export|users)$/],
  ['PUT', /^\/users\/[^/]+$/],
];
const adminOnly = (req) => ADMIN_ONLY.some(([m, re]) => (m instanceof RegExp ? m.test(req.method) : m === req.method) && re.test(req.path)) || (req.method === 'PATCH' && /^\/support\/tickets\/[^/]+$/.test(req.path) && (req.body?.action || 'reply') === 'reply');

// open without signing in: the health check, signing in itself, SparkTG's call-event webhook
const OPEN = [/^\/health$/, /^\/auth\/(me|login|logout|settings)$/, /^\/sparktg\/event$/];

/** Express middleware for /api: who is asking, and may they. */
export function guard(req, res, next) {
  if (OPEN.some((re) => re.test(req.path))) return next();
  if (!required()) return next(); // sign-in not switched on: as before (name from the x-agent header)
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first', signIn: true });
  req.user = user;
  req.headers['x-agent'] = user.name; // the timeline shows who really did it
  if (adminOnly(req) && user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do this' });
  next();
}

/** The sign-in routes. */
export function routes(api) {
  api.get('/auth/me', (req, res) => {
    const user = sessionUser(req);
    // names for the sign-in page (only those who can sign in): /meta needs a session once sign-in is required
    const names = required() && !user ? db().agents.filter((n) => userOf(n)?.hash && userOf(n).active !== false) : undefined;
    res.json({ required: required(), user, names, canRequire: adminsWithPassword().length > 0, forcedOff: Boolean(process.env.CRM_AUTH_OFF) });
  });

  api.post('/auth/login', (req, res) => {
    const user = login(req.body?.name, req.body?.password);
    setSession(res, user.name);
    res.json({ user });
  });

  api.post('/auth/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  // change your own password (needs the current one)
  api.post('/auth/password', (req, res) => {
    const me = sessionUser(req) || (!required() && req.body?.name ? { name: String(req.body.name) } : null);
    if (!me) throw fail('Sign in first', 401);
    const u = userOf(me.name);
    if (u?.hash && !verify(req.body?.current, u.hash)) throw fail('The current password is wrong', 401);
    setUser(me.name, { password: req.body?.password }, me.name);
    setSession(res, me.name); // the new password ends other sessions; this one stays signed in
    res.json({ ok: true });
  });

  // switch sign-in on (needs an admin's name and password, who is then signed in) or off (an admin)
  api.put('/auth/settings', (req, res) => {
    const on = Boolean(req.body?.required);
    const d = db();
    d.settings ||= {};
    if (on) {
      const user = login(req.body?.name, req.body?.password);
      if (user.role !== 'admin') throw fail('Only an admin can switch sign-in on', 403);
      d.settings.auth = { required: true, by: user.name, at: now() };
      setSession(res, user.name);
    } else {
      const me = sessionUser(req);
      if (required() && me?.role !== 'admin') throw fail('Only an admin can switch sign-in off', 403);
      d.settings.auth = { required: false, by: me?.name || req.get('x-agent') || 'Unknown', at: now() };
    }
    save();
    res.json({ required: required() });
  });

  api.get('/users', (req, res) => res.json({ users: list(), required: required(), canRequire: adminsWithPassword().length > 0 }));

  api.put('/users/:name', (req, res) => {
    const by = req.user?.name || req.get('x-agent') || 'Unknown';
    res.json(setUser(req.params.name, { role: req.body?.role, password: req.body?.password, active: req.body?.active }, by));
  });
}
