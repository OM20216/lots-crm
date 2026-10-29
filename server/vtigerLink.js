// Imported Vtiger cases with no CRM contact → their contact. A Vtiger case holds its contact's record id ("4x762"); when
// that contact was not imported with the case (a duplicate or a contact added later), the case stayed unlinked. This job
// looks those contacts up in Vtiger, 100 per request, and finds the CRM contact by, in order: the same Vtiger contact
// (imported since), a mobile no other contact shares, the membership card no., the email. A case without any of them
// stays unlinked. Runs on the server in the background; state in settings.vtigerCaseLink.
import { configured, query } from './vtigerApi.js';

const LOOKUP = 100;
let running = false;
let stopAsked = false;
export const isRunning = () => running;
export const stop = () => {
  stopAsked = true;
};

const mob = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const card = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * ctx = { db, core, save, getState, setState }. Resolves when the job ends (the routes start it without waiting;
 * the nightly sync waits for it).
 */
// all: re-check every unlinked case (the button); otherwise only cases not tried before (the nightly sync)
export async function start(ctx, by, { all = true } = {}) {
  if (!configured()) throw new Error('Vtiger is not set up.');
  if (running) return ctx.getState();
  running = true;
  stopAsked = false;
  const done = run(ctx, by, all)
    .catch((e) => ctx.setState({ ...ctx.getState(), status: 'error', error: String(e.message || e) }))
    .finally(() => (running = false));
  ctx.done = done;
  return ctx.getState();
}

async function run(ctx, by, all) {
  const { db, core, save } = ctx;
  // the unlinked imported cases, by their Vtiger contact
  const byContact = new Map();
  let noContact = 0;
  for (const c of db().cases) {
    if (c.memberId || c.source?.system !== 'Vtiger' || (!all && c.source.linkTried)) continue;
    const id = String(c.source.contactId || '').trim();
    if (!/^\d+x\d+$/.test(id)) {
      noContact++;
      continue;
    }
    (byContact.get(id) || byContact.set(id, []).get(id)).push(c);
  }
  const ids = [...byContact.keys()];
  const s = {
    status: 'running',
    by,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    contacts: ids.length,
    cases: [...byContact.values()].reduce((n, l) => n + l.length, 0),
    noContact,
    looked: 0,
    linked: 0,
    via: { vtiger: 0, mobile: 0, card: 0, email: 0 },
    notFound: 0,
  };
  ctx.setState(s);
  for (let i = 0; i < ids.length; i += LOOKUP) {
    if (stopAsked) return ctx.setState({ ...s, status: 'stopped' });
    const part = ids.slice(i, i + LOOKUP);
    const rows = await query(
      `SELECT id, contact_no, mobile, cf_contacts_updatedcontactmobilenumber, cf_contacts_membershipid, email FROM Contacts WHERE id IN (${part.map((x) => `'${x.replace(/[^0-9x]/g, '')}'`).join(',')});`
    );
    const found = new Map(rows.map((r) => [r.id, r]));
    const ix = core.memberIndex();
    for (const id of part) {
      const r = found.get(id);
      const cases = byContact.get(id);
      let m = null;
      let via = '';
      if (r) {
        const mobiles = [mob(r.cf_contacts_updatedcontactmobilenumber), mob(r.mobile)].filter((x) => x.length === 10);
        const holders = (k) => core.membersByPhone(k);
        if (r.contact_no && ix.vtiger.get(r.contact_no)) [m, via] = [ix.vtiger.get(r.contact_no), 'vtiger'];
        else if (mobiles.some((k) => holders(k).length === 1)) [m, via] = [holders(mobiles.find((k) => holders(k).length === 1))[0].member, 'mobile'];
        else if (card(r.cf_contacts_membershipid) && ix.card.get(card(r.cf_contacts_membershipid))) [m, via] = [ix.card.get(card(r.cf_contacts_membershipid)).member, 'card'];
        else if (r.email && ix.email.get(String(r.email).trim().toLowerCase())) [m, via] = [ix.email.get(String(r.email).trim().toLowerCase()), 'email'];
      }
      if (!m) {
        s.notFound += cases.length;
        const day = new Date().toISOString().slice(0, 10);
        for (const c of cases) c.source.linkTried = day; // the nightly sync does not look these up again
        continue;
      }
      const how = { vtiger: 'the same Vtiger contact', mobile: 'its mobile', card: 'its membership card no.', email: 'its email' }[via];
      for (const c of cases) {
        if (c.memberId) continue;
        c.memberId = m.id;
        if (!c.businessName) c.businessName = m.businessName || '';
        core.log(c, { by: 'System', type: 'note', text: `Linked to contact ${m.id} (${m.businessName || m.ownerName || ''}) by ${how}${r.contact_no ? `, Vtiger contact ${r.contact_no}` : ''}` });
        s.linked++;
        s.via[via]++;
      }
    }
    s.looked += part.length;
    ctx.setState({ ...s });
    if ((i / LOOKUP) % 10 === 9) save(); // write the links every 1,000 contacts
  }
  save();
  ctx.setState({ ...s, status: 'done', finishedAt: new Date().toISOString() });
}
