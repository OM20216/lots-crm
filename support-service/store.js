// Tiny JSON store for support tokens. It lives outside the CRM database on purpose: the support
// service must keep working when the CRM (or MySQL) is down.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file); // replace atomically
}

export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ticketsFile = path.join(dir, 'tickets.json');
  const settingsFile = path.join(dir, 'settings.json');

  const data = readJson(ticketsFile, { counter: 0, tickets: [] });
  data.tickets = Array.isArray(data.tickets) ? data.tickets : [];
  let settings = { managerEmail: '', clientCc: '', teamsNotify: true, ...readJson(settingsFile, {}) };

  // The counter may be behind imported tokens: never reuse an existing id.
  for (const t of data.tickets) {
    const n = Number(String(t?.id || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > data.counter) data.counter = n;
  }

  let writing = Promise.resolve();
  const save = () => {
    writing = writing.then(() => writeJson(ticketsFile, data));
    return writing;
  };

  return {
    dir,
    tickets: () => data.tickets,
    nextId() {
      data.counter = (Number(data.counter) || 0) + 1;
      return 'SUP-' + String(data.counter).padStart(6, '0');
    },
    settings: () => ({ ...settings }),
    updateSettings(patch) {
      if ('managerEmail' in patch) settings.managerEmail = String(patch.managerEmail || '').trim();
      if ('clientCc' in patch) settings.clientCc = String(patch.clientCc || '').trim();
      if ('teamsNotify' in patch) settings.teamsNotify = Boolean(patch.teamsNotify);
      writeJson(settingsFile, settings);
      return { ...settings };
    },
    save,
  };
}
