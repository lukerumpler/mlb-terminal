import React, { forwardRef, useEffect, useRef } from 'react';
import StatusBadge from './StatusBadge.jsx';

function displayValue(value, fallback = 'Not supplied by source') {
  return value == null || value === '' ? fallback : String(value);
}

export default function SourceProvenanceDrawer({ open, onClose, title = 'Source provenance', context = '', entries = [], returnFocusRef }) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const restoreFocusRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = returnFocusRef?.current || document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); return; }
      if (event.key !== 'Tab') return;
      const focusable = drawerRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreFocusRef.current?.focus) restoreFocusRef.current.focus();
    };
  }, [open, onClose, returnFocusRef]);
  if (!open) return null;
  return (
    <div className="skip-provenance-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <aside ref={drawerRef} className="skip-provenance-drawer" role="dialog" aria-modal="true" aria-labelledby="skip-provenance-title">
        <div className="skip-provenance-header">
          <div>
            <div id="skip-provenance-title" className="skip-provenance-title">{title}</div>
            {context && <div className="skip-provenance-context">{context}</div>}
          </div>
          <button ref={closeRef} type="button" className="skip-provenance-close" onClick={onClose} aria-label="Close source provenance">×</button>
        </div>
        <div className="skip-provenance-body">
          {entries.length === 0 ? (
            <div className="skip-provenance-empty">No provenance records are available for this view yet.</div>
          ) : entries.map((entry, index) => (
            <section className="skip-provenance-entry" key={`${entry.label || 'metric'}-${index}`}>
              <div className="skip-provenance-entry-head">
                <div className="skip-provenance-entry-label">{entry.label || 'Metric group'}</div>
                <StatusBadge status={entry.status || (entry.available ? 'verified' : 'unavailable')} compact />
              </div>
              <div className="skip-provenance-grid">
                <div><span>Provider</span><strong>{displayValue(entry.provider)}</strong></div>
                <div><span>Retrieved</span><strong>{displayValue(entry.retrieved, 'Timestamp not supplied')}</strong></div>
                <div><span>Sample size</span><strong>{displayValue(entry.sampleSize)}</strong></div>
                <div><span>Method</span><strong>{displayValue(entry.method)}</strong></div>
              </div>
              {entry.note && <div className="skip-provenance-note">{entry.note}</div>}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

export const ProvenanceButton = forwardRef(function ProvenanceButton({ onClick, label = 'View sources' }, ref) {
  return <button ref={ref} type="button" className="skip-provenance-trigger" onClick={onClick} aria-label="Open source provenance">{label}</button>;
});
