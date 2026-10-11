import React, { useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';

export function formatMoney(value, compact = false) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  if (compact) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export function formatDollarsPerWar(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${formatMoney(amount, true)}/WAR` : '—';
}

// Number(null) and Number('') are 0, so a missing WAR would print as a real
// "0.0". Treat null / undefined / blank strings as unavailable instead.
function finiteOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatWar(value) {
  const war = finiteOrNull(value);
  if (war == null) return '—';
  const text = war.toFixed(1);
  return text === '-0.0' ? '0.0' : text;
}

export function sourceStatusLabel(status) {
  return ({
    live: 'Live',
    cached: 'Cached',
    'stale-cached': 'Stale',
    partial: 'Partial',
    'source-gap': 'Coverage gap',
    unavailable: 'Unavailable',
    loading: 'Loading',
  })[status] || 'Unavailable';
}

export function TeamEfficiencySourceBadge({ provider, status = 'unavailable' }) {
  const color = status === 'live' ? C.teal : status === 'cached' ? C.amber : status === 'stale-cached' ? C.rust : C.text3;
  return <span role="status" aria-label={`${provider} source ${sourceStatusLabel(status)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color, ...sans({ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }) }}>
    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
    {provider} · {sourceStatusLabel(status)}
  </span>;
}

function MetricCell({ label, value, detail }) {
  return <div style={{ padding: '10px 12px', borderRight: `0.5px solid ${C.borderLight}` }}>
    <div style={px({ fontSize: 15, fontWeight: 800, color: value === '—' ? C.text3 : C.text })}>{value}</div>
    <div style={sans({ marginTop: 3, fontSize: 8.5, color: C.text3, letterSpacing: '.04em', textTransform: 'uppercase' })}>{label}</div>
    {detail && <div style={sans({ marginTop: 3, fontSize: 8.5, color: C.text4 })}>{detail}</div>}
  </div>;
}

export function TeamEfficiencyOverviewPanel({ record, loading = false, teamName = 'Team', onRefresh }) {
  const status = loading ? 'loading' : record?.status || 'unavailable';
  const complete = Boolean(record?.found && record?.efficiency);
  const warDetail = record?.war ? `fWAR ${formatWar(record.war.fWAR)} · bWAR ${formatWar(record.war.bWAR)}` : null;
  const consensus = record?.war?.consensus;
  const componentDetail = (label, summary) => summary
    ? `${label} ${formatWar(summary.value)} (${[...new Set(summary.providers)].join(' + ')})`
    : null;
  const consensusParts = [componentDetail('Off', consensus?.batting), componentDetail('Pit', consensus?.pitching)].filter(Boolean);
  const hasSplit = record?.war?.offensive != null || record?.war?.pitching != null;
  const splitDetail = consensusParts.length
    ? consensusParts.join(' · ')
    : hasSplit
      ? `Off ${formatWar(record.war.offensive)} · Pit ${formatWar(record.war.pitching)}${record.war.splitProvider ? ` (${record.war.splitProvider})` : ''}`
      : 'Offensive/pitching split unavailable';
  const agreementDetail = consensus?.agreementLabel || null;
  const range = record?.efficiency?.range;
  const rangeDetail = range && finiteOrNull(range.warPer100mLow) != null && finiteOrNull(range.warPer100mHigh) != null
    ? `WAR/$100M ${Number(range.warPer100mLow).toFixed(2)}–${Number(range.warPer100mHigh).toFixed(2)} across sources`
    : null;
  // "Blended" is only true when both providers contributed; a single-provider
  // total is that provider's own WAR and must be labeled as such (fWAR != bWAR).
  const hasFWar = finiteOrNull(record?.war?.fWAR) != null;
  const hasBWar = finiteOrNull(record?.war?.bWAR) != null;
  const warLabel = hasFWar && hasBWar ? 'Blended WAR' : hasFWar ? 'fWAR' : hasBWar ? 'bWAR' : 'Team WAR';
  const hasAnyWar = ['total', 'fWAR', 'bWAR', 'offensive', 'pitching'].some(key => finiteOrNull(record?.war?.[key]) != null);
  const defensiveDetail = finiteOrNull(record?.war?.defensive) != null
    ? `Defensive blend ${formatWar(record.war.defensive)}`
    : 'Comparable defensive blend unavailable';
  return <section aria-label={`${teamName} salary-to-WAR efficiency`} style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: `0.5px solid ${C.borderLight}` }}>
      <div>
        <div style={px({ fontSize: 12, fontWeight: 800, color: C.text })}>Salary-to-WAR Efficiency</div>
        <div style={sans({ marginTop: 2, fontSize: 9, color: C.text3 })}>{teamName} · {record?.season || 'Current season'} · {record?.payroll?.basis || 'Payroll basis unavailable'}</div>
      </div>
      {onRefresh && <button type="button" onClick={onRefresh} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 7px', background: C.surface2, color: C.text2, cursor: 'pointer', ...sans({ fontSize: 9, fontWeight: 700 }) }}>Refresh</button>}
    </div>
    <div style={{ padding: '7px 12px' }}><TeamEfficiencySourceBadge provider={record?.war?.provider || 'WAR'} status={status} /></div>
    {complete ? <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderTop: `0.5px solid ${C.borderLight}` }}>
        <MetricCell label="Payroll" value={formatMoney(record.payroll.amountUsd, true)} detail={record.payroll.basis.replaceAll('_', ' ')} />
        <MetricCell label={warLabel} value={formatWar(record.war.total)} detail={warDetail || record.war.methodology} />
        <MetricCell label="Dollars / WAR" value={formatDollarsPerWar(record.efficiency.dollarsPerWar)} />
        <MetricCell label="WAR / $100M" value={Number(record.efficiency.warPer100m).toFixed(2)} />
      </div>
      <div style={sans({ padding: '8px 12px 10px', fontSize: 9, lineHeight: 1.45, color: C.text4 })}>
        Payroll: {record.payroll.source || 'Unavailable'} · WAR: {record.war.provider || 'Unavailable'} · {record.war.methodology || 'Methodology unavailable'}{agreementDetail ? ` · ${agreementDetail}` : ''}{rangeDetail ? ` · ${rangeDetail}` : ''} · {splitDetail} · {defensiveDetail}. Retrieved {record.retrievedAt ? new Date(record.retrievedAt).toLocaleString() : 'unknown'}.
        {record.warnings?.length ? ` ${record.warnings.join(' ')}` : ''}
      </div>
    </> : <div style={sans({ padding: '12px', color: C.text3, fontSize: 10, lineHeight: 1.45 })}>
      {loading ? 'Loading verified payroll and team WAR inputs.' : <>
        {hasAnyWar && <div style={{ marginBottom: 6, color: C.text2 }}>WAR is available without an efficiency ratio: {warLabel} {formatWar(record.war.total)} ({warDetail}) · {splitDetail}.</div>}
        {(record?.warnings || ['Payroll and WAR inputs are not both available. No efficiency value is estimated.']).join(' ')}
      </>}
    </div>}
  </section>;
}

export function TeamEfficiencyComparisonView({ rows = [], loading = false, season, payrollBasis = 'payroll', onRefresh }) {
  const [sortKey, setSortKey] = useState('dollarsPerWar');
  const [direction, setDirection] = useState('asc');
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const av = Number(a?.efficiency?.[sortKey]);
    const bv = Number(b?.efficiency?.[sortKey]);
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return String(a?.team || '').localeCompare(String(b?.team || ''));
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return (av - bv) * (direction === 'asc' ? 1 : -1);
  }), [rows, sortKey, direction]);
  const toggleSort = key => {
    if (key === sortKey) setDirection(value => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setDirection('asc'); }
  };
  const header = (label, key) => <button type="button" onClick={() => toggleSort(key)} style={{ border: 0, background: 'transparent', padding: 0, color: C.text2, cursor: 'pointer', ...sans({ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }) }}>{label}{sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}</button>;
  return <section aria-label="Team salary-to-WAR comparison" style={{ border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, overflow: 'hidden' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `0.5px solid ${C.borderLight}` }}>
      <div><div style={px({ fontSize: 12, fontWeight: 800, color: C.text })}>Team Salary-to-WAR Comparison</div><div style={sans({ marginTop: 2, fontSize: 9, color: C.text3 })}>{season || 'Current season'} · {payrollBasis.replaceAll('_', ' ')} · incomplete rows are not ranked</div></div>
      {onRefresh && <button type="button" onClick={onRefresh} style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 7px', background: C.surface2, color: C.text2, cursor: 'pointer', ...sans({ fontSize: 9, fontWeight: 700 }) }}>Refresh</button>}
    </div>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: C.surface2 }}>
      <th style={{ padding: '7px 10px', textAlign: 'left' }}>{header('Team', 'team')}</th><th style={{ padding: '7px 10px', textAlign: 'right' }}>{header('Payroll', 'payroll')}</th><th style={{ padding: '7px 10px', textAlign: 'right' }}>{header('Blended WAR', 'totalWar')}</th><th style={{ padding: '7px 10px', textAlign: 'right' }}>{header('$ / WAR', 'dollarsPerWar')}</th><th style={{ padding: '7px 10px', textAlign: 'right' }}>{header('WAR / $100M', 'warPer100m')}</th><th style={{ padding: '7px 10px', textAlign: 'left' }}>Source</th>
    </tr></thead><tbody>
      {loading ? <tr><td colSpan="6" style={sans({ padding: 16, color: C.text3, fontSize: 10 })}>Loading verified payroll and WAR rows.</td></tr> : sortedRows.map(row => <tr key={`${row.teamAbbreviation}-${row.season}`}>
        <th scope="row" style={{ padding: '8px 10px', textAlign: 'left', color: C.text, ...sans({ fontSize: 10, fontWeight: 700 }) }}>{row.team || row.teamAbbreviation || '—'}{row.teamAbbreviation ? <span style={sans({ marginLeft: 5, fontSize: 8.5, color: C.text4 })}>{row.teamAbbreviation}</span> : null}</th>
        <td style={px({ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: C.text })}>{formatMoney(row.payroll?.amountUsd, true)}</td>
        <td title={`fWAR ${formatWar(row.war?.fWAR)} · bWAR ${formatWar(row.war?.bWAR)}${row.war?.consensus?.agreementLabel ? ` · ${row.war.consensus.agreementLabel}` : ''}${finiteOrNull(row.war?.defensive) != null ? ` · defensive blend ${formatWar(row.war.defensive)}` : ''}`} style={px({ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: C.text })}>{formatWar(row.war?.total)}</td>
        <td style={px({ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: row.found ? C.text : C.text3 })}>{formatDollarsPerWar(row.efficiency?.dollarsPerWar)}</td>
        <td style={px({ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: row.found ? C.text : C.text3 })}>{finiteOrNull(row.efficiency?.warPer100m) != null ? Number(row.efficiency.warPer100m).toFixed(2) : '—'}</td>
        <td style={{ padding: '8px 10px' }}><TeamEfficiencySourceBadge provider={row.war?.provider || 'Unavailable'} status={row.status || 'source-gap'} /></td>
      </tr>)}
    </tbody></table></div>
  </section>;
}
