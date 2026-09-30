import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { CONFIRMATION_OUTCOMES, LEAD_OUTCOMES, LEAD_TYPES } from '../taxonomy.js';
import { Link } from 'react-router-dom';
import { CallButton } from '../components/Dialer.jsx';
import { SCRIPTS } from '../knowledge.js';
import { Empty, Field, Select, fmtDate, storeLabel, useLoad, useMeta } from '../ui.jsx';

const LEAD_PITCH = {
  'New registration': 'Explain the membership process and documents (see Knowledge base → Membership).',
  'Inactive customer': 'Ask what issue they face in purchasing from LOTS, resolve concerns, share current offers to bring them back.',
  'Order on call': 'Share current offers, schemes and prices; take the order on call and record it in OMS.',
  'LCC (Lots Club Card)': 'LCC benefits: delivery within 24 hours, zero delivery charges, personal assistance in store.',
  'Confirmation / resolution': 'Confirm the customer is satisfied and the concern is resolved.',
  'Festival & seasonal offers': 'Share the running festival / seasonal offers; invite them to the store or the LOTS app.',
};

export default function Leads() {
  const nav = useNavigate();
  const { stores, agent, refreshStats } = useMeta();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('New,Call back');
  const [leads, reload] = useLoad(() => api.get(`/leads?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`), [type, status]);
  const [active, setActive] = useState(null);
  const [outcome, setOutcome] = useState({ outcome: '', note: '', callbackAt: '' });
  const [imp, setImp] = useState({ open: false, type: LEAD_TYPES[0], text: '' });

  const [err, setErr] = useState('');

  async function saveOutcome(l) {
    if (!outcome.outcome) return;
    setErr('');
    try {
      await api.patch('/leads/' + l.id, { ...outcome, callbackAt: outcome.callbackAt ? new Date(outcome.callbackAt).toISOString() : null });
    } catch (e) {
      return setErr(`${l.id}: ${e.message}`);
    }
    setActive(null);
    setOutcome({ outcome: '', note: '', callbackAt: '' });
    reload();
    refreshStats();
  }

  async function importLeads() {
    // one lead per line: name, phone, business, store code
    const rows = imp.text
      .split('\n')
      .map((line) => line.split(/[,\t]/).map((s) => s.trim()))
      .filter((r) => r.some(Boolean))
      .map(([name, phone, businessName, store]) => ({ type: imp.type, name, phone, businessName, store }));
    if (!rows.length) return;
    await api.post('/leads', rows);
    setImp({ ...imp, open: false, text: '' });
    reload();
    refreshStats();
  }

  return (
    <>
      <div className="page-head">
        <h1>Outbound leads</h1>
        <button className="btn primary" onClick={() => setImp({ ...imp, open: !imp.open })}>
          Import leads
        </button>
      </div>
      <div className="card script">
        <strong>Opening:</strong> {SCRIPTS[3].text.replace('[Name]', agent)} <br />
        <strong>Closing:</strong> {SCRIPTS[4].text} <span className="muted small">· target 80–100 calls a day</span>
      </div>

      {imp.open && (
        <section className="card">
          <h2>Import leads</h2>
          <div className="grid">
            <Field label="Lead type">
              <Select value={imp.type} options={LEAD_TYPES} onChange={(v) => setImp({ ...imp, type: v })} />
            </Field>
          </div>
          <Field label="One per line: name, phone, business name, store code (paste from Excel works too)" wide>
            <textarea rows={6} value={imp.text} onChange={(e) => setImp({ ...imp, text: e.target.value })} placeholder={'Ramesh Kumar, 9876543210, Kumar Kirana, 103\nSunita, 9811122233, Sunita Caterers, 101'} />
          </Field>
          <div className="row end">
            <button className="btn primary" onClick={importLeads}>
              Import
            </button>
          </div>
        </section>
      )}

      <div className="card filters">
        <Select value={type} options={LEAD_TYPES} onChange={setType} placeholder="All lead types" />
        <Select
          value={status}
          onChange={setStatus}
          options={[
            { value: 'New,Call back', label: 'To call (new + call back)' },
            ...['New', 'Call back', 'Not reachable', 'Interested', 'Order placed', 'Converted', 'Concern raised', 'Not interested', 'Confirmed resolved', 'Not satisfied', 'Case closed'].map((s) => ({ value: s, label: s })),
          ]}
          placeholder="Any status"
        />
        {type && <span className="muted small">{LEAD_PITCH[type]}</span>}
      </div>

      {err && <div className="error">{err}</div>}
      <section className="card">
        {!leads ? (
          <Empty>Loading…</Empty>
        ) : leads.length === 0 ? (
          <Empty>No leads here. Use “Import leads” to add a calling list.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Type</th>
                <th>Store</th>
                <th>Status</th>
                <th>Last call</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const last = l.log[l.log.length - 1];
                return (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.businessName || l.name}</strong>
                      <div className="muted small">
                        {l.name} · {l.phone}
                      </div>
                    </td>
                    <td className="small">
                      {l.type}
                      {l.caseId && (
                        <div>
                          <Link to={`/cases/${l.caseId}`}>{l.caseId}</Link>
                        </div>
                      )}
                      {l.notes && <div className="muted">{l.notes}</div>}
                    </td>
                    <td>{storeLabel(stores, l.store)}</td>
                    <td>
                      {l.status}
                      {l.callbackAt && <div className="muted small">call back {fmtDate(l.callbackAt)}</div>}
                    </td>
                    <td className="small">{last ? `${fmtDate(last.at)} · ${last.by}${last.note ? ' · ' + last.note : ''}` : '—'}</td>
                    <td>
                      {active === l.id ? (
                        <div className="followup-box">
                          <Select value={outcome.outcome} options={l.caseId ? CONFIRMATION_OUTCOMES : LEAD_OUTCOMES} onChange={(v) => setOutcome({ ...outcome, outcome: v })} placeholder="Call outcome…" />
                          {outcome.outcome === 'Call back' && <input type="datetime-local" value={outcome.callbackAt} onChange={(e) => setOutcome({ ...outcome, callbackAt: e.target.value })} />}
                          <input value={outcome.note} onChange={(e) => setOutcome({ ...outcome, note: e.target.value })} placeholder={outcome.outcome === 'Order placed' ? 'OMS order no.' : 'Note'} />
                          <div className="small muted">{LEAD_PITCH[l.type]}</div>
                          <div className="row">
                            <button className="btn sm" onClick={() => setActive(null)}>
                              Cancel
                            </button>
                            <button className="btn primary sm" onClick={() => saveOutcome(l)} disabled={!outcome.outcome}>
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="row wrap">
                          <CallButton phone={l.phone} context={{ leadId: l.id, caseId: l.caseId }} />
                          <button className="btn sm" onClick={() => setActive(l.id)}>
                            Log call
                          </button>
                          <button
                            className="btn sm"
                            onClick={() => nav(`/new?channel=Outbound call&phone=${l.phone}&name=${encodeURIComponent(l.name)}&business=${encodeURIComponent(l.businessName)}&store=${l.store}&leadId=${l.id}`)}
                          >
                            Concern raised → case
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
