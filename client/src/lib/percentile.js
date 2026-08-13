// src/lib/percentile.js
//
// Shared percentile-rank math + color scale. `percentile()` originally
// lived only inside ProspectCard.jsx; centralized here so the Players tab's
// MLB-population percentiles, the Prospects pool percentiles, and radar/
// percentile cards all share one implementation instead of drifting.

import { C } from '../constants/colors.js';

/**
 * Rank `value` against `allValues` and return a 0-100 percentile.
 * higherIsBetter=false flips the ranking for stats like ERA/WHIP/Chase%
 * where a lower raw number is the better outcome.
 *
 * Returns null (not 0) when there isn't enough data to rank against, so
 * callers can distinguish "genuinely worst in the pool" from "no data" —
 * ProspectCard's local copy of this defaulted to 50, which quietly drew a
 * half-full bar for missing data instead of an honest blank state.
 */
export function percentile(value, allValues, higherIsBetter = true) {
  const valid = allValues.filter(v => v != null && !Number.isNaN(v));
  if (!valid.length || value == null || Number.isNaN(value)) return null;
  const below = valid.filter(v => (higherIsBetter ? v < value : v > value)).length;
  return Math.round((below / valid.length) * 100);
}

// SKIP's existing rust -> amber -> teal scale (the same three stops
// PlateDisciplineZone already uses for "cold/neutral/hot"), rather than
// importing Savant's own literal red/blue convention wholesale.
export function percentileColor(pct) {
  if (pct == null) return C.text3;
  if (pct >= 80) return C.teal;
  if (pct >= 60) return C.tealMid;
  if (pct >= 40) return C.amber;
  if (pct >= 20) return C.rustMid;
  return C.rust;
}

// Continuous color-by-value scale for scatter plots (ScatterBuilder's
// "color by stat" mode) — same three stops, but interpolated smoothly
// across the full min-max range of the chosen stat rather than bucketed,
// since a scatter's whole point is showing gradient, not tiers.
const STOP_HEX = { rust: '#c1502e', amber: '#d6922b', teal: '#2f8f7a' };
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
export function continuousColor(norm /* 0-1 */) {
  const t = Math.max(0, Math.min(1, norm));
  const [a, b] = t < 0.5
    ? [hexToRgb(STOP_HEX.rust),  hexToRgb(STOP_HEX.amber)]
    : [hexToRgb(STOP_HEX.amber), hexToRgb(STOP_HEX.teal)];
  const localT = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [r, g, bl] = [0, 1, 2].map(i => lerp(a[i], b[i], localT));
  return `rgb(${r},${g},${bl})`;
}
