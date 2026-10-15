import { useState } from 'react';
import { api } from '../api.js';
import { BASE_LISTS } from '../picklists.js';
import { fmtDate, useMeta, usePicklists } from '../ui.jsx';

// Picklist Manager (as in the PSRI CRM): the values of every dropdown.
// Values from LOTS's case master are fixed; values added here can be removed.
export default function Picklists() {
  const { picklists, reloadMeta } = useMeta();
  const { lists } = usePicklists();
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [newList, setNewList] = useState({ name: '', value: '' });
  const [filter, setFilter] = useState('');

  const show = (text, bad) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 3000);
  };
  const added = (field, value) => (picklists?.[field] || []).find((x) => x.value === value);

  async function addValue(field, value, after) {
    value = (value || '').trim();
    if (!field.trim() || !value) return;
    setBusy(field);
    try {
      await api.post('/picklists', { field: field.trim(), value });
      await reloadMeta();
      after?.();
      show(`Added "${value}" to ${field.trim()}`);
    } catch (e) {
      show(e.message, true);
    }
    setBusy('');
  }

  async function remove(field, value) {
    if (!confirm(`Remove "${value}" from ${field}? Dependency pairs that use it are removed too. Cases already saved keep the value.`)) return;
    try {
      await api.del('/picklists', { field, value });
      await reloadMeta();
      show(`Removed "${value}"`);
    } catch (e) {
      show(e.message, true);
    }
  }

  const names = Object.keys(lists).filter((n) => !filter || n.toLowerCase().includes(filter.toLowerCase()) || lists[n].some((v) => v.toLowerCase().includes(filter.toLowerCase())));

  return (
    <>
      {toast && <div className={`toast ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>}
      <div className="page-head">
        <div>
          <h1>Picklists</h1>
          <span className="muted">Values of the dropdowns used in cases and contacts. Grey values come from the LOTS case master; values added here show a ×.</span>
        </div>
        <input className="pk-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search lists and values…" />
      </div>

      <div className="pk-grid">
        {names.map((name) => (
          <section className="card pk-card" key={name}>
            <h3>
              {name} <span className="muted small">{lists[name].length}</span>
              {!BASE_LISTS[name] && <span className="tag">new list</span>}
            </h3>
            <div className="pk-chips">
              {lists[name].length === 0 && <span className="muted small">No values yet</span>}
              {lists[name].map((v) => {
                const a = added(name, v);
                return (
                  <span key={v} className={`pk-chip ${a ? 'added' : ''}`} title={a ? `Added by ${a.by} · ${fmtDate(a.at)}` : 'From the case master'}>
                    {v}
                    {a && (
                      <button type="button" onClick={() => remove(name, v)} aria-label={`Remove ${v}`}>
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="pk-add">
              <input
                value={drafts[name] || ''}
                onChange={(e) => setDrafts({ ...drafts, [name]: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addValue(name, drafts[name], () => setDrafts({ ...drafts, [name]: '' }))}
                placeholder={`Add a value to ${name}…`}
              />
              <button className="btn sm" disabled={busy === name || !(drafts[name] || '').trim()} onClick={() => addValue(name, drafts[name], () => setDrafts({ ...drafts, [name]: '' }))}>
                {busy === name ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </section>
        ))}

        <section className="card pk-card pk-new">
          <h3>+ New picklist</h3>
          <form
            className="pk-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              addValue(newList.name, newList.value, () => setNewList({ name: '', value: '' }));
            }}
          >
            <input value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} placeholder="List name (e.g. Complaint Source)" />
            <input value={newList.value} onChange={(e) => setNewList({ ...newList, value: e.target.value })} placeholder="First value" disabled={!newList.name.trim()} />
            <button className="btn primary" type="submit" disabled={!newList.name.trim() || !newList.value.trim()}>
              Create list
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
