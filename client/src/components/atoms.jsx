import React, { memo, useId } from 'react';
import { C, px, sans } from '../constants/colors.js';

// Shared color+alpha helper (avoids duplicate in each component).
// Was doing h.slice(1,3) etc, assuming h was a literal '#rrggbb' hex string.
// Every caller passes a C.x token, which is now a CSS variable reference
// (e.g. 'var(--rust)') since the dark-mode conversion — that produced
// rgba(NaN,NaN,NaN,a), an invalid color silently dropped by the browser.
// color-mix() works correctly with CSS variables; a (0–1) becomes a percent.
function hexRgba(h, a) {
  return `color-mix(in srgb, ${h} ${Math.round(a * 100)}%, transparent)`;
}

export function Badge({ children, color = C.amber, bg = C.amberSoft, border = C.amberMid }) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10.5,
      fontWeight:700, letterSpacing:'.04em', background:bg, color,
      border:`0.5px solid ${border}`, fontFamily:"'DM Mono', monospace", whiteSpace:'nowrap',
    }}>
      {children}
    </span>
  );
}

// Position colour map — centralised so PosBadge and any inline usage agree
export const POS_COLOR = {
  SP:C.rust, RP:C.rust, LHP:C.rust, RHP:C.rust, CL:C.rust,
  SS:C.teal, '3B':C.amber, OF:C.purple, LF:C.purple, CF:C.purple, RF:C.purple,
  '1B':C.slate, '2B':C.slate, C:C.green, DH:C.amber, INF:C.slate, UT:C.text3,
};

export const PosBadge = memo(function PosBadge({ pos }) {
  const col = POS_COLOR[pos] || C.slate;
  return <Badge color={col} bg={hexRgba(col,0.12)} border={hexRgba(col,0.35)}>{pos}</Badge>;
});

export const FVBadge = memo(function FVBadge({ fv }) {
  const col = fv >= 65 ? C.teal : fv >= 60 ? C.amber : fv >= 55 ? C.slate : C.text3;
  const bg  = fv >= 65 ? C.tealSoft : fv >= 60 ? C.amberSoft : C.surface3;
  return <Badge color={col} bg={bg} border={hexRgba(col,0.35)}>{fv}</Badge>;
});

export const RiskDot = memo(function RiskDot({ risk }) {
  const col = risk === 'Low' ? C.teal : risk === 'Medium' ? C.amber : C.rust;
  return (
    <span title={`${risk} risk`} style={{
      display:'inline-block', width:7, height:7, borderRadius:'50%',
      background:col, flexShrink:0, verticalAlign:'middle',
    }} />
  );
});

// Trend badge (Roadmap #6) — Surge/Slide, derived from live-vs-preseason
// eFV drift (see ProspectsPage's fvDelta). No 'Injured' state: SKIP has no
// live injury feed, so a per-player injury tag would be an invented claim
// about a real person rather than a computed one — deliberately left out.
export const TrendBadge = memo(function TrendBadge({ trend, delta }) {
  if (!trend) return <span style={sans({ fontSize:11, color:C.text4 })}>—</span>;
  const up = trend === 'Surge';
  const col = up ? C.teal : C.rust;
  return (
    <span title={delta != null ? `eFV ${delta > 0 ? '+' : ''}${delta} vs. preseason` : trend}
      style={{ ...px({ fontSize:10.5, fontWeight:800 }), color:col, whiteSpace:'nowrap' }}>
      {up ? '▲' : '▼'} {trend}
    </span>
  );
});

export const ToolBadge = memo(function ToolBadge({ val }) {
  if (!val) return <div style={{ width:30, height:30 }} />;
  const cls = val >= 60 ? 'elite' : val >= 55 ? 'plus' : val >= 50 ? 'avg' : val >= 45 ? 'below' : 'poor';
  const map = {
    elite: [C.teal,  C.tealSoft,  C.teal  ],
    plus:  [C.amber, C.amberSoft, C.amber ],
    avg:   [C.slate, C.surface3,  C.border],
    below: [C.rust,  C.rustSoft,  C.rust  ],
    poor:  [C.red,   C.redSoft,   C.rust  ],
  };
  const [col, bg, bdr] = map[cls];
  return (
    <div style={{
      width:30, height:30, borderRadius:6, display:'flex', alignItems:'center',
      justifyContent:'center', background:bg, border:`0.5px solid ${bdr}`,
      ...px({ fontSize:11, fontWeight:700, color:col, flexShrink:0 }),
    }}>
      {val}
    </div>
  );
});

// VerdictBadge — new: styled verdict pill for use in tables and cards
export function VerdictBadge({ verdict }) {
  const col =
    verdict === 'PRIORITY ACQ' || verdict === 'STRONG BUY' ? C.teal :
    verdict === 'MONITOR' ? C.amber :
    verdict === 'HOLD'    ? C.slate : C.rust;
  return (
    <span style={{
      display:'inline-block', padding:'2px 9px', borderRadius:4, fontSize:10,
      fontWeight:800, letterSpacing:'.04em',
      background:hexRgba(col,0.12), color:col,
      border:`0.5px solid ${hexRgba(col,0.40)}`,
      fontFamily:"'DM Mono', monospace", whiteSpace:'nowrap',
    }}>
      {verdict}
    </span>
  );
}

export function Panel({ title, accent = C.amber, badge, children, style = {} }) {
  return (
    <div style={{
      background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:10,
      overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)', ...style,
    }}>
      <div style={{
        padding:'8px 14px', borderBottom:`0.5px solid ${C.border}`, background:C.surface2,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:3, height:13, borderRadius:2, background:accent, flexShrink:0 }} />
          <span style={sans({ fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:C.text })}>
            {title}
          </span>
        </div>
        {badge != null && (
          typeof badge === 'string'
            ? <Badge>{badge}</Badge>
            : badge
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function StatStrip({ items }) {
  return (
    <div className="skip-stat-strip" style={{
      display:'grid',
      gridTemplateColumns:`repeat(${Math.min(items.length, 8)}, minmax(64px, 1fr))`,
      background:C.surface, border:`0.5px solid ${C.border}`, borderRadius:10,
      overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding:'11px 10px', textAlign:'center',
          borderRight: i < items.length - 1 ? `0.5px solid ${C.borderLight}` : 'none',
          display:'flex', flexDirection:'column', gap:3,
        }}>
          <div style={px({ fontSize:19, fontWeight:800, color:C.text, lineHeight:1, letterSpacing:'-.02em' })}>
            {it.val}
          </div>
          <div style={sans({ fontSize:10, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:it.color || C.text2 })}>
            {it.lbl}
          </div>
          {it.sub && (
            <div style={sans({ fontSize:10, color:C.text3 })}>{it.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export const KVRow = memo(function KVRow({ label, value, color, last = false }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'6px 14px',
      borderBottom: last ? 'none' : `0.5px solid ${C.borderLight}`,
    }}>
      <span style={sans({ fontSize:11, color:C.text2 })}>{label}</span>
      <span style={px({ fontSize:12, fontWeight:700, color: color || C.text })}>{value ?? '—'}</span>
    </div>
  );
});

// StarRating — OOTP-style star display (5 stars, fractional fill down to a
// half-star). Built with inline SVG rather than a font glyph so the partial
// fill is pixel-accurate instead of relying on a "half star" character that
// renders inconsistently across fonts.
const STAR_PATH = 'M12 2.5l2.85 6.34 6.9.63-5.22 4.63 1.56 6.8L12 17.3l-6.09 3.6 1.56-6.8L2.25 9.47l6.9-.63L12 2.5z';

export function StarRating({ stars = 0, size = 12, color = C.amber, track = C.border, label }) {
  const clipId = useId();
  const clamped = Math.max(0, Math.min(5, stars));
  return (
    <span
      style={{ display:'inline-flex', alignItems:'center', gap:1, flexShrink:0 }}
      role="img" aria-label={label ?? `${clamped} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const fillFrac = Math.max(0, Math.min(1, clamped - i));
        const uid = `${clipId}-${i}`;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink:0 }} aria-hidden="true">
            <path d={STAR_PATH} fill="none" stroke={track} strokeWidth="1.5" />
            {fillFrac > 0 && (
              <>
                <clipPath id={uid}><rect x="0" y="0" width={24 * fillFrac} height="24" /></clipPath>
                <path d={STAR_PATH} fill={color} clipPath={`url(#${uid})`} />
              </>
            )}
          </svg>
        );
      })}
    </span>
  );
}

// Maps a 20–80 scouting grade to a 0–5 star value in half-star steps
// (20 → 0★, 50/avg → 2.5★, 80 → 5★), matching the granularity scouts
// actually use when they talk about a grade rather than the raw number.
export function gradeToStars(val) {
  const g = Math.max(20, Math.min(80, val ?? 20));
  return Math.round(((g - 20) / 60) * 5 * 2) / 2;
}

export const GradeBar = memo(function GradeBar({ lbl, val, desc }) {
  const col = val >= 70 ? C.teal : val >= 60 ? C.amber : val >= 50 ? C.slate : C.rust;
  const stars = gradeToStars(val);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 14px' }}>
      <div style={sans({ fontSize:11, fontWeight:700, color:C.text, width:68, flexShrink:0 })}>{lbl}</div>
      <div style={sans({ fontSize:10, color:C.text3, flex:1 })}>{desc}</div>
      <StarRating stars={stars} size={12} color={col} label={`${lbl}: ${val} of 80, ${stars} of 5 stars`} />
      <div style={px({ fontSize:12, fontWeight:700, minWidth:26, textAlign:'right', color:col })}>{val}</div>
    </div>
  );
});

// ScoreRing — new: circular score indicator used in market/contract panels
export function ScoreRing({ score, size = 64, label = '' }) {
  const col = score >= 80 ? C.teal : score >= 65 ? C.amber : score >= 50 ? C.slate : C.rust;
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.surface3} strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
          style={{ transform:'rotate(90deg)', transformOrigin:`${size/2}px ${size/2}px` }}
          fontSize={size*0.28} fontWeight={800} fill={col} fontFamily="'DM Mono',monospace">
          {score}
        </text>
      </svg>
      {label && <div style={sans({ fontSize:9.5, color:C.text3, textAlign:'center' })}>{label}</div>}
    </div>
  );
}

/* ── Skeleton loaders ─────────────────────────────────────────────────
   Shimmer placeholders that approximate real content shape while data
   loads, instead of a spinner or plain "Loading…" text. Reuses the same
   `pulse` keyframe App.jsx already defines globally. */
export function SkeletonBlock({ width = '100%', height = 14, radius = 4, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius, background: C.surface3,
      animation: 'pulse 1.5s ease-in-out infinite', ...style,
    }} />
  );
}

export function SkeletonPlayerHero() {
  return (
    <div style={{ display:'flex', gap:16, padding:'16px 4px', alignItems:'center' }}>
      <SkeletonBlock width={72} height={72} radius={10} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
        <SkeletonBlock width="42%" height={20} />
        <SkeletonBlock width="26%" height={12} />
        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} width={54} height={28} radius={6} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonPanelGrid({ panels = 3, rows = 4 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${panels}, 1fr)`, gap:12, marginTop:12 }}>
      {Array.from({ length: panels }, (_, p) => (
        <div key={p} style={{ border:`0.5px solid ${C.border}`, borderRadius:8, padding:12, display:'flex', flexDirection:'column', gap:9 }}>
          <SkeletonBlock width="55%" height={10} style={{ marginBottom: 4 }} />
          {Array.from({ length: rows }, (_, r) => (
            <SkeletonBlock key={r} width={`${65 + ((r * 13) % 30)}%`} height={11} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 5, height = 32 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, padding:'10px 0' }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} height={height} radius={6} style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

// WatchStar — click-to-toggle star button for the watchlist. Plain Unicode
// star glyphs (★/☆), not an emoji — consistent with the star used elsewhere
// in the app (pinned scouting notes, Big Board bookmark indicator).
export function WatchStar({ watched, onToggle, size = 13, title }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title={title ?? (watched ? 'Remove from watchlist' : 'Add to watchlist')}
      aria-pressed={watched}
      style={{
        background:'transparent', border:'none', cursor:'pointer', padding:2,
        lineHeight:1, color: watched ? C.amber : C.text4, fontSize:size,
        display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      }}
    >
      {watched ? '★' : '☆'}
    </button>
  );
}
