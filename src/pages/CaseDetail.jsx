import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ACTIONS, STATUSES, STATUS_HELP } from '../taxonomy.js';
import { CRM_NOTE_TEMPLATES, EMAIL_TEMPLATES, fillTemplate } from '../knowledge.js';
import { Due, Empty, Field, Select, StatusBadge, copy, fmtDate, storeLabel, useLoad, useMeta, usePicklists } from '../ui.jsx';
import Classifier from '../components/Classifier.jsx';
import CallsCard from '../components/CallsCard.jsx';
import { CallButton } from '../components/Dialer.jsx';
import { requirementsFor, sopWarnings } from '../requirements.js';
import { SopWarnings } from './NewCase.jsx';
import { SCRIPTS } from '../knowledge.js';
import WorkflowCard, { useEscalationTarget } from '../components/WorkflowCard.jsx';

const ENTRY_LABEL = {
  created: 'Created',
  status: 'Status',
  note: 'Note',
  call: 'Call',
  edit: 'Edited',
  'email-in': 'Email received',
  'email-out': 'Email sent',
  'store-followup': 'Follow-up',
  workflow: 'Workflow step',
};

export default function CaseDetail() {
  const { id } = useParams();
  const loc = useLocation();
  const { stores, agents, refreshStats, integrations } = useMeta();
  const [sending, setSending] = useState(false);
  const [closingDone, setClosingDone] = useState(false);
  const [c, reload, loadErr, setC] = useLoad(() => api.get('/cases/' + id), [id]);
  const [edit, setEdit] = useState(null);
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState('note');
  const [tplId, setTplId] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState(loc.state?.created ? `Case saved.${loc.state.warning ? ' ' + loc.state.warning : ''}` : '');

  const target = useEscalationTarget(c);
  const callerTypes = usePicklists().list('Caller Type');

  useEffect(() => {
    if (c) setEdit(pickEditable(c));
  }, [c]);

  if (loadErr) return <Empty>{loadErr}</Empty>;
  if (!c || !edit) return <Empty>Loading…</Empty>;

  const tpl = EMAIL_TEMPLATES.find((t) => t.id === tplId);
  const store = stores.find((s) => s.code === c.store);
  const dirty = JSON.stringify(edit) !== JSON.stringify(pickEditable(c));
  const uncategorised = !c.caseType || !c.category;

  async function patch(body, done) {
    setErr('');
    try {
      const updated = await api.patch('/cases/' + id, body);
      setC({ ...updated, history: c.history });
      refreshStats();
      done?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  function runAction() {
    const body = { status: action.to, note };
    if (dirty) Object.assign(body, edit);
    patch(body, () => {
      setAction(null);
      setNote('');
      setFlash(`Moved to ${action.to}.`);
    });
  }

  function addEntry() {
    if (!note.trim()) return;
    patch({ note, noteType }, () => setNote(''));
  }

  async function sendTemplate() {
    setErr('');
    setSending(true);
    const toStore = tpl.id === 'escalate' || tpl.id === 'store-followup';
    try {
      const updated = await api.post(`/cases/${id}/email`, {
        to: toStore ? target?.email : c.email,
        subject: fillTemplate(tpl.subject, c, stores),
        body: fillTemplate(tpl.body, c, stores),
      });
      setC({ ...updated, history: c.history });
      setTplId('');
      setFlash('Email sent.');
    } catch (e) {
      setErr(e.message);
    }
    setSending(false);
  }

  function logTemplateSent() {
    patch({ note: `${tpl.title}\n\n${fillTemplate(tpl.body, c, stores)}`, noteType: 'email-out' }, () => setTplId(''));
  }

  const mailTo = tpl
    ? `mailto:${tpl.id === 'escalate' || tpl.id === 'store-followup' ? target?.email || '' : c.email}?subject=${encodeURIComponent(fillTemplate(tpl.subject, c, stores))}&body=${encodeURIComponent(fillTemplate(tpl.body, c, stores))}`
    : '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {c.id} <StatusBadge status={c.status} /> {c.status === 'Escalated' && <Due iso={c.dueAt} />}
            {c.status === 'Escalated' && c.dueAt && <span className="edc">EDC {new Date(c.dueAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{c.escalationLevel > 1 ? ` · level ${c.escalationLevel}` : ''}</span>}
          </h1>
          <div className="muted">
            {c.channel} · created {fmtDate(c.createdAt)} by {c.createdBy} · updated {fmtDate(c.updatedAt)}
            {c.resolutionType && ` · ${c.resolutionType === 'ROT' ? 'Resolved over telephone' : 'Store resolution'}`}
          </div>
        </div>
        <div className="row">
          <CallButton phone={c.phone} context={{ caseId: c.id }} label="Call customer" />
          <Link to="/cases" className="btn">
            ← All cases
          </Link>
        </div>
      </div>

      <div className="flow">
        {STATUSES.map((s) => (
          <div key={s} className={`flow-step ${c.status === s ? 'on' : ''}`} title={STATUS_HELP[s]}>
            {s}
          </div>
        ))}
      </div>

      {flash && (
        <div className="notice ok" onClick={() => setFlash('')}>
          {flash}
        </div>
      )}
      {loc.state?.created && c.channel !== 'Email' && !closingDone && (
        <div className="notice anything-else">
          <strong>“Is there anything else I can assist you with?”</strong>
          <div className="row wrap">
            <Link
              className="btn primary sm"
              to={`/new?phone=${encodeURIComponent(c.phone)}&name=${encodeURIComponent(c.name)}&business=${encodeURIComponent(c.businessName)}&store=${c.store}&channel=${encodeURIComponent(c.channel)}${c.calls?.[0]?.txnId ? '&txn=' + encodeURIComponent(c.calls[0].txnId) : ''}`}
            >
              Yes, next concern (same caller)
            </Link>
            <button className="btn sm" onClick={() => setClosingDone(true)}>
              No, end the call
            </button>
          </div>
        </div>
      )}
      {closingDone && <div className="notice ok">“{SCRIPTS[2].text.split('… ')[1]}”</div>}
      {c.channel === 'Email' && uncategorised && <div className="notice">Email case: call the customer to get the complete details, then categorise it below and save.</div>}

      <div className="two-col">
        <div>
          <section className="card">
            <h2>Next step</h2>
            <div className="row wrap">
              {(ACTIONS[c.status] || []).map((a) => (
                <button key={a.to} className={`btn ${a.kind || ''} ${action?.to === a.to ? 'active' : ''}`} onClick={() => setAction(a)}>
                  {a.to === 'Escalated' && target ? a.label.replace('store', target.kind === 'team' ? target.name : 'store') : a.label}
                </button>
              ))}
            </div>
            {action && (
              <div className="action-box">
                <Field label={action.to === 'Escalated' ? `What ${target?.kind === 'team' ? target.name : 'the store'} needs to do` : action.to === 'Waiting' ? 'Information requested from customer' : 'Note'} wide>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                </Field>
                {action.to === 'Escalated' && (
                  <div className="muted small">
                    Goes to: {target?.kind === 'store' && !target.code ? 'select a store in the details below first' : `${target?.name}${target?.contact ? ' · ' + target.contact : ''} ${target?.email || '(no email set: Stores & settings)'}`}. The escalation email is sent automatically when Automation has it on; otherwise send the “Escalation” template.
                  </div>
                )}
                <div className="row end">
                  <button className="btn" onClick={() => setAction(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" onClick={runAction}>
                    Confirm: {action.label}
                  </button>
                </div>
              </div>
            )}
            {err && <div className="error">{err}</div>}
          </section>

          <WorkflowCard c={c} onTick={(body) => patch(body)} />

          <section className="card">
            <div className="row between">
              <h2>Details</h2>
              {dirty && (
                <div className="row">
                  <button className="btn" onClick={() => setEdit(pickEditable(c))}>
                    Discard
                  </button>
                  <button className="btn primary" onClick={() => patch(edit, () => setFlash('Details saved.'))}>
                    Save details
                  </button>
                </div>
              )}
            </div>
            <div className="grid">
              <Field label="Caller type">
                <Select value={edit.callerType} options={callerTypes} onChange={(v) => setEdit({ ...edit, callerType: v })} />
              </Field>
              <Field label="Name">
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="Business name">
                <input value={edit.businessName} onChange={(e) => setEdit({ ...edit, businessName: e.target.value })} />
              </Field>
              <Field label="Card no.">
                <input value={edit.cardNo} onChange={(e) => setEdit({ ...edit, cardNo: e.target.value })} />
              </Field>
              <Classifier value={edit} onChange={setEdit} />
              {edit.subCategory === 'Return Of Goods' && (
                <Field label="Purchase date" hint="SOP: returns within 7 working days">
                  <input type="date" value={edit.purchaseDate} onChange={(e) => setEdit({ ...edit, purchaseDate: e.target.value })} />
                </Field>
              )}
              <div className="field wide">
                <SopWarnings list={c.status === 'Closed' ? [] : sopWarnings(edit)} />
              </div>
              <Field label="Assigned to">
                <Select value={edit.assignedTo} options={agents} onChange={(v) => setEdit({ ...edit, assignedTo: v })} placeholder="Unassigned" />
              </Field>
              <Field label="Subject" wide>
                <input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
              </Field>
              <Field label="Details" wide>
                <textarea rows={4} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="card">
            <h2>Timeline</h2>
            <div className="add-entry">
              <div className="row">
                <Select
                  value={noteType}
                  onChange={(v) => setNoteType(v || 'note')}
                  options={[
                    { value: 'note', label: 'Internal note' },
                    { value: 'call', label: 'Call with customer' },
                    { value: 'store-followup', label: 'Store follow-up' },
                    { value: 'email-in', label: 'Customer email received' },
                    { value: 'email-out', label: 'Email sent' },
                  ]}
                  placeholder="Entry type"
                />
                <Select value="" onChange={(v) => v && setNote(v)} options={CRM_NOTE_TEMPLATES.map((t) => ({ value: t, label: t.slice(0, 60) + '…' }))} placeholder="Insert CRM note template…" />
              </div>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (recorded with your name and time)" />
              <div className="row end">
                <button className="btn primary" onClick={addEntry} disabled={!note.trim() || !!action}>
                  Add to timeline
                </button>
              </div>
            </div>
            <ul className="timeline">
              {[...c.timeline].reverse().map((t, i) => (
                <li key={i} className={`tl-${t.type}`}>
                  <div className="tl-head">
                    <strong>{ENTRY_LABEL[t.type] || t.type}</strong>
                    {t.type === 'status' && (
                      <>
                        {' '}
                        <StatusBadge status={t.from} /> → <StatusBadge status={t.to} />
                      </>
                    )}
                    <span className="muted small">
                      {' '}
                      · {t.by} · {fmtDate(t.at)}
                    </span>
                  </div>
                  {t.subject && <div className="small">Subject: {t.subject}</div>}
                  {t.text && <div className="tl-text">{t.text}</div>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside>
          <CallsCard c={c} onChange={(updated) => setC({ ...updated, history: c.history })} />
          <div className="card">
            <h3>Reply templates</h3>
            <Select value={tplId} onChange={setTplId} options={EMAIL_TEMPLATES.map((t) => ({ value: t.id, label: t.title }))} placeholder="Choose a template…" />
            {tpl && (
              <>
                <div className="tpl-subject">{fillTemplate(tpl.subject, c, stores)}</div>
                <pre className="tpl-body">{fillTemplate(tpl.body, c, stores)}</pre>
                <div className="row wrap">
                  <button className="btn" onClick={() => copy(fillTemplate(tpl.body, c, stores))}>
                    Copy
                  </button>
                  <a className="btn" href={mailTo}>
                    Open in mail app
                  </a>
                  {integrations?.mail ? (
                    <button className="btn primary" onClick={sendTemplate} disabled={sending || !((tpl.id === 'escalate' || tpl.id === 'store-followup') ? target?.email : c.email)}>
                      {sending ? 'Sending…' : 'Send now'}
                    </button>
                  ) : (
                    <button className="btn primary" onClick={logTemplateSent}>
                      Log as sent
                    </button>
                  )}
                </div>
                <div className="muted small">Keep [{c.id}] in the subject so the customer’s reply threads back onto this case.</div>
              </>
            )}
          </div>
          {requirementsFor(c.subCategory) && (
            <div className="card req-card">
              <h3>Request requirements</h3>
              <ul className="tight">
                {requirementsFor(c.subCategory).items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {c.attachments?.length > 0 && (
            <div className="card">
              <h3>Attachments</h3>
              <ul className="tight">
                {c.attachments.map((a) => (
                  <li key={a.file}>
                    <a href={`/api/cases/${c.id}/attachments/${encodeURIComponent(a.file)}`}>{a.name}</a> <span className="muted small">{Math.round((a.size || 0) / 1024)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card">
            <h3>Store</h3>
            {store ? (
              <div className="small">
                <strong>
                  {store.code} {store.name}
                </strong>
                <div>{store.hours}</div>
                <div>SPOC: {store.spocName || <span className="muted">not set</span>}</div>
                <div>{store.spocPhone}</div>
                <div>{store.spocEmail}</div>
                {!store.spocEmail && <Link to="/settings">Add store SPOC details</Link>}
              </div>
            ) : (
              <span className="muted small">No store selected</span>
            )}
          </div>
          <div className="card">
            <h3>Customer history</h3>
            {c.memberId && <div className="small">Member {c.memberId}</div>}
            {c.history?.length ? (
              <ul className="tight">
                {c.history.map((h) => (
                  <li key={h.id}>
                    <Link to={`/cases/${h.id}`}>{h.id}</Link> · {fmtDate(h.createdAt)} · {h.subCategory || h.category || '—'} <StatusBadge status={h.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted small">No other cases from this customer.</span>
            )}
          </div>
          <div className="card small">
            <h3>Status guide</h3>
            {STATUSES.map((s) => (
              <div key={s}>
                <StatusBadge status={s} /> {STATUS_HELP[s]}
              </div>
            ))}
            <div className="muted">Store in this case: {storeLabel(stores, c.store)}</div>
          </div>
        </aside>
      </div>
    </>
  );
}

function pickEditable(c) {
  const keys = ['callerType', 'name', 'phone', 'email', 'businessName', 'cardNo', 'store', 'caseType', 'category', 'subCategory', 'productCategory', 'orderRef', 'purchaseDate', 'subject', 'description', 'assignedTo'];
  return Object.fromEntries(keys.map((k) => [k, c[k] || '']));
}
