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
      <div className="muted small">
        Runs on the CRM server (about an hour for 1.9 lakh cases); you can close this page. Already imported cases are not changed. Only cases still open in
        Vtiger come in as Pending or Resolved; the rest are the Closed archive — never Waiting or Escalated, so no historical case emails a customer or a store.
      </div>
    </div>
  );
}
