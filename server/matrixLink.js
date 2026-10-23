// Live link to LOTS's escalation-matrix Excel on OneDrive / SharePoint (Stores & settings → Escalation matrix).
// Read when someone presses "Refresh now" (no automatic checking, user's request 23 Oct 2026): the CRM downloads the
// file and applies it like an upload (server/matrixImport.js): recognised rows at once, new rows wait for a decision.
import * as store from './db.js';
import * as mail from './mail.js';
import * as teams from './teams.js';
import * as matrixImport from './matrixImport.js';

const db = () => store.get();
const now = () => new Date().toISOString();
const link = () => db().settings?.matrixLink || null;

function set(patch) {
  const d = db();
  d.settings ||= {};
  d.settings.matrixLink = { ...(d.settings.matrixLink || {}), ...patch };
  store.save();
  return status();
}

/** What the Settings page shows. */
export function status() {
  const l = link();
  return l ? { ...l, microsoft: mail.configured() } : { url: '', microsoft: mail.configured() };
}

/** Link the file (share link from OneDrive / SharePoint: Share → Copy link). Checked at once. */
export async function setLink(url, by) {
  url = String(url || '').trim();
  if (!/^https:\/\/[^/]+\.(sharepoint\.com|onedrive\.live\.com|1drv\.ms)\//i.test(url) && !/^https?:\/\/localhost/.test(url)) {
    throw Object.assign(new Error('Paste the OneDrive / SharePoint share link of the Excel (Share → Copy link)'), { status: 400 });
  }
  set({ url, linkedAt: now(), linkedBy: by, version: null, error: null, lastResult: null });
  return check(true);
}

export function unlink() {
  const d = db();
  if (d.settings) delete d.settings.matrixLink;
  store.save();
  return status();
}

/** Look at the file; apply it when its version changed (or `force`). */
export async function check(force = false) {
  const l = link();
  if (!l?.url) return status();
  if (!mail.configured()) return set({ checkedAt: now(), error: 'Waiting for Microsoft 365: sign in on the Automation page (the same sign-in as the mailbox)' });
  try {
    const info = await mail.sharedFileInfo(l.url);
    if (!force && info.version && info.version === l.version) return set({ checkedAt: now(), error: null, file: info.name });
    const bytes = await mail.sharedFileContent(l.url);
    const via = `linked Excel${info.modifiedBy ? `, saved by ${info.modifiedBy}` : ''}`;
    const s = await matrixImport.autoImport(bytes, info.name, info.modifiedBy || 'OneDrive', 'link', via);
    if (!s) return set({ checkedAt: now(), version: info.version, file: info.name, error: `“${info.name}” has no CRM TABLE (SUB1, First Time Resolution SPOC, … Level 2 TAT)` });
    const result = s.unchanged ? 'No changes' : `${s.applied.length} row(s) updated${s.left.length ? ` · new rows waiting for a decision: ${s.left.join(', ')}` : ''}`;
    if (!s.unchanged) console.log(`Escalation matrix updated from the linked Excel “${info.name}”: ${result}`);
    return set({ checkedAt: now(), version: info.version, file: info.name, modifiedAt: info.modifiedAt, modifiedBy: info.modifiedBy, webUrl: info.webUrl, error: null, lastResult: s.unchanged ? l.lastResult || result : result, lastChangeAt: s.unchanged ? l.lastChangeAt || null : now() });
  } catch (e) {
    const msg = /403|accessDenied|Access denied/i.test(e.message) ? 'No access to the file: share it with the Microsoft account the CRM signs in with (or allow Files.Read.All)' : /404|itemNotFound/i.test(e.message) ? 'File not found: the share link was removed or changed' : e.message;
    if (msg !== l.error && teams.configured()) teams.postCard({ title: 'Escalation matrix: the linked Excel could not be read', subtitle: msg }).catch(() => {});
    return set({ checkedAt: now(), error: msg });
  }
}

