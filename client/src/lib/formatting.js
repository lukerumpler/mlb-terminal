// Shared formatting helpers used across pages. Previously this exact logic
// was copy-pasted into PlayersPage.jsx (as `fmt`/`fmtDollar`), OtherPages.jsx
// (as `fmtStat`) and ProspectsPage.jsx (as `fmt3`/`fmtEra`) — centralized
// here so there's one place to fix or extend the formatting rules.

/** Format a decimal stat, stripping the leading 0 (".302" not "0.302"). */
export function fmt(v, d = 3) {
  if (v == null || v === '' || isNaN(+v)) return '—';
  const n = +v;
  if (n === 0 && d === 3) return '—';
  const s = n.toFixed(d);
  return s.startsWith('0.') ? s.slice(1) : s;
}

/** Format innings pitched (MLB uses .1/.2 for partial innings, not decimals). */
export function fmtIP(v) {
  return v ? String(v) : '—';
}

/** Format an ERA-style stat to 2 decimals (no leading-zero stripping). */
export function fmtEra(v) {
  return v != null ? (+v).toFixed(2) : '—';
}

/** Convert MLB's innings-pitched notation (.1 = one out, .2 = two outs — NOT
 *  tenths/hundredths of an inning) into true decimal innings for rate-stat
 *  math (K/9, BB/9, and similar). Display code should keep using the raw
 *  value/fmtIP; this is only for arithmetic, where treating "45.2" as
 *  45.667 instead of 45.2 changes a K/9 by a few tenths. */
export function trueIP(v) {
  if (v == null || v === '') return null;
  const n = +v;
  if (isNaN(n)) return null;
  const whole = Math.trunc(n);
  const outs = Math.round((n - whole) * 10); // .0/.1/.2 -> 0/1/2 outs
  return whole + outs / 3;
}

/** Format a dollar amount with K/M abbreviations, e.g. 1_500_000 -> "$1.5M". */
export function fmtDollar(v) {
  if (!v) return '—';
  const n = +v;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/** Clamp a scouting-grade value to the 20–80 scale. */
export function clamp8(v) {
  return Math.max(20, Math.min(80, v));
}

/** Clamp a percentile/score value to 20–99. */
export function clamp99(v) {
  return Math.max(20, Math.min(99, v || 0));
}

/** Format a 0–1 fraction as a percentage string, e.g. 0.802 -> "80.2%". */
export function fmtPercent(v, decimals = 1) {
  if (v == null) return '—';
  return `${(+v * 100).toFixed(decimals)}%`;
}

/** Convert a number to its ordinal form: 1 -> "1st", 2 -> "2nd", etc. */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
