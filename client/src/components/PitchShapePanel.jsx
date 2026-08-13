import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, ReferenceLine, Tooltip, Cell, BarChart, Bar,
} from 'recharts';
import { C, px, sans, WARM_TOOLTIP } from '../constants/colors.js';
import { pitchColor as colorFor } from '../constants/pitchTypes.js';
import { pickSavantField as pick } from '../lib/savantField.js';
import { Panel } from './atoms.jsx';

const TT = { ...WARM_TOOLTIP, wrapperStyle: { zIndex: 9999 } };


// Baseball Savant doesn't publish a fixed CSV schema for this leaderboard
// and has renamed columns before — see api/savant.js's comment on the
// pitch_arsenal endpoint. Rather than assume one exact column name per
// field and silently render blank if Savant's naming differs slightly,
// this tries several plausible variants and takes the first that's present
// (pickSavantField, extracted to lib/savantField.js so it's not duplicated
// elsewhere this app touches Savant CSVs with unconfirmed column names).

function normalizeRow(row) {
  const pitchType = pick(row, 'pitch_type') ?? '—';
  const pitchName = pick(row, 'pitch_name') ?? String(pitchType);
  return {
    pitchType: String(pitchType),
    pitchName: String(pitchName),
    pitches:   pick(row, 'pitches', 'n'),
    usage:     pick(row, 'pitch_usage', 'pitch_percent', 'usage'),
    velocity:  pick(row, 'velocity', 'release_speed', 'avg_speed'),
    spin:      pick(row, 'spin_rate', 'avg_spin'),
    ivb:       pick(row, 'pitcher_break_z_induced', 'induced_vertical_break', 'pitcher_break_z', 'avg_break_z_induced', 'pfx_z'),
    hb:        pick(row, 'pitcher_break_x', 'horizontal_break', 'avg_break_x', 'pfx_x'),
    extension: pick(row, 'release_extension'),
    whiffPct:  pick(row, 'whiff_percent'),
    kPct:      pick(row, 'k_percent'),
    putAway:   pick(row, 'put_away'),
    hardHit:   pick(row, 'hard_hit_percent'),
    xwoba:     pick(row, 'xwoba', 'est_woba'),
    runValue:  pick(row, 'run_value'),
  };
}

const TABLE_COLUMNS = [
  { key:'pitches',   lbl:'Cnt',      fmt:v => v != null ? Math.round(v) : '—' },
  { key:'usage',     lbl:'Usage%',   fmt:v => v != null ? `${v.toFixed(1)}%` : '—' },
  { key:'velocity',  lbl:'Velo',     fmt:v => v != null ? v.toFixed(1) : '—' },
  { key:'ivb',       lbl:'iVB',      fmt:v => v != null ? v.toFixed(1) : '—' },
  { key:'hb',        lbl:'HB',       fmt:v => v != null ? v.toFixed(1) : '—' },
  { key:'spin',      lbl:'Spin',     fmt:v => v != null ? Math.round(v) : '—' },
  { key:'extension', lbl:'Ext',      fmt:v => v != null ? v.toFixed(1) : '—' },
  { key:'whiffPct',  lbl:'Whiff%',   fmt:v => v != null ? `${v.toFixed(1)}%` : '—' },
  { key:'kPct',      lbl:'K%',       fmt:v => v != null ? `${v.toFixed(1)}%` : '—' },
  { key:'putAway',   lbl:'PutAway%', fmt:v => v != null ? `${v.toFixed(1)}%` : '—' },
  { key:'hardHit',   lbl:'HardHit%', fmt:v => v != null ? `${v.toFixed(1)}%` : '—' },
  { key:'xwoba',     lbl:'xwOBA',    fmt:v => v != null ? v.toFixed(3) : '—' },
];

/* ─── Roadmap #1, closed 2026-08-08: velocity distribution + LHH/RHH split
   from raw per-pitch data (`player.pitcherPitches`, api/savant.js's
   `pitcher_pitches` endpoint). Two pure functions, exported for direct
   testing — same reasoning as PlayersPage.jsx's weightedWhiffPercent: this
   is aggregation-math risk, separate from "does the fetch work," and a
   wrong-but-plausible-looking result wouldn't be caught by "does it
   render," only by checking the actual numbers. ------------------------- */

// Groups raw per-pitch rows into per-pitch-type velocity arrays and
// LHH/RHH counts in one pass. `pitch_type` here is the same raw Statcast
// code (`FF`, `SL`, etc.) the aggregate arsenal rows above use for the
// same field, via pick(row, 'pitch_type') — not independently verified
// again here since it's the same well-established column both endpoints
// share, not one of the newer fields that needed its own confirmation.
export function aggregatePitcherPitches(pitches) {
  const velocityByType = {};
  const handCountsByType = {};
  if (!Array.isArray(pitches)) return { velocityByType, usageByHand: {} };

  for (const p of pitches) {
    const type = p?.pitch_type;
    if (type == null) continue;
    const v = Number(p.release_speed);
    if (p.release_speed != null && Number.isFinite(v)) {
      (velocityByType[type] ??= []).push(v);
    }
    const stand = p?.stand;
    if (stand === 'L' || stand === 'R') {
      const bucket = (handCountsByType[type] ??= { L: 0, R: 0 });
      bucket[stand] += 1;
    }
  }

  const usageByHand = {};
  for (const [type, { L, R }] of Object.entries(handCountsByType)) {
    const total = L + R;
    if (total > 0) usageByHand[type] = { vsL: (L / total) * 100, vsR: (R / total) * 100, total };
  }
  return { velocityByType, usageByHand };
}

// Bins velocity values into fixed-width buckets for a simple histogram —
// an honest "distribution" built from real per-pitch values, not the
// smoothed kernel-density curve the reference cards show (a true KDE
// needs a bandwidth/kernel choice this app has no prior infrastructure
// for; a histogram doesn't need one to be truthful, just narrower bins
// than a single average bar). `binWidth` in mph; default 1 keeps bins
// meaningful at typical single-pitch-type sample sizes (dozens to low
// hundreds) without so many empty bins the shape reads as noise.
export function binVelocities(values, binWidth = 1) {
  if (!Array.isArray(values) || !values.length) return [];
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  const binCount = Math.max(1, Math.round((max - min) / binWidth));
  const bins = Array.from({ length: binCount }, (_, i) => ({ bin: min + (i + 0.5) * binWidth, count: 0 }));
  for (const v of values) {
    const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((v - min) / binWidth)));
    bins[idx].count += 1;
  }
  return bins;
}


function BreakTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={TT.contentStyle}>
      <div style={{ fontWeight:700, marginBottom:2, color:C.text }}>{d.pitchName}</div>
      <div>HB {d.x != null ? d.x.toFixed(1) : '—'}in · iVB {d.y != null ? d.y.toFixed(1) : '—'}in</div>
      {d.usage != null && <div>Usage {d.usage.toFixed(1)}%</div>}
    </div>
  );
}

/* ─── Pitch Shape panel (Roadmap #1) ──────────────────────────────────
   Sourced from api/savant.js's `pitch_arsenal` endpoint (Baseball
   Savant's real pitch-arsenal-stats leaderboard — one row per pitcher
   per pitch type, season aggregates) for break/spin/usage-by-type, plus
   (since 2026-08-08) `pitcher_pitches` — real per-pitch Statcast Search
   data — for the two things below that `pitch_arsenal` alone can't
   provide. Fixed 2026-08-09: this comment had gone stale describing both
   as still-unbuilt gaps ("deliberately does NOT attempt... if either is
   picked up later") for a full round after the code below it was
   actually updated to build them — a maintainer or future session
   reading only this comment would have gone looking for pitch-level
   data this file already has. Left as a cautionary note, not just
   silently corrected: check the *code*, not a comment describing it,
   when the two might disagree.

   1. A true per-pitch velocity distribution. Built via `pitches` (the
      `pitcherPitches` prop, `pitcher_pitches` endpoint) — a real
      histogram (see `binVelocities` above), not a smoothed KDE curve
      (still not attempted; a true KDE needs a bandwidth/kernel choice
      this app has no prior infrastructure for, and a histogram doesn't
      need one to be truthful). Falls back to the single season-average
      bar, honestly labeled "Avg." not "Distribution," when `pitches` is
      unavailable for a given pitcher (too little current-season data,
      fetch timeout, etc.) — see `hasRawPitches` below.
   2. Usage split vs. LHH/RHH. Also built via `pitches` (`stand` per
      pitch, not a column `pitch_arsenal` carries). Falls back to
      overall usage, with an explicit in-caption note that the split
      isn't shown, when `pitches` is unavailable — never silently shows
      overall usage as if it were the split.
------------------------------------------------------------------------ */
export default function PitchShapePanel({ arsenal, throws, pitches }) {
  const rows = useMemo(() => {
    const arr = Array.isArray(arsenal) ? arsenal.map(normalizeRow) : [];
    return arr
      .filter(r => r.pitchType && r.pitchType !== '—')
      .sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1));
  }, [arsenal]);

  const { velocityByType, usageByHand } = useMemo(() => aggregatePitcherPitches(pitches), [pitches]);
  const hasRawPitches = Object.keys(velocityByType).length > 0;

  // Computed once here rather than inline inside the JSX .map() below —
  // binVelocities() is O(n) per pitch type and cheap at this data scale
  // (a handful of pitch types, low thousands of pitches at most for a
  // full-time starter), so this isn't fixing a felt performance problem
  // the way the PitchChartTool/PitchLog memoization fix was. It's a minor
  // consistency change: every other derived value in this component
  // already goes through useMemo, and leaving this one as the one
  // exception recomputing on every render (including ones this component
  // re-renders for reasons unrelated to pitch data) had no upside.
  const histogramsByType = useMemo(() => {
    const out = {};
    for (const type of Object.keys(velocityByType)) out[type] = binVelocities(velocityByType[type]);
    return out;
  }, [velocityByType]);

  const breakData = useMemo(() => rows
    .filter(r => r.hb != null && r.ivb != null)
    .map(r => ({ x:r.hb, y:r.ivb, z:r.usage ?? 30, pitchName:r.pitchName, pitchType:r.pitchType, usage:r.usage, color:colorFor(r.pitchType) })),
  [rows]);

  const veloData = useMemo(() => rows
    .filter(r => r.velocity != null)
    .map(r => ({ pitchName:r.pitchName, velocity:r.velocity, color:colorFor(r.pitchType) })),
  [rows]);

  const visibleCols = useMemo(() => TABLE_COLUMNS.filter(c => rows.some(r => r[c.key] != null)), [rows]);

  if (!rows.length) {
    return (
      <Panel title="Pitch Shape" accent={C.rust}>
        <div style={{ padding:'8px 14px 10px' }}>
          <div style={sans({ fontSize:10.5, color:C.text3, padding:'6px 0' })}>
            No Statcast pitch-arsenal data available for this player/season yet.
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Pitch Shape" accent={C.rust} badge={`${rows.length} pitch${rows.length===1?'':'es'} · ${hasRawPitches ? 'Live Savant, pitch-level' : 'Live Savant'}`}>
      <div style={{ padding:'10px 14px 12px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Usage */}
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {rows.map(r => {
            const hand = usageByHand[r.pitchType];
            return (
              <div key={r.pitchType}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:colorFor(r.pitchType), flexShrink:0 }} />
                    <span style={sans({ fontSize:10.5, fontWeight:600, color:C.text2 })}>{r.pitchName}</span>
                  </span>
                  <span style={px({ fontSize:10.5, fontWeight:700, color:C.text })}>
                    {r.usage != null ? `${r.usage.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div style={{ height:5, background:C.surface3, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.max(0, Math.min(100, r.usage || 0))}%`,
                    background:colorFor(r.pitchType), borderRadius:3, transition:'width .6s ease' }} />
                </div>
                {hand && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                    <span style={px({ fontSize:9, color:C.text4, width:56, flexShrink:0 })}>vs LHH/RHH</span>
                    <div style={{ flex:1, height:4, borderRadius:2, overflow:'hidden', display:'flex' }}>
                      <div style={{ width:`${hand.vsL}%`, background:C.teal }} />
                      <div style={{ width:`${hand.vsR}%`, background:C.rust }} />
                    </div>
                    <span style={px({ fontSize:9, color:C.text4, flexShrink:0 })}>{`${hand.vsL.toFixed(0)}/${hand.vsR.toFixed(0)}`}</span>
                  </div>
                )}
              </div>
            );
          })}
          {!hasRawPitches && (
            <div style={sans({ fontSize:9, color:C.text4, marginTop:1, lineHeight:1.4 })}>
              Usage shown is overall, not split vs. LHH/RHH — that split needs pitch-level Statcast data this leaderboard doesn't carry.
            </div>
          )}
        </div>

        {/* Break plot */}
        {breakData.length > 0 && (
          <div>
            <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.text3, marginBottom:2 })}>
              Pitch Breaks
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top:10, right:18, bottom:22, left:2 }}>
                <CartesianGrid stroke={C.borderLight} strokeDasharray="2 3" />
                <XAxis type="number" dataKey="x" tick={{ fontSize:9, fill:C.text4 }} stroke={C.border}
                  label={{ value:'Horizontal Break (in)', position:'insideBottom', offset:-8, fontSize:9, fill:C.text3 }} />
                <YAxis type="number" dataKey="y" tick={{ fontSize:9, fill:C.text4 }} stroke={C.border}
                  label={{ value:'Induced Vert. Break (in)', angle:-90, position:'insideLeft', fontSize:9, fill:C.text3, style:{ textAnchor:'middle' } }} />
                <ZAxis type="number" dataKey="z" range={[90, 260]} />
                <ReferenceLine x={0} stroke={C.border} />
                <ReferenceLine y={0} stroke={C.border} />
                <Tooltip content={<BreakTooltip />} cursor={{ strokeDasharray:'3 3', stroke:C.border }} />
                <Scatter data={breakData} isAnimationActive={false}>
                  {breakData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {throws && (
              <div style={sans({ fontSize:9, color:C.text4, marginTop:-4 })}>
                Throws {throws} — arm-side break reads {throws === 'L' ? 'negative' : 'positive'} on this axis.
              </div>
            )}
          </div>
        )}

        {/* Velocity */}
        {hasRawPitches ? (
          <div>
            <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.text3, marginBottom:2 })}>
              Velocity Distribution by Pitch
            </div>
            <div style={sans({ fontSize:9, color:C.text4, marginBottom:6, lineHeight:1.4 })}>
              A real histogram of this season's pitches, not a smoothed density curve — bucketed to the nearest mph.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {rows.filter(r => velocityByType[r.pitchType]?.length).map(r => {
                const bins = histogramsByType[r.pitchType] || [];
                const maxCount = Math.max(...bins.map(b => b.count), 1);
                return (
                  <div key={r.pitchType}>
                    <div style={sans({ fontSize:9.5, fontWeight:600, color:C.text2, marginBottom:2 })}>{r.pitchName}</div>
                    <ResponsiveContainer width="100%" height={44}>
                      <BarChart data={bins} margin={{ top:0, right:2, bottom:0, left:2 }} barCategoryGap={0}>
                        <XAxis dataKey="bin" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize:8, fill:C.text4 }}
                          axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(0)} />
                        <Tooltip {...TT} formatter={v => [v, 'Pitches']} labelFormatter={v => `${Number(v).toFixed(1)} mph`} />
                        <Bar dataKey="count" isAnimationActive={false}>
                          {bins.map((b, i) => <Cell key={i} fill={colorFor(r.pitchType)} fillOpacity={0.35 + 0.65 * (b.count / maxCount)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        ) : veloData.length > 0 && (
          <div>
            <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.text3, marginBottom:2 })}>
              Avg. Velocity by Pitch
            </div>
            <ResponsiveContainer width="100%" height={Math.max(60, veloData.length * 26)}>
              <BarChart data={veloData} layout="vertical" margin={{ top:2, right:30, bottom:2, left:4 }} barCategoryGap="28%">
                <XAxis type="number" domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize:9, fill:C.text4 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="pitchName" width={80} tick={{ fontSize:9.5, fill:C.text2 }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} formatter={v => [`${Number(v).toFixed(1)} mph`, 'Velocity']} />
                <Bar dataKey="velocity" radius={[0,3,3,0]} isAnimationActive={false} barSize={14}>
                  {veloData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-pitch table */}
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:420 }}>
            <thead>
              <tr>
                <th style={{ padding:'5px 6px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', color:C.text2, textAlign:'left', borderBottom:`0.5px solid ${C.border}` }}>Pitch</th>
                {visibleCols.map(c => (
                  <th key={c.key} style={{ padding:'5px 6px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', color:C.text2, textAlign:'right', borderBottom:`0.5px solid ${C.border}` }}>{c.lbl}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.pitchType} style={{ borderBottom:`0.5px solid ${C.borderLight}` }}>
                  <td style={{ padding:'5px 6px' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:7, height:7, borderRadius:2, background:colorFor(r.pitchType), flexShrink:0 }} />
                      <span style={sans({ fontSize:10.5, fontWeight:600, color:C.text })}>{r.pitchName}</span>
                    </span>
                  </td>
                  {visibleCols.map(c => (
                    <td key={c.key} style={{ padding:'5px 6px', textAlign:'right', ...px({ fontSize:10.5, color:C.text2 }) }}>{c.fmt(r[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
