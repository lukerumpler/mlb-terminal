import React from 'react';

const STATUS_META = {
  verified: { label:'Verified', symbol:'✓' },
  estimated: { label:'Estimated', symbol:'~' },
  unavailable: { label:'Unavailable', symbol:'—' },
  'coverage-gap': { label:'Coverage Gap', symbol:'!' },
};

export function normalizeStatus(status, fallback = 'unavailable') {
  const value = String(status || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (value === 'ready' || value === 'live' || value === 'verified') return 'verified';
  if (value === 'estimated' || value === 'derived') return 'estimated';
  if (value === 'source-gap' || value === 'coverage-gap' || value === 'coverage') return 'coverage-gap';
  if (value === 'unavailable' || value === 'upstream-unavailable' || value === 'request-failed' || value === 'error') return 'unavailable';
  return fallback;
}

export default function StatusBadge({ status, className = '', compact = false }) {
  const key = normalizeStatus(status);
  const meta = STATUS_META[key];
  return (
    <span className={`skip-status skip-status-${key} ${compact ? 'is-compact' : ''} ${className}`.trim()} role="status" aria-label={`Data status: ${meta.label}`}>
      <span className="skip-status-symbol" aria-hidden="true">{meta.symbol}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export { STATUS_META };
