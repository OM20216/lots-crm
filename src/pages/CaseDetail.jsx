import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, currentAgent } from '../api.js';
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
import EscalationPanel, { splitTarget, useTargets } from '../components/EscalationPanel.jsx';

const ENTRY_LABEL = {
  created: 'Created',
  status: 'Status',
  note: 'Note',
  call: 'Call',
  edit: 'Edited',
  'email-in': 'Email received',
  'email-out': 'Email sent',
  'store-followup': 'Follow-up',
  'store-update': 'Store update',
  escalation: 'Escalation',
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
  const [attachSel, setAttachSel] = useState([]); // case files to attach to the template email
  const [uploading, setUploading] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState(loc.state?.created ? `Case saved.${loc.state.warning ? ' ' + loc.state.warning : ''}` : '');

  const target = useEscalationTarget(c);
  const callerTypes = usePicklists().list('Caller Type');
  const targets = useTargets();
  const [sendTo, setSendTo] = useState(''); // escalate to a different store / team than the workflow's
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (c) setEdit(pickEditable(c));
  }, [c]);

  if (loadErr) return <Empty>{loadErr}</Empty>;
  if (!c || !edit) return <Empty>Loading…</Empty>;

  const tpl = EMAIL_TEMPLATES.find((t) => t.id === tplId);
  const pickTemplate = (id) => {
    setTplId(id);
    setAttachSel(id === 'escalate' || id === 'store-followup' ? (c.attachments || []).map((a) => a.file) : []);
  };

  // add files to the case (photo / bill from WhatsApp, a scan…)
  async function uploadFiles(fileList) {
    setErr('');
    let latest = null;
    for (const f of Array.from(fileList || [])) {
      setUploading(f.name);
      try {
        const res = await fetch(`/api/cases/${id}/attachments?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream', 'x-agent': currentAgent() }, body: f });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        latest = data.case;
      } catch (e) {
        setErr(`${f.name}: ${e.message}`);
      }
    }
    setUploading('');
    if (latest) setC({ ...latest, history: c.history });
  }
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
    if (action.to === 'Escalated' && sendTo) body.escalateTo = splitTarget(sendTo);
    patch(body, () => {
      setAction(null);
      setNote('');
      setSendTo('');
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
        kind: tpl.title,
        attachments: attachSel,
      });
      setC({ ...updated, history: c.history });
      setTplId('');
      setFlash(updated.sentTo === 'Teams preview' ? 'Email preview posted to Microsoft Teams (not sent to the recipient).' : 'Email sent.');
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

  // the next SOP step, in one sentence
  const nextText = {
    Pending: c.channel === 'Email' && uncategorised ? 'Email case: call the customer, fill in the category under Details, then choose what happens.' : 'Talk to the customer, then choose what happens:',
    Waiting: 'Waiting for the customer’s details. When they share them, move the case back.',
    Escalated: `With ${target?.name || 'the store'}. Call them daily until they reply (Follow-ups).`,
    Resolved: 'The store / team has replied. Call the customer to confirm, then close the case.',
    Closed: 'This case is closed.',
  }[c.status];
  const concern = [c.category, c.subCategory].filter(Boolean).join(' › ') || 'Not categorised yet';
  const detailRows = [
    ['Type of contact', c.callerType],
    ['Name', c.name],
    ['Phone', c.phone],
    ['Email', c.email],
    ['Business', c.businessName],
    ['Card no.', c.cardNo],
    ['Case type', c.caseType],
    ['Category', c.category],
    ['Sub-category', c.subCategory],
    ['Request for', c.requestFor],
    ['Sub-category 2', c.sub2],
    ['Resolution type', c.closureType],
    ['Store', c.store ? storeLabel(stores, c.store) : ''],
    ['Product', [c.productCategory, c.productType].filter(Boolean).join(' › ')],
    ['Invoice / order no.', c.orderRef],
    ['Purchase date', c.purchaseDate],
    ['Assigned to', c.assignedTo],
    ['Subject', c.subject],
  ].filter(([, v]) => v);
  const TABS = [
    ['details', 'Details'],
    ['timeline', `Timeline (${c.timeline.length})`],
    ['email', 'Email'],
    ['files', `Files${c.attachments?.length ? ` (${c.attachments.length})` : ''}`],
    ['calls', `Calls${c.calls?.length ? ` (${c.calls.length})` : ''}`],
    ['steps', 'Steps'],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {c.id} <StatusBadge status={c.status} /> {c.status === 'Escalated' && <Due iso={c.dueAt} />}
          </h1>
          <div className="case-summary">
            <strong>{concern}</strong> · {c.businessName || c.name || 'Customer'} {c.phone && `· ${c.phone}`} {c.store && `· ${storeLabel(stores, c.store)}`}
          </div>
          <div className="muted small">
            {c.channel} · created {fmtDate(c.createdAt)} by {c.createdBy}
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
        {STATUSES.map((st) => (
          <div key={st} className={`flow-step ${c.status === st ? 'on' : ''}`} title={STATUS_HELP[st]}>
            {st}
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

      <div className="two-col">
        <div>
          {/* ---------- what to do now ---------- */}
          <section className="card now-card">
            <h2>What to do now</h2>
            <p className="now-text">{nextText}</p>
            <div className="row wrap">
              {(ACTIONS[c.status] || []).map((a) => (
                <button key={a.to} className={`btn ${a.kind || ''} ${action?.to === a.to ? 'active' : ''}`} onClick={() => setAction(a)}>
                  {a.to === 'Escalated' && target ? a.label.replace('store', target.kind === 'team' ? target.name : 'store') : a.label}
                </button>
              ))}
            </div>
            {action && (
              <div className="action-box">
                <Field label={action.to === 'Escalated' ? `What ${target?.kind === 'team' ? target.name : 'the store'} needs to do` : action.to === 'Waiting' ? 'What information is missing?' : 'Note'} wide>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                </Field>
                {action.to === 'Escalated' && (
                  <Field label="Send to" hint={sendTo ? 'Your choice' : 'As per this case type'}>
                    <select value={sendTo} onChange={(e) => setSendTo(e.target.value)}>
                      <option value="">{target?.kind === 'store' && !target.code ? 'The store (pick it under Details first)' : target?.name}</option>
                      {targets.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
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
            {c.status === 'Escalated' && (
              <EscalationPanel
                embedded
                c={c}
                onChange={(updated) => {
                  setC({ ...updated, history: c.history });
                  refreshStats();
                }}
                onError={setErr}
              />
            )}
            {err && <div className="error">{err}</div>}
          </section>

          {/* ---------- everything else, one tab at a time ---------- */}
          <div className="case-tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <section className="card">
              {!editing && !dirty ? (
                <>
                  <div className="row between">
                    <h2>Details</h2>
                    <button className="btn sm" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                  </div>
                  <dl className="detail-list">
                    {detailRows.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.description && <div className="detail-text">{c.description}</div>}
                  <SopWarnings list={c.status === 'Closed' ? [] : sopWarnings(c)} />
                </>
              ) : (
                <>
                  <div className="row between">
                    <h2>Edit details</h2>
                    <div className="row">
                      <button className="btn" onClick={() => (setEdit(pickEditable(c)), setEditing(false))}>
                        Cancel
                      </button>
                      <button className="btn primary" disabled={!dirty} onClick={() => patch(edit, () => (setFlash('Details saved.'), setEditing(false)))}>
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="grid">
                    <Field label="Type of contact">
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
                      <SopWarnings list={sopWarnings(edit)} />
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
                </>
              )}
            </section>
          )}

          {tab === 'timeline' && (
            <section className="card">
              <div className="add-entry">
                <div className="row">
                  <Select
                    value={noteType}
                    onChange={(v) => setNoteType(v || 'note')}
                    options={[
                      { value: 'note', label: 'Internal note' },
                      { value: 'call', label: 'Call with customer' },
                      { value: 'store-followup', label: 'Store / team follow-up call' },
                    ]}
                    placeholder="Entry type"
                  />
                  <Select value="" onChange={(v) => v && setNote(v)} options={CRM_NOTE_TEMPLATES.map((t) => ({ value: t, label: t.slice(0, 60) + '…' }))} placeholder="Insert SOP note…" />
                </div>
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (saved with your name and the time)" />
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
          )}

          {tab === 'email' && (
            <section className="card">
              <h2>Send an email</h2>
              <Select value={tplId} onChange={pickTemplate} options={EMAIL_TEMPLATES.map((t) => ({ value: t.id, label: t.title }))} placeholder="Choose a template…" />
              {tpl && (
                <>
                  <div className="tpl-subject">{fillTemplate(tpl.subject, c, stores)}</div>
                  <pre className="tpl-body">{fillTemplate(tpl.body, c, stores)}</pre>
                  {c.attachments?.length > 0 && (
                    <div className="attach-pick">
                      <span className="small muted">Attach files:</span>
                      {c.attachments.map((a) => (
                        <label key={a.file} className="small">
                          <input type="checkbox" checked={attachSel.includes(a.file)} onChange={(e) => setAttachSel(e.target.checked ? [...attachSel, a.file] : attachSel.filter((x) => x !== a.file))} /> 📎 {a.name}{' '}
                          <span className="muted">{Math.max(1, Math.round((a.size || 0) / 1024))} KB</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="row wrap">
                    {integrations?.teamsPreview ? (
                      <button className="btn primary" onClick={sendTemplate} disabled={sending}>
                        {sending ? 'Posting…' : 'Send now (preview in Teams)'}
                      </button>
                    ) : integrations?.mail ? (
                      <button className="btn primary" onClick={sendTemplate} disabled={sending || !((tpl.id === 'escalate' || tpl.id === 'store-followup') ? target?.email : c.email)}>
                        {sending ? 'Sending…' : 'Send now'}
                      </button>
                    ) : (
                      <button className="btn primary" onClick={logTemplateSent}>
                        Log as sent
                      </button>
                    )}
                    <button className="btn" onClick={() => copy(fillTemplate(tpl.body, c, stores))}>
                      Copy
                    </button>
                    <a className="btn" href={mailTo}>
                      Open in mail app
                    </a>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'files' && (
            <section className="card">
              <h2>Files</h2>
              {c.attachments?.length > 0 ? (
                <ul className="tight">
                  {c.attachments.map((a) => (
                    <li key={a.file}>
                      <a href={`/api/cases/${c.id}/attachments/${encodeURIComponent(a.file)}`}>{a.name}</a>{' '}
                      <span className="muted small">
                        {Math.max(1, Math.round((a.size || 0) / 1024))} KB{a.by ? ` · added by ${a.by}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="muted small">No files yet.</div>
              )}
              <label className="btn sm upload-btn">
                {uploading ? `Uploading ${uploading}…` : '+ Add file'}
                <input type="file" multiple hidden disabled={!!uploading} onChange={(e) => (uploadFiles(e.target.files), (e.target.value = ''))} />
              </label>
              <div className="muted small">Escalation emails carry these files automatically (up to 3 MB each).</div>
            </section>
          )}

          {tab === 'calls' && <CallsCard c={c} onChange={(updated) => setC({ ...updated, history: c.history })} />}

          {tab === 'steps' && <WorkflowCard c={c} onTick={(body) => patch(body)} />}
        </div>

        {/* ---------- the context an agent needs on a call ---------- */}
        <aside>
          <div className="card">
            <h3>Customer</h3>
            <div className="small">
              <strong>{c.businessName || c.name || '—'}</strong>
              {c.businessName && c.name && <div>{c.name}</div>}
              <div>{c.phone}</div>
              <div>{c.email}</div>
              {c.memberId && <div className="muted">Member {c.memberId}</div>}
            </div>
            {c.history?.length > 0 && (
              <>
                <div className="muted small" style={{ marginTop: 8 }}>
                  Other cases
                </div>
                <ul className="tight">
                  {c.history.slice(0, 5).map((h) => (
                    <li key={h.id} className="small">
                      <Link to={`/cases/${h.id}`}>{h.id}</Link> · {h.subCategory || h.category || '—'} <StatusBadge status={h.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {store && (
            <div className="card">
              <h3>Store</h3>
              <div className="small">
                <strong>
                  {store.code} {store.name}
                </strong>
                <div>{store.hours}</div>
                <div>
                  Contact: {store.spocName || <span className="muted">not set</span>} {store.spocPhone}
                </div>
                {!store.spocEmail && <Link to="/settings">Add store contact</Link>}
              </div>
            </div>
          )}
          {requirementsFor(c) && (
            <div className="card req-card">
              <h3>Documents needed</h3>
              <ul className="tight">
                {requirementsFor(c).items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function pickEditable(c) {
  const keys = ['callerType', 'name', 'phone', 'email', 'businessName', 'cardNo', 'store', 'caseType', 'category', 'subCategory', 'requestFor', 'sub2', 'closureType', 'productType', 'productCategory', 'orderRef', 'purchaseDate', 'subject', 'description', 'assignedTo'];
  return Object.fromEntries(keys.map((k) => [k, c[k] || '']));
}
