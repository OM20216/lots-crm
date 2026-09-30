import { useState } from 'react';
import { CONTACT, EMAIL_TEMPLATES, KB, SCRIPTS } from '../knowledge.js';
import { copy } from '../ui.jsx';

export default function Knowledge() {
  const [q, setQ] = useState('');
  const s = q.toLowerCase();
  const kb = KB.filter((k) => !s || k.title.toLowerCase().includes(s) || k.tags.includes(s) || k.points.some((p) => p.toLowerCase().includes(s)));

  return (
    <>
      <div className="page-head">
        <h1>Knowledge base</h1>
        <span className="muted">
          Care {CONTACT.phone} · {CONTACT.email} · {CONTACT.hours}
        </span>
      </div>
      <div className="card filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: return, delivery, add-on, MOV, GST…" autoFocus />
      </div>
      <div className="kb-grid">
        {kb.map((k) => (
          <section className="card" key={k.title}>
            <h3>{k.title}</h3>
            {k.conflict && <div className="conflict">SOP conflict: {k.conflict}</div>}
            <ul className="tight">
              {k.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="section-title">Call scripts</h2>
      <div className="kb-grid">
        {SCRIPTS.map((t) => (
          <section className="card" key={t.title}>
            <div className="row between">
              <h3>{t.title}</h3>
              <button className="btn sm" onClick={() => copy(t.text)}>
                Copy
              </button>
            </div>
            <p>{t.text}</p>
          </section>
        ))}
      </div>

      <h2 className="section-title">Email templates</h2>
      <div className="kb-grid">
        {EMAIL_TEMPLATES.map((t) => (
          <section className="card" key={t.id}>
            <div className="row between">
              <h3>{t.title}</h3>
              <button className="btn sm" onClick={() => copy(t.body)}>
                Copy
              </button>
            </div>
            <div className="tpl-subject">{t.subject}</div>
            <pre className="tpl-body">{t.body}</pre>
          </section>
        ))}
      </div>
    </>
  );
}
