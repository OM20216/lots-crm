// Support-token stores. The default store is MySQL (support-service/mysql-store.js) — the tokens live
// in the company's existing `lots` database, in two tables of their own. This file keeps the JSON file
// store as the fallback for a machine without MySQL settings, plus the manager-settings file helpers
// that both stores share ("configuration", not ticket data — it stays in the local settings.json).
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

// Manager settings (notification email, Cc, Teams toggle) are kept in settings.json in the data folder
// for both stores; every method is sync, exactly as the portals have always used them.
export function makeSettings(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'settings.json');
  let settings = { managerEmail: '', clientCc: '', teamsNotify: true, ...readJson(file, {}) };
  return {
    settings: () => ({ ...settings }),
    updateSettings(patch) {
      if ('managerEmail' in patch) settings.managerEmail = String(patch.managerEmail || '').trim();
      if ('clientCc' in patch) settings.clientCc = String(patch.clientCc || '').trim();
      if ('teamsNotify' in patch) settings.teamsNotify = Boolean(patch.teamsNotify);
      writeJson(file, settings);
      return { ...settings };
    },
  };
}

/** JSON file store — the fallback when support.env has no MySQL settings. Same async API as the MySQL store. */
export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ticketsFile = path.join(dir, 'tickets.json');
  const data = readJson(ticketsFile, { counter: 0, tickets: [] });
  data.tickets = Array.isArray(data.tickets) ? data.tickets : [];
  // The counter may be behind imported tokens: never reuse an existing id.
  for (const t of data.tickets) {
    const n = Number(String(t?.id || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > data.counter) data.counter = n;
  }
  const settingsStore = makeSettings(dir);

  let writing = Promise.resolve();
  const save = () => {
    writing = writing.then(() => writeJson(ticketsFile, data));
    return writing;
  };
  const find = (id) => data.tickets.find((t) => t.id === id) || null;

  return {
    backend: 'json',
    dir,
    ...settingsStore,
    async count() {
      return data.tickets.length;
    },
    async list(agent) {
      return agent
        ? data.tickets.filter((t) => String(t.agent).toLowerCase() === String(agent).toLowerCase())
        : data.tickets.slice();
    },
    async get(id) {
      return find(id);
    },
    async create(d) {
      data.counter = (Number(data.counter) || 0) + 1;
      const t = {
        id: 'SUP-' + String(data.counter).padStart(6, '0'),
        question: d.question,
        agent: d.agent,
        status: 'Open',
        createdAt: d.createdAt,
        updatedAt: d.createdAt,
        context: d.context || { page: '', caseId: '' },
        replies: [],
        notified: {},
        closedAt: '',
        closedBy: '',
      };
      data.tickets.push(t);
      await save();
      return t;
    },
    async saveReply(id, message, patch) {
      const t = find(id);
      if (!t) return null;
      t.replies.push(message);
      for (const [k, v] of Object.entries(patch || {})) t[k] = v;
      await save();
      return t;
    },
    async patch(id, fields) {
      const t = find(id);
      if (!t) return null;
      for (const [k, v] of Object.entries(fields || {})) t[k] = v;
      await save();
      return t;
    },
    async delete(id) {
      const i = data.tickets.findIndex((t) => t.id === id);
      if (i < 0) return false;
      data.tickets.splice(i, 1);
      await save();
      return true;
    },
  };
}
