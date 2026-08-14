import React, { useEffect, useMemo, useState } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { getFeedFreshnessRows } from '../lib/feedFreshness.js';
import { Panel } from './atoms.jsx';

function formatSourceTime(row, now) {
  if (row.lastSuccess == null) return 'No successful update recorded';
  const date = new Date(row.lastSuccess);
  if (Number.isNaN(date.getTime())) return 'No successful update recorded';
  return row.display || date.toLocaleString();
}

export function FeedFreshnessPanel({ settings, successes, updateSettings }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const rows = useMemo(() => getFeedFreshnessRows(successes, settings), [successes, settings, now]);
  return (
    <Panel title="Data Freshness" accent={C.teal} badge={settings.enabled ? 'Visible' : 'Hidden'}>
      <div style={{ padding:'10px 14px 6px', ...sans({ fontSize:11, color:C.text3, lineHeight:1.45 }) }}>
        These timestamps update only after a feed returns a successful response. A missing timestamp means SKIP has not confirmed a successful response in this browser yet.
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, padding:'8px 14px', borderTop:`0.5px solid ${C.borderLight}`, borderBottom:`0.5px solid ${C.borderLight}` }}>
        <div>
          <div style={sans({ fontSize:12.5, fontWeight:700, color:C.text })}>Show freshness indicator in header</div>
          <div style={sans({ fontSize:10.5, color:C.text3, marginTop:2 })}>Keeps the global feed status visible without changing data requests.</div>
        </div>
        <button type="button" role="switch" aria-checked={settings.enabled} aria-label="Toggle data freshness indicator" onClick={() => updateSettings({ enabled:!settings.enabled })}
          style={{ flexShrink:0, minWidth:96, padding:'7px 10px', border:`1px solid ${settings.enabled ? C.tealMid : C.border}`, borderRadius:7, background:settings.enabled ? C.tealSoft : C.surface3, color:settings.enabled ? C.teal : C.text2, cursor:'pointer', ...px({ fontSize:9.5, fontWeight:800, letterSpacing:'.04em' }) }}>
          {settings.enabled ? 'FRESHNESS ON' : 'FRESHNESS OFF'}
        </button>
      </div>
      <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'8px 14px', borderBottom:`0.5px solid ${C.borderLight}` }}>
        <span style={sans({ fontSize:12, fontWeight:700, color:C.text })}>Timestamp format</span>
        <select aria-label="Data freshness timestamp format" value={settings.displayMode} onChange={event => updateSettings({ displayMode:event.target.value })}
          style={{ minWidth:132, padding:'6px 8px', border:`1px solid ${C.border}`, borderRadius:6, background:C.surface3, color:C.text, ...px({ fontSize:9.5, fontWeight:700 }) }}>
          <option value="relative">Relative (2 min ago)</option>
          <option value="exact">Exact date and time</option>
        </select>
      </label>
      <div aria-label="Tracked data feeds">
        {rows.map((row, index) => (
          <div key={row.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:index < rows.length - 1 ? `0.5px solid ${C.borderLight}` : 'none' }}>
            <span aria-hidden="true" style={{ width:7, height:7, flexShrink:0, borderRadius:'50%', background:row.lastSuccess != null ? C.teal : C.text4 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={sans({ fontSize:11.5, fontWeight:700, color:C.text })}>{row.label}</div>
              <div style={sans({ fontSize:9.5, color:C.text3, marginTop:2 })}>{row.source}</div>
            </div>
            <time dateTime={row.lastSuccess != null ? new Date(row.lastSuccess).toISOString() : undefined} title={row.lastSuccess != null ? new Date(row.lastSuccess).toLocaleString() : undefined}
              style={{ flexShrink:0, textAlign:'right', ...px({ fontSize:9.5, color:row.lastSuccess != null ? C.teal : C.text3, fontWeight:700 }) }}>
              {formatSourceTime(row, now)}
            </time>
          </div>
        ))}
      </div>
    </Panel>
  );
}
