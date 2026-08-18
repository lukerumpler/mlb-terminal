import React, { useState, useMemo, memo } from 'react';
import { C, px, sans, WARM_TOOLTIP } from '../constants/colors.js';
import { Panel, StatStrip, KVRow } from '../components/atoms.jsx';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';

/* ─── static data ──────────────────────────────────────────────────── */

// AMD+ leaderboard — hitters (lower = better swing precision)
const HITTER_LEADERS = [
  { rank:1,  name:'Luis Arraez',      team:'MIA', pos:'2B', amd:0.28, amdPlus:56,  pct:97, timing:0.12, contact:0.18, vertical:0.14 },
  { rank:2,  name:'Freddie Freeman',  team:'LAD', pos:'1B', amd:0.31, amdPlus:62,  pct:94, timing:0.16, contact:0.20, vertical:0.17 },
  { rank:3,  name:'Steven Kwan',      team:'CLE', pos:'OF', amd:0.33, amdPlus:66,  pct:91, timing:0.15, contact:0.22, vertical:0.19 },
  { rank:4,  name:'Juan Soto',        team:'NYM', pos:'OF', amd:0.36, amdPlus:72,  pct:87, timing:0.18, contact:0.23, vertical:0.21 },
  { rank:5,  name:'Jose Abreu',       team:'HOU', pos:'1B', amd:0.38, amdPlus:76,  pct:84, timing:0.19, contact:0.24, vertical:0.22 },
  { rank:6,  name:'Trea Turner',      team:'PHI', pos:'SS', amd:0.41, amdPlus:82,  pct:79, timing:0.21, contact:0.26, vertical:0.24 },
  { rank:7,  name:'Mookie Betts',     team:'LAD', pos:'OF', amd:0.43, amdPlus:86,  pct:75, timing:0.22, contact:0.28, vertical:0.25 },
  { rank:8,  name:'Yordan Alvarez',   team:'HOU', pos:'DH', amd:0.45, amdPlus:90,  pct:70, timing:0.23, contact:0.29, vertical:0.26 },
  { rank:9,  name:'Gunnar Henderson', team:'BAL', pos:'SS', amd:0.48, amdPlus:96,  pct:62, timing:0.25, contact:0.30, vertical:0.28 },
  { rank:10, name:'Bryce Harper',     team:'PHI', pos:'1B', amd:0.50, amdPlus:100, pct:50, timing:0.26, contact:0.31, vertical:0.29 },
];

// IMD+ leaderboard — pitchers (higher = more swing disruption)
const PITCHER_LEADERS = [
  { rank:1,  name:'Jacob deGrom',    team:'TEX', pos:'RHP', imd:0.74, imdPlus:148, pct:99, timing:0.38, contact:0.44, vertical:0.40 },
  { rank:2,  name:'Corbin Burnes',   team:'BAL', pos:'RHP', imd:0.71, imdPlus:142, pct:97, timing:0.36, contact:0.42, vertical:0.38 },
  { rank:3,  name:'Spencer Strider', team:'ATL', pos:'RHP', imd:0.69, imdPlus:138, pct:96, timing:0.35, contact:0.41, vertical:0.37 },
  { rank:4,  name:'Shane McClanahan',team:'TB',  pos:'LHP', imd:0.67, imdPlus:134, pct:93, timing:0.34, contact:0.40, vertical:0.36 },
  { rank:5,  name:'Gerrit Cole',     team:'NYY', pos:'RHP', imd:0.65, imdPlus:130, pct:90, timing:0.33, contact:0.38, vertical:0.35 },
  { rank:6,  name:'Zach Wheeler',    team:'PHI', pos:'RHP', imd:0.62, imdPlus:124, pct:86, timing:0.31, contact:0.37, vertical:0.33 },
  { rank:7,  name:'Dylan Cease',     team:'SD',  pos:'RHP', imd:0.60, imdPlus:120, pct:82, timing:0.30, contact:0.36, vertical:0.31 },
  { rank:8,  name:'Pablo Lopez',     team:'MIN', pos:'RHP', imd:0.57, imdPlus:114, pct:76, timing:0.29, contact:0.34, vertical:0.30 },
  { rank:9,  name:'Max Fried',       team:'NYY', pos:'LHP', imd:0.55, imdPlus:110, pct:70, timing:0.28, contact:0.33, vertical:0.29 },
  { rank:10, name:'Logan Webb',      team:'SF',  pos:'RHP', imd:0.52, imdPlus:104, pct:58, timing:0.27, contact:0.31, vertical:0.28 },
];

// Scatter: league-wide AMD+ vs wRC+
const SCATTER_DATA = [
  { name:'Luis Arraez',     amdPlus:56,  wrc:118 }, { name:'Juan Soto',         amdPlus:72,  wrc:156 },
  { name:'Freddie Freeman', amdPlus:62,  wrc:142 }, { name:'Steven Kwan',       amdPlus:66,  wrc:122 },
  { name:'Yordan Alvarez',  amdPlus:90,  wrc:168 }, { name:'Aaron Judge',       amdPlus:108, wrc:172 },
  { name:'Gunnar Henderson',amdPlus:96,  wrc:138 }, { name:'Bryce Harper',      amdPlus:100, wrc:134 },
  { name:'Mookie Betts',    amdPlus:86,  wrc:128 }, { name:'Trea Turner',       amdPlus:82,  wrc:124 },
  { name:'Mike Trout',      amdPlus:104, wrc:145 }, { name:'Pete Alonso',       amdPlus:118, wrc:132 },
  { name:'Cody Bellinger',  amdPlus:112, wrc:106 }, { name:'Jose Abreu',        amdPlus:76,  wrc:108 },
  { name:'Rafael Devers',   amdPlus:124, wrc:130 }, { name:'Bo Bichette',       amdPlus:132, wrc:102 },
  { name:'Julio Rodriguez', amdPlus:128, wrc:118 }, { name:'Carlos Correa',     amdPlus:115, wrc:112 },
  { name:'Byron Buxton',    amdPlus:138, wrc:114 }, { name:'Tyler O\'Neill',    amdPlus:142, wrc:96  },
  { name:'Jose Miranda',    amdPlus:136, wrc:94  }, { name:'Adley Rutschman',   amdPlus:94,  wrc:122 },
  { name:'Austin Riley',    amdPlus:110, wrc:136 }, { name:'Paul Goldschmidt',  amdPlus:88,  wrc:116 },
  { name:'Nolan Arenado',   amdPlus:92,  wrc:112 }, { name:'Average hitter',    amdPlus:100, wrc:100 },
];

// Swing error breakdown by pitch type — example player (Luis Arraez)
const PITCH_AMD_DATA = [
  { type:'4-Seam', timing:0.14, contact:0.20, vertical:0.16, amdPlus:61 },
  { type:'Sinker',  timing:0.12, contact:0.17, vertical:0.13, amdPlus:55 },
  { type:'Slider',  timing:0.22, contact:0.28, vertical:0.24, amdPlus:88 },
  { type:'Curve',   timing:0.26, contact:0.31, vertical:0.27, amdPlus:96 },
  { type:'Change',  timing:0.18, contact:0.24, vertical:0.19, amdPlus:74 },
  { type:'Cutter',  timing:0.16, contact:0.22, vertical:0.17, amdPlus:68 },
];

// 3D scatter positions for the swing error map (flattened to 2D with size=Z)
const SWING_MAP_DATA = [
  { x:-0.04, y:0.06,  z:0.04,  label:'Luis Arraez',   tier:'elite' },
  { x:-0.10, y:0.08,  z:0.06,  label:'Steven Kwan',   tier:'elite' },
  { x: 0.08, y:-0.10, z:-0.08, label:'Freddie Freeman', tier:'elite' },
  { x: 0.12, y: 0.14, z: 0.10, label:'Juan Soto',     tier:'plus' },
  { x:-0.16, y:-0.12, z: 0.14, label:'Mookie Betts',  tier:'plus' },
  { x: 0.20, y: 0.18, z:-0.16, label:'Gunnar Hend.',  tier:'plus' },
  { x:-0.24, y: 0.22, z: 0.20, label:'Yordan Alvarez',tier:'avg' },
  { x: 0.30, y:-0.26, z:-0.22, label:'Bryce Harper',  tier:'avg' },
  { x:-0.34, y: 0.30, z: 0.26, label:'Rafael Devers', tier:'below' },
  { x: 0.38, y:-0.34, z:-0.30, label:'Tyler O\'Neill',tier:'below' },
];

// Radar for precision profile
// Fallback profile — used if spotlight not yet set (memo initializes from first player on mount)
const PRECISION_PROFILE = [
  { axis:'Timing',      player:96, league:50 },
  { axis:'Contact',     player:91, league:50 },
  { axis:'Vertical',    player:88, league:50 },
  { axis:'Chase',       player:94, league:50 },
  { axis:'Recognition', player:93, league:50 },
];

/* ─── sub-components ───────────────────────────────────────────────── */

function SectionHead({ label }) {
  return (
    <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:C.text4, padding:'10px 0 4px' })}>
      {label}
    </div>
  );
}

function InsightBox({ text, color = C.amber }) {
  return (
    <div style={{ margin:'0 13px 8px', padding:'8px 10px', borderLeft:`3px solid ${color}`, background:`color-mix(in srgb, ${color} 7%, transparent)`, borderRadius:'0 6px 6px 0' }}>
      <div style={sans({ fontSize:10, color:C.text2, lineHeight:1.5 })}>{text}</div>
    </div>
  );
}

function AmdPlusBadge({ val, higher = false }) {
  // For hitters: lower is better. For pitchers (higher=true): higher is better.
  const good = higher ? val >= 120 : val <= 80;
  const ok   = higher ? val >= 100 : val <= 100;
  const col  = good ? C.teal : ok ? C.amber : C.rust;
  const bg   = good ? C.tealSoft : ok ? C.amberSoft : C.rustSoft;
  const bdr  = good ? C.tealMid : ok ? C.amberMid : C.rustMid;
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:11,
      fontWeight:700, letterSpacing:'.04em', background:bg, color:col,
      border:`0.5px solid ${bdr}`, fontFamily:"'DM Mono', monospace",
    }}>
      {val}
    </span>
  );
}

function SwingMap() {
  const tierColor = t => t === 'elite' ? C.teal : t === 'plus' ? C.amber : t === 'below' ? C.rust : C.slate;
  const SIZE = 260;
  const MID  = SIZE / 2;
  const scale = v => MID + v * 320;

  return (
    <div style={{ position:'relative', width:SIZE, height:SIZE, margin:'0 auto', flexShrink:0 }}>
      {/* grid */}
      <svg width={SIZE} height={SIZE} style={{ position:'absolute', inset:0 }}>
        <rect x={0} y={0} width={SIZE} height={SIZE} fill={C.surface2} rx={8} />
        {[-0.5,-0.25,0,0.25,0.5].map(v => (
          <React.Fragment key={v}>
            <line x1={scale(v)} y1={0} x2={scale(v)} y2={SIZE} stroke={C.border} strokeWidth={v===0?1.5:0.5} />
            <line x1={0} y1={scale(v)} x2={SIZE} y2={scale(v)} stroke={C.border} strokeWidth={v===0?1.5:0.5} />
          </React.Fragment>
        ))}
        {/* "perfect" crosshair */}
        <circle cx={MID} cy={MID} r={18} fill="none" stroke={C.amber} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={MID} cy={MID} r={4}  fill={C.amber} />
        {/* axis labels */}
        <text x={MID} y={11} textAnchor="middle" fill={C.text3} fontSize={8} fontFamily="DM Mono,monospace">EARLY</text>
        <text x={MID} y={SIZE-3} textAnchor="middle" fill={C.text3} fontSize={8} fontFamily="DM Mono,monospace">LATE</text>
        <text x={5} y={MID+3} fill={C.text3} fontSize={8} fontFamily="DM Mono,monospace">OVER</text>
        <text x={SIZE-28} y={MID+3} fill={C.text3} fontSize={8} fontFamily="DM Mono,monospace">UNDER</text>
        {/* player dots */}
        {SWING_MAP_DATA.map((d, i) => {
          const cx = scale(d.x);
          const cy = scale(d.y);
          const col = tierColor(d.tier);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={5} fill={col} opacity={0.85} />
              <text x={cx+7} y={cy+3} fill={col} fontSize={7} fontFamily="DM Mono,monospace">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FormulaDisplay() {
  return (
    <div style={{
      background:C.surface3, borderRadius:10, padding:'16px 20px', margin:'0 0 2px',
      borderLeft:`3px solid ${C.amber}`,
      fontFamily:"'DM Mono',monospace",
    }}>
      <div style={{ fontSize:10, color:C.text3, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:12 }}>
        Weighted AMD Formula
      </div>
      <div style={{ fontSize:13, color:C.text, lineHeight:2 }}>
        <span style={{ color:C.amber, fontWeight:700 }}>AMD</span>
        {' = √('}
        <span style={{ color:C.teal }}>(Timing × 0.50)</span>
        {'² + '}
        <span style={{ color:C.amberDark }}>(Contact × 0.30)</span>
        {'² + '}
        <span style={{ color:C.purple }}>(Vertical × 0.20)</span>
        {'²)'}
      </div>
      <div style={{ fontSize:11, color:C.text3, marginTop:10, lineHeight:1.6 }}>
        <span style={{ color:C.teal }}>Timing</span> — barrel early/late relative to pitch &nbsp;·&nbsp;
        <span style={{ color:C.amberDark }}>Contact</span> — ahead/behind at impact &nbsp;·&nbsp;
        <span style={{ color:C.purple }}>Vertical</span> — over/under on barrel alignment
      </div>
      <div style={{ marginTop:12, paddingTop:10, borderTop:`0.5px solid ${C.border}`, fontSize:10, color:C.text3, lineHeight:1.6 }}>
        <span style={{ color:C.amber, fontWeight:700 }}>AMD+</span>
        {' = (Player AMD / League Avg AMD) × 100  ·  '}
        <span style={{ color:C.teal }}>Lower is better for hitters</span>
        {' · League avg = 0.50'}
      </div>
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────── */

function AMDPage() {
  const [view, setView] = useState('hitters'); // 'hitters' | 'pitchers'
  const [spotlight, setSpotlight] = useState(HITTER_LEADERS[0]);

  const isHitter = view === 'hitters';

  // Build dynamic precision profile from spotlight error values (scaled 20–100, inverted so lower error = higher score)
  const precisionProfile = useMemo(() => {
    if (!spotlight) return PRECISION_PROFILE;
    const scaleErr = v => Math.round(Math.max(20, Math.min(100, 100 - (v / 0.6) * 80)));
    const hitter = view === 'hitters';
    return [
      { axis:'Timing',      player: scaleErr(spotlight.timing  || 0.3), league:50 },
      { axis:'Contact',     player: scaleErr(spotlight.contact || 0.3), league:50 },
      { axis:'Vertical',    player: scaleErr(spotlight.vertical|| 0.3), league:50 },
      { axis:'Chase',       player: Math.round(50 + (hitter ? (100 - (spotlight.amdPlus||100)) * 0.35 : (spotlight.imdPlus||100) * 0.25)), league:50 },
      { axis:'Recognition', player: Math.round(50 + (hitter ? (100 - (spotlight.amdPlus||100)) * 0.30 : (spotlight.imdPlus||100) * 0.20)), league:50 },
    ];
  }, [spotlight, view]);
  const leaderboard = isHitter ? HITTER_LEADERS : PITCHER_LEADERS;

  const scatterColor = d => {
    const score = (100 - d.amdPlus) * 0.5 + (d.wrc - 100) * 0.5;
    return score > 30 ? C.teal : score > 0 ? C.amber : C.rust;
  };

  return (
    <div style={{ padding:'0 0 40px' }}>

      {/* ── strip ── */}
      <StatStrip items={[
        { val:'AMD+',   lbl:'Metric',           sub:'Avg Miss Distance' },
        { val:'0.50',   lbl:'League Avg AMD',   sub:'2026 baseline' },
        { val:'0.28',   lbl:'Best AMD',         sub:'Luis Arraez' },
        { val:'IMD+',   lbl:'Pitcher Metric',   sub:'Induced Miss Dist' },
        { val:'0.74',   lbl:'Best IMD',         sub:'Jacob deGrom' },
        { val:'3',      lbl:'Error Axes',       sub:'Timing · Contact · Vert' },
      ]} />

      <div style={{ height:4 }} />
      <div style={sans({ fontSize:9.5, color:C.text4, padding:'0 2px 12px', lineHeight:1.4 })}>
        The leaderboard, scatter plot, spotlight, and pitch-type breakdown below use fixed
        illustrative example values (marked "Illustrative") to explain how AMD/IMD work — they
        are not computed from live per-player Statcast data. Real per-player AMD, seeded from a
        given player's own actual batted-ball profile, is computed live on the Players tab.
      </div>

      {/* ── formula + concept ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <FormulaDisplay />
        </div>
        <Panel title="Metric Overview" accent={C.amber} badge="SKIP Model">
          <div style={{ padding:'10px 0 4px' }}>
            <KVRow label="What it measures"   value="3D swing deviation from ideal contact point" />
            <KVRow label="Data source"        value="Baseball Savant bat tracking distributions" />
            <KVRow label="Scale"              value="100 = MLB average · lower = better (hitters)" />
            <KVRow label="Pitcher version"    value="IMD+ · higher = more disruption generated" />
            <KVRow label="Weight: Timing"     value="50% — largest driver of contact quality" />
            <KVRow label="Weight: Contact"    value="30% — ahead/behind at point of impact" />
            <KVRow label="Weight: Vertical"   value="20% — barrel over/under the pitch plane" />
            <KVRow label="Status"             value="2026 season · SKIP beta metric" last />
          </div>
          <InsightBox text="AMD isolates swing mechanics from outcomes. A hitter with a great swing but bad luck will show elite AMD+ even when traditional stats lag. The named-player examples on this page illustrate the concept with fixed numbers, not a live computation." />
        </Panel>
      </div>

      {/* ── main layout ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:12 }}>

        {/* LEFT */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* leaderboard toggle + table */}
          <Panel
            title={isHitter ? 'AMD+ Hitter Leaders — 2026 (Illustrative)' : 'IMD+ Pitcher Leaders — 2026 (Illustrative)'}
            accent={isHitter ? C.teal : C.rust}
            badge={
              <div style={{ display:'flex', gap:4 }}>
                {['hitters','pitchers'].map(v => (
                  <button key={v} onClick={() => { setView(v); setSpotlight(v==='hitters' ? HITTER_LEADERS[0] : PITCHER_LEADERS[0]); }}
                    style={{
                      padding:'2px 8px', borderRadius:3, border:`0.5px solid ${C.border}`,
                      background: view===v ? C.navy : 'transparent',
                      color: view===v ? '#EAE2D6' : C.text3,
                      cursor:'pointer', fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700, letterSpacing:'.05em',
                    }}>
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          >
            {/* header */}
            <div style={{
              display:'grid',
              gridTemplateColumns: '28px 1fr 44px 32px 54px 54px 44px 44px 44px',
              padding:'4px 14px', borderBottom:`0.5px solid ${C.border}`,
              background:C.surface2,
            }}>
              {['RK','PLAYER','TEAM','POS', isHitter ? 'AMD' : 'IMD', isHitter ? 'AMD+' : 'IMD+', 'TIMING','CONTACT','VERT'].map((h,i) => (
                <span key={i} style={px({ fontSize:9, color:C.text3, fontWeight:700, letterSpacing:'.06em', textAlign:i>1?'center':'left' })}>{h}</span>
              ))}
            </div>

            {leaderboard.map((p, i) => {
              const plus   = isHitter ? p.amdPlus : p.imdPlus;
              const metric = isHitter ? p.amd     : p.imd;
              const isActive = spotlight?.name === p.name;
              return (
                <div key={p.name}
                  onClick={() => setSpotlight(p)}
                  style={{
                    display:'grid',
                    gridTemplateColumns:'28px 1fr 44px 32px 54px 54px 44px 44px 44px',
                    padding:'7px 14px', cursor:'pointer',
                    borderBottom: i < leaderboard.length-1 ? `0.5px solid ${C.borderLight}` : 'none',
                    background: isActive ? C.amberSoft : 'transparent',
                    transition:'background .1s',
                  }}
                >
                  <span style={px({ fontSize:11, color:C.text3 })}>{p.rank}</span>
                  <span style={sans({ fontSize:12, fontWeight:700, color:C.text })}>{p.name}</span>
                  <span style={px({ fontSize:10, color:C.text3, textAlign:'center' })}>{p.team}</span>
                  <span style={px({ fontSize:10, color:C.text3, textAlign:'center' })}>{p.pos}</span>
                  <span style={px({ fontSize:11, fontWeight:700, color:C.text, textAlign:'center' })}>{metric.toFixed(2)}</span>
                  <div style={{ display:'flex', justifyContent:'center' }}>
                    <AmdPlusBadge val={plus} higher={!isHitter} />
                  </div>
                  <span style={px({ fontSize:10, color:C.text3, textAlign:'center' })}>{p.timing.toFixed(2)}</span>
                  <span style={px({ fontSize:10, color:C.text3, textAlign:'center' })}>{p.contact.toFixed(2)}</span>
                  <span style={px({ fontSize:10, color:C.text3, textAlign:'center' })}>{p.vertical.toFixed(2)}</span>
                </div>
              );
            })}
            <div style={sans({ fontSize:9, color:C.text4, padding:'8px 14px', lineHeight:1.4 })}>
              Illustrative — fixed example values for these named players, not a live leaderboard.
            </div>
          </Panel>

          {/* AMD+ vs wRC+ scatter */}
          <Panel title="AMD+ vs wRC+ — Swing Precision vs Offensive Output" accent={C.slate} badge="Illustrative">
            <div style={{ padding:'12px 14px 4px' }}>
              <div style={{ height:220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top:10, right:20, bottom:20, left:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis
                      dataKey="amdPlus" type="number" domain={[50,150]} name="AMD+"
                      label={{ value:'AMD+ (lower = better swing precision)', position:'insideBottom', offset:-12, fill:C.text3, fontSize:9, fontFamily:'DM Mono,monospace' }}
                      tick={{ fill:C.text3, fontSize:9, fontFamily:'DM Mono,monospace' }}
                    />
                    <YAxis
                      dataKey="wrc" type="number" domain={[80,180]} name="wRC+"
                      tick={{ fill:C.text3, fontSize:9, fontFamily:'DM Mono,monospace' }}
                      label={{ value:'wRC+', angle:-90, position:'insideLeft', fill:C.text3, fontSize:9, fontFamily:'DM Mono,monospace' }}
                    />
                    <ZAxis range={[30,30]} />
                    <Tooltip
                      {...WARM_TOOLTIP}
                      cursor={{ stroke:C.border }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:6, padding:'6px 10px' }}>
                            <div style={sans({ fontSize:11, fontWeight:700, color:C.text, marginBottom:3 })}>{d.name}</div>
                            <div style={px({ fontSize:10, color:C.text2 })}>AMD+ {d.amdPlus} · wRC+ {d.wrc}</div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine x={100} stroke={C.amber} strokeWidth={1} strokeDasharray="4 4" />
                    <ReferenceLine y={100} stroke={C.amber} strokeWidth={1} strokeDasharray="4 4" />
                    <Scatter
                      data={SCATTER_DATA}
                      fill={C.teal}
                      shape={({ cx, cy, payload }) => (
                        <circle cx={cx} cy={cy} r={5} fill={scatterColor(payload)} opacity={0.8} />
                      )}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'flex', gap:16, justifyContent:'center', paddingBottom:6 }}>
                {[{col:C.teal,lbl:'Precision + production'},{col:C.amber,lbl:'Mixed'},{col:C.rust,lbl:'Below avg on both'}].map(l => (
                  <div key={l.lbl} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:l.col }} />
                    <span style={px({ fontSize:9, color:C.text3 })}>{l.lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Pitch-type breakdown — fixed illustrative example (Luis Arraez), does NOT
             follow the leaderboard/spotlight selection above. It used to read
             `AMD by Pitch Type — ${spotlight?.name}`, which changed the title to whichever
             player was clicked while the chart data and caption stayed hardcoded to Arraez —
             a real mismatch bug (title claiming to describe player X, content silently still
             describing Arraez), not just a missing-disclaimer issue. Title is now static and
             honest about that instead of implying this panel reacts to the click above. */}
          <Panel title="AMD by Pitch Type — Example: Luis Arraez" accent={C.purple} badge="Illustrative">
            <div style={{ padding:'12px 14px 8px' }}>
              <div style={{ height:180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={PITCH_AMD_DATA} barSize={22} margin={{ top:4, right:8, bottom:0, left:-10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} vertical={false} />
                    <XAxis dataKey="type" tick={{ fill:C.text2, fontSize:10, fontFamily:'DM Mono,monospace' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:C.text3, fontSize:9, fontFamily:'DM Mono,monospace' }} axisLine={false} tickLine={false} />
                    <Tooltip {...WARM_TOOLTIP} />
                    <Bar dataKey="timing"   name="Timing Error"  fill={C.teal}   radius={[0,0,0,0]} stackId="a"  isAnimationActive={false}/>
                    <Bar dataKey="contact"  name="Contact Error" fill={C.amber}  radius={[0,0,0,0]} stackId="a"  isAnimationActive={false}/>
                    <Bar dataKey="vertical" name="Vert Error"    fill={C.purple} radius={[3,3,0,0]} stackId="a"  isAnimationActive={false}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:'flex', gap:14, justifyContent:'center', paddingTop:4 }}>
                {[{col:C.teal,lbl:'Timing'},{col:C.amber,lbl:'Contact'},{col:C.purple,lbl:'Vertical'}].map(l => (
                  <div key={l.lbl} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:l.col }} />
                    <span style={px({ fontSize:9, color:C.text3 })}>{l.lbl}</span>
                  </div>
                ))}
              </div>
              <InsightBox text="Illustrative example: this fixed breakdown shows how AMD can vary by pitch type for one hitter (Arraez) — it doesn't update with the leaderboard selection above." color={C.purple} />
            </div>
          </Panel>

        </div>

        {/* RIGHT */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Player spotlight */}
          {spotlight && (
            <Panel
              title={isHitter ? 'AMD+ Spotlight (Illustrative)' : 'IMD+ Spotlight (Illustrative)'}
              accent={isHitter ? C.teal : C.rust}
              badge={<AmdPlusBadge val={isHitter ? spotlight.amdPlus : spotlight.imdPlus} higher={!isHitter} />}
            >
              <div style={{ padding:'12px 14px 4px' }}>
                <div style={{ marginBottom:10 }}>
                  <div style={sans({ fontSize:17, fontWeight:800, color:C.text, marginBottom:2 })}>{spotlight.name}</div>
                  <div style={px({ fontSize:10, color:C.text3 })}>{spotlight.team} · {spotlight.pos}</div>
                </div>

                {/* big metric */}
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
                  background:C.surface2, borderRadius:8, overflow:'hidden', marginBottom:10,
                  border:`0.5px solid ${C.border}`,
                }}>
                  {[
                    { lbl: isHitter ? 'AMD' : 'IMD',      val: isHitter ? spotlight.amd?.toFixed(2) : spotlight.imd?.toFixed(2) },
                    { lbl: isHitter ? 'AMD+' : 'IMD+',     val: isHitter ? spotlight.amdPlus : spotlight.imdPlus },
                    { lbl: 'PERCENTILE',                    val: `${spotlight.pct}th` },
                  ].map((m, i) => (
                    <div key={i} style={{
                      padding:'10px 8px', textAlign:'center',
                      borderRight: i < 2 ? `0.5px solid ${C.border}` : 'none',
                    }}>
                      <div style={px({ fontSize:20, fontWeight:800, color:C.text, lineHeight:1 })}>{m.val}</div>
                      <div style={sans({ fontSize:9, color:C.text3, marginTop:3, textTransform:'uppercase', letterSpacing:'.06em' })}>{m.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* error bars */}
                <SectionHead label="Error breakdown" />
                {[
                  { lbl:'Timing',   val:spotlight.timing,   weight:'50%', col:C.teal   },
                  { lbl:'Contact',  val:spotlight.contact,  weight:'30%', col:C.amber  },
                  { lbl:'Vertical', val:spotlight.vertical, weight:'20%', col:C.purple },
                ].map(row => {
                  const pct = Math.min(100, (row.val / 0.6) * 100);
                  return (
                    <div key={row.lbl} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                      <span style={sans({ fontSize:11, fontWeight:700, color:C.text, width:60, flexShrink:0 })}>{row.lbl}</span>
                      <span style={px({ fontSize:9, color:C.text4, width:22 })}>{row.weight}</span>
                      <div style={{ flex:1, height:5, background:C.surface3, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:row.col, borderRadius:3 }} />
                      </div>
                      <span style={px({ fontSize:11, fontWeight:700, color:row.col, minWidth:30, textAlign:'right' })}>{row.val.toFixed(2)}</span>
                    </div>
                  );
                })}

                <div style={{ height:6 }} />
              </div>

              {/* precision radar */}
              <div style={{ borderTop:`0.5px solid ${C.border}`, padding:'8px 0 0' }}>
                <div style={sans({ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:C.text4, padding:'0 14px 6px' })}>
                  Swing Precision Profile
                </div>
                <div style={{ height:180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={precisionProfile}>
                      <PolarGrid stroke={C.border} />
                      <PolarAngleAxis dataKey="axis" tick={{ fill:C.text2, fontSize:9, fontFamily:'DM Mono,monospace' }} />
                      <Radar name="League Avg"      dataKey="league" stroke={C.border} fill={C.border}  fillOpacity={0.15} strokeWidth={1}  isAnimationActive={false}/>
                      <Radar name={spotlight.name}  dataKey="player" stroke={C.teal}  fill={C.teal}   fillOpacity={0.25} strokeWidth={2}  isAnimationActive={false}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display:'flex', gap:12, justifyContent:'center', padding:'4px 0 10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:C.teal }} />
                    <span style={px({ fontSize:9, color:C.text3 })}>{spotlight.name}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:C.border }} />
                    <span style={px({ fontSize:9, color:C.text3 })}>League Avg</span>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* Swing Error Map */}
          <Panel title="2D Swing Error Map" accent={C.slate} badge="Timing × Vertical">
            <div style={{ padding:'10px 14px 12px' }}>
              <SwingMap />
              <div style={{ display:'flex', justifyContent:'center', gap:14, marginTop:10 }}>
                {[{col:C.teal,lbl:'Elite'},{col:C.amber,lbl:'Plus'},{col:C.slate,lbl:'Avg'},{col:C.rust,lbl:'Below'}].map(l => (
                  <div key={l.lbl} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:l.col }} />
                    <span style={px({ fontSize:9, color:C.text3 })}>{l.lbl}</span>
                  </div>
                ))}
              </div>
              <InsightBox text="Center of the map = perfect swing. Distance from center = AMD. Arraez and Kwan cluster tightly around the ideal zone across all pitches." color={C.slate} />
            </div>
          </Panel>

          {/* Interpretation guide */}
          <Panel title="Reading AMD+" accent={C.amber}>
            {[
              { range:'< 70',     label:'Elite',   desc:'Exceptional swing precision — elite contact tool',   col:C.teal },
              { range:'70–85',    label:'Plus',    desc:'Above-average swing control, strong contact profile', col:C.amber },
              { range:'86–114',   label:'Average', desc:'MLB-average swing deviation',                        col:C.slate },
              { range:'115–130',  label:'Below',   desc:'Elevated swing error — contact risk',                col:C.rust },
              { range:'130+',     label:'Poor',    desc:'High miss rates — swing-and-miss profile',           col:C.red },
            ].map((r, i, arr) => (
              <div key={r.range} style={{
                display:'flex', alignItems:'center', gap:10, padding:'7px 14px',
                borderBottom: i < arr.length-1 ? `0.5px solid ${C.borderLight}` : 'none',
              }}>
                <span style={px({ fontSize:11, fontWeight:700, color:r.col, width:54, flexShrink:0 })}>{r.range}</span>
                <span style={sans({ fontSize:11, fontWeight:700, color:r.col, width:46, flexShrink:0 })}>{r.label}</span>
                <span style={sans({ fontSize:10, color:C.text2, lineHeight:1.4 })}>{r.desc}</span>
              </div>
            ))}
            <InsightBox text="IMD+ works in reverse — a pitcher with IMD+ 135 induces misses 35% farther than league average. Elite = 120+." />
          </Panel>

        </div>
      </div>
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(AMDPage);
