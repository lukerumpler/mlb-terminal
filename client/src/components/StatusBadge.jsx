import React from 'react';

const STATUS_META = {
  verified: { label:'Verified', symbol:'✓' },
  estimated: { label:'Estimated', symbol:'~' },
  calculated: { label:'Calculated', symbol:'∑' },
  'tier-1': { label:'Tier 1 · Official', symbol:'1' },
  'tier-2': { label:'Tier 2 · Backup', symbol:'2' },
  'tier-3': { label:'Tier 3 · Secondary', symbol:'3' },
  cached: { label:'Cached', symbol:'↻' },
  'cached-fallback': { label:'Stale Fallback', symbol:'↻' },
  unavailable: { label:'Unavailable', symbol:'—' },
  'coverage-gap': { label:'Coverage Gap', symbol:'!' },
  'provider-blocked': { label:'Provider Blocked', symbol:'!' },
  loading: { label:'Loading', symbol:'…' },
};

export function normalizeStatus(status, fallback = 'unavailable') {
  const value = String(status || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (value === 'ready' || value === 'live' || value === 'verified') return 'verified';
  if (value === 'estimated' || value === 'derived') return 'estimated';
  if (value === 'calculated' || value === 'calculation') return 'calculated';
  if (value === 'source-gap' || value === 'coverage-gap' || value === 'coverage') return 'coverage-gap';
  if (value === 'provider-blocked' || value === 'blocked' || value === 'cloudflare-blocked') return 'provider-blocked';
  if (value === 'tier-1' || value === 'tier-2' || value === 'tier-3') return value;
  if (value === 'cached' || value === 'fresh-cached') return 'cached';
  if (value === 'cached-fallback' || value === 'stale-cached' || value === 'fallback') return 'cached-fallback';
  if (value === 'loading' || value === 'pending' || value === 'connecting') return 'loading';
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
