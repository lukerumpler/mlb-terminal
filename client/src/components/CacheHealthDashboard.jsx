import React, { useMemo } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { Panel, SkeletonRows } from './atoms.jsx';
import { summarizeCacheTelemetry } from '../lib/operationalAlerts.js';

function Metric({ label, value, color = C.text }) {
  return (
    <div style={{ padding:'10px 12px', minWidth:0, borderRight:`0.5px solid ${C.borderLight}` }}>
      <div style={px({ fontSize:9, fontWeight:800, color:C.text3, letterSpacing:'.07em', textTransform:'uppercase' })}>{label}</div>
      <div style={px({ marginTop:4, fontSize:18, fontWeight:800, color })}>{value}</div>
    </div>
  );
}

export default function CacheHealthDashboard({ health, status = 'loading', updatedAt, onRefresh }) {
  const summary = useMemo(() => summarizeCacheTelemetry(health), [health]);
  const hasTelemetry = Boolean(health);
  const isRefreshing = status === 'refreshing';
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
    : 'Awaiting telemetry';

  return (
    <Panel title="Cache Health" accent={C.teal} badge="Live internal telemetry">
      <div style={{ padding:'9px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:`0.5px solid ${C.borderLight}` }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={sans({ fontSize:11, fontWeight:700, color:C.text })}>Provider-cache operations</div>
          <div style={sans({ marginTop:2, fontSize:10.5, color:C.text3, lineHeight:1.45 })}>
            Reads SKIP telemetry only. Viewing or refreshing this panel never calls FanGraphs, Savant, Baseball-Reference, or MLB.
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={status === 'loading' || isRefreshing} aria-label="Refresh cache-health telemetry"
          style={{ flexShrink:0, minHeight:30, padding:'5px 8px', border:`1px solid ${C.tealMid}`, borderRadius:6, background:C.tealSoft, color:C.teal, cursor:status === 'loading' || isRefreshing ? 'wait' : 'pointer', opacity:status === 'loading' || isRefreshing ? .65 : 1, ...px({ fontSize:9, fontWeight:800, letterSpacing:'.04em' }) }}>
          {status === 'loading' ? 'READING…' : isRefreshing ? 'REFRESHING…' : 'REFRESH'}
        </button>
      </div>

      {status === 'loading' && <div style={{ padding:'10px 14px' }}><SkeletonRows count={2} height={34} /></div>}
      {isRefreshing && hasTelemetry && (
        <div role="status" style={{ padding:'7px 14px', borderBottom:`0.5px solid ${C.borderLight}`, background:C.tealSoft, ...px({ fontSize:9, color:C.teal, fontWeight:800, letterSpacing:'.04em' }) }}>
          REFRESHING TELEMETRY · SHOWING LAST VERIFIED SNAPSHOT
        </div>
      )}
      {status === 'error' && (
        <div role="alert" style={{ padding:'12px 14px', ...sans({ fontSize:11, color:C.rust, lineHeight:1.5 }) }}>
          Cache telemetry is unavailable right now. Provider refresh policies remain unchanged.
        </div>
      )}
      {(status === 'ready' || (isRefreshing && hasTelemetry)) && (
        <>
          <div className="skip-cache-health-metrics" style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', borderBottom:`0.5px solid ${C.borderLight}` }}>
            <Metric label="Cache served" value={summary.totals.servedFromCache} color={C.teal} />
            <Metric label="Stale served" value={summary.totals.staleHits} color={summary.totals.staleHits > 0 ? C.amberDark : C.text} />
            <Metric label="Upstream reads" value={summary.totals.upstreamMisses} color={C.text2} />
            <Metric label="Reuse rate" value={summary.cacheReusePercent == null ? '—' : `${summary.cacheReusePercent}%`} color={C.teal} />
          </div>
          {summary.providers.length === 0 ? (
            <div style={{ padding:'12px 14px', ...sans({ fontSize:11, color:C.text3, lineHeight:1.5 }) }}>
              No monitored cache operations have been recorded for the current UTC day.
            </div>
          ) : summary.providers.map((provider, index) => (
            <div key={provider.provider} style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) auto auto auto', gap:12, alignItems:'center', padding:'9px 14px', borderBottom:index < summary.providers.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
              <div style={{ minWidth:0 }}>
                <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>{provider.label}</div>
                <div style={px({ marginTop:2, fontSize:9, color:C.text3 })}>Observed today (UTC)</div>
              </div>
              <span style={px({ fontSize:10, fontWeight:800, color:C.teal })}>{provider.durableHits} durable</span>
              <span style={px({ fontSize:10, fontWeight:800, color:provider.staleHits > 0 ? C.amberDark : C.text3 })}>{provider.staleHits} stale</span>
              <span style={px({ fontSize:10, fontWeight:800, color:C.text2 })}>{provider.upstreamMisses} upstream</span>
            </div>
          ))}
          <div style={{ padding:'7px 14px', borderTop:`0.5px solid ${C.borderLight}`, background:C.surface2, display:'flex', justifyContent:'space-between', gap:10, ...px({ fontSize:9, color:C.text3 }) }}>
            <span>Source: SKIP cache telemetry</span>
            <span>{summary.day ? `UTC ${summary.day}` : 'UTC day unavailable'} · read {updatedLabel}</span>
          </div>
        </>
      )}
    </Panel>
  );
}
