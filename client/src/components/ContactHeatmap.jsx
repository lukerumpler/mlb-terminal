import React, { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip,
} from 'recharts';
import { C, sans, WARM_TOOLTIP } from '../constants/colors.js';
import { Panel } from './atoms.jsx';

const TT = { ...WARM_TOOLTIP, wrapperStyle: { zIndex: 9999 } };

function normalizeRow(row) {
  const x = row.intercept_ball_minus_batter_pos_x_inches;
  const y = row.intercept_ball_minus_batter_pos_y_inches;
  if (x == null || y == null) return null;
  const xn = Number(x), yn = Number(y);
  if (!Number.isFinite(xn) || !Number.isFinite(yn)) return null;
  return { x: xn, y: yn, stand: row.stand || null };
}

// Fixed axis bounds rather than auto-scaling per player. These are
// physically meaningful units (inches from the batter's own center of
// mass), roughly comparable across hitters, so a shared scale is what
// makes the shape of one player's cloud actually mean something next to
// another's — auto-scaling would make small clusters look artificially
// dramatic and make cross-player comparison meaningless. Bounds are sized
// generously around real published reference points (per MLB.com's
// Statcast glossary: league-average contact is ~30in in front of center
// of mass, 82% of home runs land between 25-45in), not derived from this
// app's own data.
const X_DOMAIN = [-30, 30];
const Y_DOMAIN = [-15, 55];

function CloudPanel({ title, points }) {
  if (!points.length) {
    return (
      <div>
        <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.text3, marginBottom:4 })}>
          {title}
        </div>
        <div style={sans({ fontSize:10, color:C.text4, padding:'12px 0' })}>No swings recorded.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={sans({ fontSize:9.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:C.text3, marginBottom:4 })}>
        {title}{' '}
        <span style={{ color:C.text4, fontWeight:500, textTransform:'none', letterSpacing:0 }}>· {points.length} swings</span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <ScatterChart margin={{ top:8, right:12, bottom:22, left:4 }}>
          <CartesianGrid stroke={C.borderLight} strokeDasharray="2 3" />
          <XAxis type="number" dataKey="x" domain={X_DOMAIN} tick={{ fontSize:8.5, fill:C.text4 }} stroke={C.border}
            label={{ value:'Horizontal from body (in)', position:'insideBottom', offset:-8, fontSize:8.5, fill:C.text3 }} />
          <YAxis type="number" dataKey="y" domain={Y_DOMAIN} tick={{ fontSize:8.5, fill:C.text4 }} stroke={C.border}
            label={{ value:'Depth from body (in)', angle:-90, position:'insideLeft', fontSize:8.5, fill:C.text3, style:{ textAnchor:'middle' } }} />
          <ReferenceLine x={0} stroke={C.border} />
          <ReferenceLine y={0} stroke={C.border} />
          <Tooltip {...TT} formatter={(v, n) => [`${Number(v).toFixed(1)} in`, n === 'x' ? 'Horizontal offset' : 'Depth offset']} />
          {/* Low fillOpacity is the density signal here — dots over dots
              read darker where swings cluster. It's an honest stand-in for
              a real KDE heatmap, not a claim of being one; recharts has no
              built-in 2D density surface, and computing one client-side
              well enough to trust wasn't worth the complexity for a single
              panel. Said explicitly in the caption below, not just here. */}
          <Scatter data={points} isAnimationActive={false} fill={C.teal} fillOpacity={0.16} r={4} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Contact Point panel (Roadmap #3) ────────────────────────────────
   Sourced from api/savant.js's `contact_points` endpoint — real per-swing
   Statcast Search data (`intercept_ball_minus_batter_pos_x_inches` /
   `..._y_inches`), not the seeded-pseudo-random `PlateDisciplineZone`
   placeholder that sits elsewhere on this same page (a different metric —
   wOBA per strike-zone cell — honestly labeled "Illustrative" rather than
   replaced, since it isn't answering the same question this panel does).

   CLOSED OUT 2026-08-09. A prior session (2026-08-08) checked pybaseball's
   statcast_batter() source directly, found no mention of "intercept"
   anywhere in it, and correctly hedged this panel's badge to "unverified
   fields" rather than assume the original claim was fine — the right call
   given what it had checked, even though pybaseball turned out to be the
   wrong primary source to check (it doesn't hardcode column names at all).
   Escalated twice since: first to R's `baseballr` package, which does
   hardcode these two fields positionally with matching documentation, then
   to the actual canonical source both of those were standing in for —
   MLB's own official field reference at baseballsavant.mlb.com/csv-docs,
   fetched live. Both fields are listed there by name with matching
   descriptions, as the final two entries on the page. Three independent
   things now agree (the official docs, baseballr's source, and the query-
   URL match), so the badge/caption below are back to confident language.
   See api/savant.js's `contact_points` comment for the full citation.

   Also supersedes `ContactPointPanel.jsx`, an earlier real (not seeded)
   version of this same panel built off `batting_stance`, a season-average
   leaderboard rather than per-swing data — that component's own header
   comment explicitly flagged "This is deliberately NOT the dense heatmap
   the reference card shows... needs raw per-swing contact locations,"
   naming the exact gap this version closes. That was honest, correct,
   real work for what was verifiable at the time, not a mistake to erase
   quietly — see the Roadmap doc's progress log for the full handoff.

   Splits into Bats Right / Bats Left automatically from the data itself
   (whichever `stand` values actually appear in this player's rows) rather
   than trusting a separate "switch hitter" flag from the player profile —
   a standard-handed hitter will only ever show one side's dots.
------------------------------------------------------------------------ */
export default function ContactHeatmap({ contactPoints }) {
  const { rightRows, leftRows, isSwitch } = useMemo(() => {
    const rows  = (Array.isArray(contactPoints) ? contactPoints : []).map(normalizeRow).filter(Boolean);
    const right = rows.filter(r => r.stand === 'R');
    const left  = rows.filter(r => r.stand === 'L');
    return { rightRows: right, leftRows: left, isSwitch: right.length > 0 && left.length > 0 };
  }, [contactPoints]);

  const total = rightRows.length + leftRows.length;

  if (!total) {
    return (
      <Panel title="Contact Point" accent={C.purple}>
        <div style={{ padding:'8px 14px 10px' }}>
          <div style={sans({ fontSize:10.5, color:C.text3, padding:'6px 0' })}>
            No Statcast intercept-point data available for this player/season yet.
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Contact Point" accent={C.purple} badge={`${total} swing${total === 1 ? '' : 's'} · Live Savant`}>
      <div style={{ padding:'10px 14px 12px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns: isSwitch ? '1fr 1fr' : '1fr', gap:16 }}>
          {isSwitch ? (
            <>
              <CloudPanel title="Bats Right" points={rightRows} />
              <CloudPanel title="Bats Left" points={leftRows} />
            </>
          ) : (
            <CloudPanel title={rightRows.length ? 'Bats Right' : 'Bats Left'} points={rightRows.length ? rightRows : leftRows} />
          )}
        </div>
        <div style={sans({ fontSize:9, color:C.text4, lineHeight:1.4 })}>
          Each dot is one competitive swing's bat/ball intercept point, plotted relative to the batter&rsquo;s own center of mass —
          not home plate — per Statcast&rsquo;s definition. Overlapping, lower-opacity dots approximate where contact clusters;
          this is real per-swing data, not a smoothed density model.
        </div>
      </div>
    </Panel>
  );
}
