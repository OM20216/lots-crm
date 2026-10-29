import { useEffect, useState } from 'react';
import { api } from '../api.js';

const n = (v) => Number(v || 0).toLocaleString('en-IN');

// Vtiger cases straight from Vtiger. The server reads them with the access key in the private secrets file, in the
// background, and saves what it read; closing this page does not stop it.
export default function CaseImport({ onDone }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const load = () =>
    api
      .get('/vtiger-cases')
      .then(setInfo)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  const job = info?.job;
  const running = info?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (job?.status === 'done') onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);
  async function act(path, body) {
    setErr('');
    try {
      await api.post(path, body || {});
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  if (!info) return null;
  if (!info.configured)
    return (
      <div className="notice small">
        <strong>Import cases from Vtiger:</strong> not set up. Add VTIGER_URL, VTIGER_USERNAME and VTIGER_ACCESS_KEY to the private secrets file on the CRM computer.
      </div>
    );
  const read = (job?.read || 0) + (job?.reading || 0);
  const pct = job?.total ? Math.min(100, Math.round((read / job.total) * 100)) : 0;
  const canContinue = job && ['stopped', 'error', 'done'].includes(job.status) && job.lastId;
  return (
    <div className="vt-import">
      <div className="row between">
        <strong>Import cases from Vtiger</strong>
        <span className="muted small">{job?.total ? `${n(job.total)} cases in Vtiger` : 'Reads every case from Vtiger, 200 at a time'}</span>
      </div>
      {job && (
        <>
          <div className="vt-bar">
            <div style={{ width: pct + '%' }} />
          </div>
          <div className="small">
            {running ? 'Importing… ' : job.status === 'done' ? 'Finished. ' : job.status === 'stopped' ? 'Stopped. ' : job.status === 'error' ? 'Stopped by an error. ' : ''}
            {n(read)} of {n(job.total)} read ({pct}%) · {n(job.added)} added · {n(job.existing)} already in the CRM · {n(job.linked)} linked to a contact.
          </div>
          {job.error && <div className="error">{job.error}</div>}
        </>
      )}
      {err && <div className="error">{err}</div>}
      <div className="row end">
        {running ? (
          <button className="btn" onClick={() => act('/vtiger-cases/import/stop')}>
            Stop
          </button>
        ) : (
          <>
            {canContinue && (
              <button className="btn primary" onClick={() => act('/vtiger-cases/import')}>
                {job.status === 'done' ? 'Get new cases from Vtiger' : `Continue from ${n(job.read)}`}
              </button>
            )}
            <button
              className={canContinue ? 'btn' : 'btn primary'}
              onClick={() =>
                (!job || window.confirm('Read all cases from Vtiger again from the start? Cases already in the CRM (same Vtiger case) are left untouched, not doubled.')) && act('/vtiger-cases/import', { fresh: true })
              }
            >
              {job ? 'Import again from the start' : 'Import all cases from Vtiger'}
            </button>
          </>
        )}
      </div>
      <CaseLink />
      <VtigerSync />
      <div className="muted small">
        Runs on the CRM server (about an hour for 1.9 lakh cases); you can close this page. Already imported cases are not changed. Only cases still open in
        Vtiger come in as Pending or Resolved; the rest are the Closed archive — never Waiting or Escalated, so no historical case emails a customer or a store.
      </div>
    </div>
  );
}

// Imported Vtiger cases that have no CRM contact yet: the server looks their Vtiger contacts up and links them.
function CaseLink() {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const load = () =>
    api
      .get('/vtiger-cases/link')
      .then(setInfo)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  const running = info?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running]);
  async function act(path) {
    setErr('');
    try {
      await api.post(path, {});
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  if (!info) return null;
  const j = info.job;
  const pct = j?.contacts ? Math.min(100, Math.round((j.looked / j.contacts) * 100)) : 0;
  return (
    <div className="vt-sub">
      <div className="row between">
        <strong>Link imported cases to their contacts</strong>
        {running ? (
          <button className="btn sm" onClick={() => act('/vtiger-cases/link/stop')}>
            Stop
          </button>
        ) : (
          <button className="btn sm primary" onClick={() => act('/vtiger-cases/link')}>
            {j ? 'Check again' : 'Link cases to contacts'}
          </button>
        )}
      </div>
      {j && (
        <>
          {running && (
            <div className="vt-bar">
              <div style={{ width: pct + '%' }} />
            </div>
          )}
          <div className="small">
            {running ? 'Linking… ' : j.status === 'done' ? 'Finished. ' : j.status === 'stopped' ? 'Stopped. ' : j.status === 'error' ? 'Stopped by an error. ' : ''}
            {n(j.cases)} unlinked cases of {n(j.contacts)} Vtiger contacts{running ? ` · ${n(j.looked)} looked up` : ''} · <strong>{n(j.linked)} linked</strong> (same Vtiger contact {n(j.via?.vtiger)}, mobile {n(j.via?.mobile)}, card no.{' '}
            {n(j.via?.card)}, email {n(j.via?.email)}) · {n(j.notFound)} with no matching CRM contact
            {j.noContact ? ` · ${n(j.noContact)} have no contact in Vtiger` : ''}.
          </div>
          {j.error && <div className="error">{j.error}</div>}
        </>
      )}
      {err && <div className="error">{err}</div>}
      <div className="muted small">Matches by the same Vtiger contact (imported since), a mobile no other contact shares, the membership card no., then the email. Each linked case gets a note on its timeline.</div>
    </div>
  );
}

/** The nightly Vtiger sync: on / off, the time, the last result. Shown on both Vtiger import panels. */
export function VtigerSync() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = () =>
    api
      .get('/vtiger-sync')
      .then(setS)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);
  async function save(patch) {
    setErr('');
    try {
      setS({ ...(await api.put('/vtiger-sync', patch)), running: s?.running });
    } catch (e) {
      setErr(e.message);
    }
  }
  async function runNow() {
    setErr('');
    try {
      await api.post('/vtiger-sync/run', {});
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  if (!s) return null;
  const r = s.lastRun;
  return (
    <div className="vt-sub">
      <div className="row between wrap">
        <label className="row small">
          <input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked })} /> <strong>Sync with Vtiger every night</strong> at
          <input type="time" value={s.time} onChange={(e) => e.target.value && save({ time: e.target.value })} style={{ width: 110 }} />
        </label>
        <button className="btn sm" onClick={runNow} disabled={s.running}>
          {s.running ? 'Running…' : 'Sync now'}
        </button>
      </div>
      <div className="small muted">
        New Vtiger contacts, then new cases, then links for new cases without a contact. Only records added in Vtiger since the last sync; nothing done in the CRM is overwritten.
        {r && (
          <>
            {' '}
            Last sync {new Date(r.finishedAt || r.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}:{' '}
            {r.status === 'error' ? <span className="over">stopped: {r.error}</span> : `${n(r.contactsAdded)} contacts and ${n(r.casesAdded)} cases added, ${n(r.casesLinked)} cases linked.`}
          </>
        )}
      </div>
      {err && <div className="error">{err}</div>}
    </div>
  );
}
