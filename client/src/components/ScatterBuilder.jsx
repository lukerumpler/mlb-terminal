import React, { useState, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { C, px, sans, WARM_TOOLTIP } from '../constants/colors.js';
import { Panel } from './atoms.jsx';
import { continuousColor } from '../lib/percentile.js';

// higherIsBetter drives which end of the rust→amber→teal gradient a stat's
// low/high raw values land on when it's picked as the color axis (Roadmap
// #4). Omitted = neutral (age, IP) — no inherent good/bad direction, so the
// raw min just anchors the rust end arbitrarily; that's fine for a visual
// gradient, unlike percentile() where direction actually changes a score.
const BATTER_AXES = [
  { key:'age', label:'Age' }, { key:'avg', label:'AVG' }, { key:'obp', label:'OBP' },
  { key:'slg', label:'SLG' }, { key:'ops', label:'OPS' }, { key:'hr', label:'HR' },
  { key:'rbi', label:'RBI' }, { key:'sb', label:'SB' }, { key:'bb', label:'BB' },
  { key:'so', label:'SO', higherIsBetter:false },
  { key:'rank', label:'Rank', higherIsBetter:false }, { key:'fv', label:'eFV' },
];
const PITCHER_AXES = [
  { key:'age', label:'Age' },
  { key:'era', label:'ERA', higherIsBetter:false },
  { key:'whip', label:'WHIP', higherIsBetter:false },
  { key:'so', label:'SO' },
  { key:'bb', label:'BB', higherIsBetter:false },
  { key:'w', label:'W' }, { key:'ip', label:'IP' },
  { key:'rank', label:'Rank', higherIsBetter:false }, { key:'fv', label:'eFV' },
];

const POS_COLOR = {
  SS:C.amber, '2B':C.amber, '3B':C.rust, C:C.purple, OF:C.teal, '1B':C.slate,
  RHP:C.rust, LHP:C.teal,
};

export default function ScatterBuilder({ batters, pitchers, onSelect }) {
  const [group, setGroup] = useState('bat'); // 'bat' | 'pit'
  const axes = group === 'bat' ? BATTER_AXES : PITCHER_AXES;
  const [xKey, setXKey] = useState('age');
  const [yKey, setYKey] = useState(group === 'bat' ? 'ops' : 'era');
  const [colorKey, setColorKey] = useState(''); // '' = position coloring (previous/default behavior)

  const pool = group === 'bat' ? batters : pitchers;

  const data = useMemo(() => {
    return pool
      .filter(p => p[xKey] != null && p[yKey] != null)
      .map(p => ({ ...p, x: +p[xKey], y: +p[yKey] }));
  }, [pool, xKey, yKey]);

  const switchGroup = g => {
    setGroup(g);
    setXKey('age');
    setYKey(g === 'bat' ? 'ops' : 'era');
    setColorKey(''); // axis lists differ per group — a stale colorKey could point at a stat that no longer exists
  };

  // Color-by-stat (Roadmap #4). Min/max are taken from `data`, the same
  // filtered set actually being plotted, so the gradient always spans
  // exactly what's on screen rather than the full unfiltered pool.
  // axes is always one of the two module-level consts (stable identity per
  // group), so this only recomputes when colorKey or group actually changes
  // — not on every render — which is what lets colorRange's own memo below
  // depend on colorStat without defeating itself.
  const colorStat = useMemo(() => axes.find(a => a.key === colorKey) || null, [axes, colorKey]);
  const colorRange = useMemo(() => {
    if (!colorStat) return null;
    const vals = data.map(p => p[colorKey]).filter(v => v != null && !Number.isNaN(+v)).map(Number);
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return { lo, hi };
  }, [data, colorKey, colorStat]);

  function normFor(raw) {
    if (!colorRange || colorRange.hi === colorRange.lo) return 0.5;
    let t = (raw - colorRange.lo) / (colorRange.hi - colorRange.lo);
    if (colorStat?.higherIsBetter === false) t = 1 - t;
    return t;
  }

  function pointColor(p) {
    if (!colorStat) return POS_COLOR[p.pos] || C.amber;
    const raw = p[colorKey];
    if (raw == null || Number.isNaN(+raw) || !colorRange) return C.text3;
    return continuousColor(normFor(+raw));
  }

  return (
    <Panel title="Build-Your-Own Scatterplot" accent={C.purple} badge={`${data.length} plotted`}>
      <div style={{ padding:'10px 14px', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:4 }}>
          {[['bat','Batters'],['pit','Pitchers']].map(([k,l]) => (
            <button key={k} onClick={() => switchGroup(k)} style={{
              padding:'5px 11px', borderRadius:6, cursor:'pointer',
              border:`1px solid ${group===k ? C.purple : C.border}`,
              background: group===k ? `color-mix(in srgb, ${C.purple} 12%, transparent)` : 'transparent',
              color: group===k ? C.purple : C.text2,
              ...sans({ fontSize:11, fontWeight:600 }),
            }}>{l}</button>
          ))}
        </div>

        <label style={sans({ fontSize:11, color:C.text2, display:'flex', alignItems:'center', gap:6 })}>
          X axis
          <select value={xKey} onChange={e => setXKey(e.target.value)} style={{
            padding:'5px 8px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text,
            ...sans({ fontSize:11 }),
          }}>
            {axes.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>

        <label style={sans({ fontSize:11, color:C.text2, display:'flex', alignItems:'center', gap:6 })}>
          Y axis
          <select value={yKey} onChange={e => setYKey(e.target.value)} style={{
            padding:'5px 8px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text,
            ...sans({ fontSize:11 }),
          }}>
            {axes.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>

        <label style={sans({ fontSize:11, color:C.text2, display:'flex', alignItems:'center', gap:6 })}>
          Color by
          <select value={colorKey} onChange={e => setColorKey(e.target.value)} style={{
            padding:'5px 8px', borderRadius:6, border:`0.5px solid ${C.border}`, background:C.surface2, color:C.text,
            ...sans({ fontSize:11 }),
          }}>
            <option value="">Position</option>
            {axes.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
      </div>

      <div style={{ padding:'0 14px 14px', height:340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top:10, right:20, bottom:10, left:0 }}>
            <CartesianGrid stroke={C.borderLight} strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name={axes.find(a=>a.key===xKey)?.label}
              tick={{ fontSize:10, fill:C.text3 }} stroke={C.border}
              label={{ value: axes.find(a=>a.key===xKey)?.label, position:'insideBottom', offset:-5, fontSize:10, fill:C.text3 }} />
            <YAxis type="number" dataKey="y" name={axes.find(a=>a.key===yKey)?.label}
              tick={{ fontSize:10, fill:C.text3 }} stroke={C.border}
              label={{ value: axes.find(a=>a.key===yKey)?.label, angle:-90, position:'insideLeft', fontSize:10, fill:C.text3 }} />
            <Tooltip {...WARM_TOOLTIP} cursor={{ strokeDasharray:'3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:8, padding:'8px 10px', fontSize:11 }}>
                    <div style={{ fontWeight:800, color:C.text, marginBottom:2 }}>{p.name}</div>
                    <div style={{ color:C.text3, ...px({fontSize:10}) }}>{p.team} · {p.pos} · #{p.rank}</div>
                    <div style={{ color:C.text2, marginTop:4, ...px({fontSize:10.5}) }}>
                      {axes.find(a=>a.key===xKey)?.label}: {p.x} · {axes.find(a=>a.key===yKey)?.label}: {p.y}
                    </div>
                  </div>
                );
              }} />
            <Scatter data={data} onClick={d => onSelect?.(d.mlbId)} cursor="pointer" isAnimationActive={false}>
              {data.map((p, i) => (
                <Cell key={i} fill={pointColor(p)} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div style={{ padding:'0 14px 12px' }}>
        {colorStat && colorRange && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={px({ fontSize:9.5, color:C.text3, flexShrink:0 })}>
              {(colorStat.higherIsBetter === false ? colorRange.hi : colorRange.lo).toLocaleString(undefined,{maximumFractionDigits:2})}
            </span>
            <div style={{
              flex:1, height:6, borderRadius:3,
              background: `linear-gradient(to right, ${continuousColor(0)}, ${continuousColor(0.5)}, ${continuousColor(1)})`,
            }} />
            <span style={px({ fontSize:9.5, color:C.text3, flexShrink:0 })}>
              {(colorStat.higherIsBetter === false ? colorRange.lo : colorRange.hi).toLocaleString(undefined,{maximumFractionDigits:2})}
            </span>
          </div>
        )}
        <div style={sans({ fontSize:10, color:C.text3, lineHeight:1.5 })}>
          Click a dot to open that prospect's card. Color = {colorStat ? colorStat.label : 'position'}
          {colorStat && !colorRange && ' (no data in current view)'}.
        </div>
      </div>
    </Panel>
  );
}
