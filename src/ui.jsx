import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { caseTree, dependentValues, mergeDependencies, mergeLists } from './picklists.js';

export const MetaContext = createContext({ stores: [], agents: [], agent: '', stats: null, refreshStats: () => {} });
export const useMeta = () => useContext(MetaContext);

/** Picklists and dependencies: base values from the case master plus the ones added on the Picklists / Dependencies screens. */
export function usePicklists() {
  const { picklists, dependencies } = useMeta();
  return useMemo(() => {
    const lists = mergeLists(picklists);
    const deps = mergeDependencies(dependencies);
    return {
      lists,
      deps,
      list: (field) => lists[field] || [],
      dependents: (subField, mainField, mainValue) => dependentValues(lists, deps, subField, mainField, mainValue),
      tree: caseTree(lists, deps),
    };
  }, [picklists, dependencies]);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ago(iso) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dueLabel(iso) {
  if (!iso) return null;
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (m < 0) {
    const over = -m;
    return { overdue: true, text: over < 60 ? `${over} min overdue` : over < 1440 ? `${Math.floor(over / 60)}h overdue` : `${Math.floor(over / 1440)}d overdue` };
  }
  return { overdue: false, text: m < 60 ? `${m} min left` : m < 1440 ? `${Math.floor(m / 60)}h left` : `${Math.floor(m / 1440)}d left` };
}

export function StatusBadge({ status }) {
  return <span className={`badge st-${(status || '').toLowerCase()}`}>{status}</span>;
}

export function Due({ iso }) {
  const d = dueLabel(iso);
  if (!d) return null;
  return <span className={`due ${d.overdue ? 'over' : ''}`}>{d.text}</span>;
}

export const NOT_SPECIFIC = 'NS'; // case master store_name "Not Specific"

export function storeLabel(stores, code) {
  if (code === NOT_SPECIFIC) return 'Not Specific';
  const s = stores.find((x) => x.code === code);
  return s ? `${s.code} ${s.short}` : code || '—';
}

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return [data, reload, error, setData];
}

let copyToastTimer;

// Small confirmation so an agent knows the text reached the clipboard.
function copiedToast(ok) {
  let el = document.getElementById('copy-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'copy-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = ok ? 'Copied' : 'Could not copy — select the text and press Ctrl+C';
  el.classList.toggle('bad', !ok);
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => el.remove(), 2200);
}

// Clipboard API only exists on https/localhost; on a LAN address (http://192.168…) use the old selection trick.
function copyFallback(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = String(text ?? '');
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    copiedToast(ok);
  } catch {
    copiedToast(false);
  }
}

export function copy(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(String(text ?? '')).then(() => copiedToast(true), () => copyFallback(text));
  } else {
    copyFallback(text);
  }
}

export function Field({ label, children, hint, wide, className = '' }) {
  return (
    <label className={`field ${wide ? 'wide' : ''} ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder = 'Select…', ...rest }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        )
      )}
    </select>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
