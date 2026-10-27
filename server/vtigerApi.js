// One serialized client for Vtiger's webservice, shared by the contacts and the cases import.
// Vtiger allows only a few calls in quick succession (TOO_MANY_REQUESTS), so calls go out one at a time with a
// small gap, and a rate-limited call waits and tries again. The access key stays in the private secrets file
// (VTIGER_URL, VTIGER_USERNAME, VTIGER_ACCESS_KEY) and never reaches a log, an error or the browser.
import crypto from 'node:crypto';

const env = (k) => String(process.env[k] || '').trim();
export const configured = () => Boolean(env('VTIGER_URL') && env('VTIGER_USERNAME') && env('VTIGER_ACCESS_KEY'));

const endpoint = () => new URL(env('VTIGER_URL')).origin + '/webservice.php';

// never let a credential reach a log, an error or the browser
export const redact = (msg) => [env('VTIGER_ACCESS_KEY'), env('VTIGER_USERNAME')].filter(Boolean).reduce((m, s) => m.split(s).join('***'), String(msg));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = Math.max(0, Number(process.env.VTIGER_MIN_GAP_MS) || 1200);
const MAX_TRIES = 6;

let session = null;
let loginPromise = null;
let nextAt = 0; // earliest time the next call may go out
let tail = Promise.resolve(); // calls wait for the one before them

/** One HTTP call, serialized and spaced out. */
function send(params, post = false) {
  const run = tail.then(async () => {
    const wait = nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextAt = Date.now() + MIN_GAP_MS;
    const url = post ? endpoint() : endpoint() + '?' + new URLSearchParams(params);
    const res = post ? await fetch(url, { method: 'POST', body: new URLSearchParams(params) }) : await fetch(url);
    if (!res.ok) throw new Error(`Vtiger answered ${res.status}`);
    const j = await res.json();
    if (!j.success) throw Object.assign(new Error(redact(j.error?.message || 'Vtiger error')), { code: j.error?.code });
    return j.result;
  });
  tail = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function login() {
  const { token } = await send({ operation: 'getchallenge', username: env('VTIGER_USERNAME') });
  const accessKey = crypto.createHash('md5').update(token + env('VTIGER_ACCESS_KEY')).digest('hex');
  session = (await send({ operation: 'login', username: env('VTIGER_USERNAME'), accessKey }, true)).sessionName;
}

async function ensureSession() {
  if (session) return session;
  if (!loginPromise)
    loginPromise = login().finally(() => {
      loginPromise = null;
    });
  await loginPromise;
  return session;
}

/** A query; logs in (again) when needed, waits on the rate limit and retries a few times on network trouble. */
export async function query(q) {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureSession();
      return await send({ operation: 'query', sessionName: session, query: q });
    } catch (e) {
      if (/SESSION|AUTH/i.test(e.code || '')) session = null;
      if (e.code === 'INVALID_USER_CREDENTIALS' || attempt >= MAX_TRIES) throw new Error(redact(e.message));
      if (e.code === 'TOO_MANY_REQUESTS' || /too many|rate/i.test(e.message)) await sleep(15000 * attempt);
      else await sleep(2000 * attempt);
    }
  }
}

const described = new Map(); // elementType → { fieldName: label }
/** Vtiger field name → label (cached per module). */
export async function describe(elementType) {
  if (described.has(elementType)) return described.get(elementType);
  await ensureSession();
  const d = await send({ operation: 'describe', sessionName: session, elementType });
  const fields = Object.fromEntries(d.fields.map((f) => [f.name, f.label]));
  described.set(elementType, fields);
  return fields;
}
