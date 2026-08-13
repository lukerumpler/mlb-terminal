// SKIP — Decision Engine
// CAS, DQS, DPI, TPVI scoring + verdicts + archetypes
import { trueIP } from '../lib/formatting.js';

// Clamp a value to [20, 99] — all SKIP scores live on this range
function clamp(v) { return Math.max(20, Math.min(99, v || 0)); }

export function computeKPIs(stats, isPitcher) {
  if (!stats || Object.keys(stats).length === 0) {
    return { CAS:50, DQS:50, DPI:50, TPVI:50 };
  }

  if (isPitcher) {
    const era  = parseFloat(stats.era)  || 5;
    const k9   = parseFloat(stats.strikeoutsPer9Inn) || 5;
    const whip = parseFloat(stats.whip) || 1.5;
    const CAS  = clamp(Math.round(25 + k9 * 4));
    const DQS  = clamp(Math.round(90 - whip * 30));
    const DPI  = clamp(Math.round(80 - (era - 1.5) * 12));
    const TPVI = clamp(Math.round(CAS * 0.35 + DQS * 0.25 + DPI * 0.40));
    return { CAS, DQS, DPI, TPVI };
  }

  const ops = parseFloat(stats.ops) || 0;
  const avg = parseFloat(stats.avg) || 0;
  const bb  = parseInt(stats.baseOnBalls) || 0;
  const k   = parseInt(stats.strikeOuts)  || 0;
  const paRaw = parseInt(stats.plateAppearances);
  // Real MLB Stats API season-stat responses always include
  // plateAppearances, so this guard essentially never fires against real
  // data — but the old `|| 1` fallback was a landmine: if PA were ever
  // missing/malformed, bb/1 and k/1 would blow the BB%/K% terms up to
  // wildly wrong magnitudes instead of just not contributing. Found via a
  // synthetic test fixture that omitted the field for local QA — same fix
  // applied below in getStrengths/getRisks, where the fallout was a
  // visibly wrong percentage string in the UI ("9800.0% BB rate") rather
  // than just a skewed score here.
  const pa  = Number.isFinite(paRaw) && paRaw > 0 ? paRaw : null;
  const bbRate = pa ? bb / pa : 0;
  const kRate  = pa ? k  / pa : 0;
  const slg = parseFloat(stats.slg) || 0;

  const CAS  = clamp(Math.round(30 + avg * 200 + (ops - 0.5) * 30));
  const DQS  = clamp(Math.round(30 + bbRate * 300 - kRate * 150));
  const DPI  = clamp(Math.round(20 + (slg - 0.3) * 200));
  const TPVI = clamp(Math.round(CAS * 0.30 + DQS * 0.25 + DPI * 0.30 + (ops - 0.5) * 50 * 0.15));
  return { CAS, DQS, DPI, TPVI };
}

export function decisionScore(kpis) {
  return clamp(Math.round(kpis.TPVI * 0.35 + kpis.CAS * 0.25 + kpis.DPI * 0.20 + kpis.DQS * 0.20));
}

export function verdict(score) {
  if (score >= 88) return 'PRIORITY ACQ';
  if (score >= 78) return 'STRONG BUY';
  if (score >= 65) return 'MONITOR';
  if (score >= 50) return 'HOLD';
  return 'AVOID';
}

export function verdictColor(score, C) {
  if (score >= 78) return C.teal;
  if (score >= 65) return C.amber;
  if (score >= 50) return C.slate;
  return C.rust;
}

export function archetype(kpis, isPitcher) {
  if (isPitcher) {
    return kpis.CAS >= 70 ? 'Ace / #1 Starter' : kpis.CAS >= 55 ? 'Mid-Rotation Starter' : 'Backend / Reliever';
  }
  if (kpis.TPVI >= 80) return 'Elite Offensive Force';
  if (kpis.TPVI >= 70) return 'Above-Avg Producer';
  if (kpis.DQS >= 65)  return 'Patient On-Base Machine';
  if (kpis.DPI >= 65)  return 'Raw Power Threat';
  return 'Solid Regular';
}

export function getStrengths(stats, kpis, isPitcher) {
  const out = [];
  if (isPitcher) {
    const k9   = parseFloat(stats.strikeoutsPer9Inn) || 0;
    const whip = parseFloat(stats.whip) || 0;
    const era  = parseFloat(stats.era)  || 0;
    if (k9   >= 10)               out.push(`Elite ${k9.toFixed(1)} K/9 — swing-and-miss stuff at top tier`);
    if (whip  > 0 && whip <= 1.1) out.push(`${whip.toFixed(3)} WHIP — elite command and contact suppression`);
    if (era   > 0 && era  <= 3.0) out.push(`${era.toFixed(2)} ERA — elite run prevention, ace-caliber`);
  } else {
    const ops = parseFloat(stats.ops) || 0;
    const avg = parseFloat(stats.avg) || 0;
    const bb  = parseInt(stats.baseOnBalls) || 0;
    const paRaw = parseInt(stats.plateAppearances);
    const pa  = Number.isFinite(paRaw) && paRaw > 0 ? paRaw : null; // see computeKPIs' comment on this same guard
    const hr  = parseInt(stats.homeRuns) || 0;
    const sb  = parseInt(stats.stolenBases) || 0;
    if (ops   >= 0.900) out.push(`${(+stats.ops).toFixed(3)} OPS — elite offensive production`);
    if (avg   >= 0.300) out.push(`Batting .${Math.round(avg*1000)} — plus hit tool, above league avg`);
    if (pa && bb / pa >= 0.12) out.push(`${((bb / pa) * 100).toFixed(1)}% BB rate — elite plate discipline`);
    if (hr    >= 25)    out.push(`${hr} HR — genuine power threat in the lineup`);
    if (sb    >= 20)    out.push(`${sb} SB — elite speed and baserunning impact`);
  }
  return out.slice(0, 3);
}

export function getRisks(stats, profile, isPitcher) {
  const out = [];
  const age = profile?.currentAge || 0;
  if (age >= 35) out.push(`Age ${age} — aging curve risk warrants monitoring`);
  if (isPitcher) {
    const era  = parseFloat(stats.era)  || 0;
    const whip = parseFloat(stats.whip) || 0;
    const gs   = parseInt(stats.gamesStarted) || 0;
    const g    = parseInt(stats.gamesPlayed)  || 0;
    const isStarter = gs > 0 && (g === 0 || gs / g >= 0.5);
    if (era  >  4.5) out.push(`ERA of ${era.toFixed(2)} — elevated, run prevention concern`);
    if (whip > 1.4)  out.push(`WHIP ${whip.toFixed(3)} — baserunner rate needs improvement`);
    if (isStarter)   out.push('Health and workload management risk inherent to all SP');
    else             out.push('Reliever role: usage patterns and arm health require monitoring');
  } else {
    const k   = parseInt(stats.strikeOuts) || 0;
    const paRaw = parseInt(stats.plateAppearances);
    const pa  = Number.isFinite(paRaw) && paRaw > 0 ? paRaw : null; // see computeKPIs' comment on this same guard
    const ops = parseFloat(stats.ops) || 0;
    if (pa && k / pa > 0.27) out.push(`${((k / pa) * 100).toFixed(1)}% K rate — two-strike vulnerability`);
    if (ops < 0.700)   out.push(`${(+stats.ops).toFixed(3)} OPS — below-average offensive output`);
    if (out.length === 0) out.push('No material risk flags at current performance level');
  }
  return out.slice(0, 3);
}

export function getRecommendation(score) {
  if (score >= 88) return 'Aggressive acquisition target — act before market adjusts. Priority asset.';
  if (score >= 78) return 'High-priority target at right price. Strong upside warrants immediate action.';
  if (score >= 65) return 'Monitor closely. Solid contributor — acquire if price reflects current output.';
  if (score >= 50) return 'Hold or watch. Acceptable contributor with limitations at current level.';
  return 'Avoid or sell if held. Unfavorable risk/reward at any reasonable acquisition cost.';
}


// ─── Average Miss Distance (AMD) ─────────────────────────────────────────
// Swing-precision metric derived from Baseball Savant bat-tracking data.
// Spec: Average_Miss_Distance_Metric_Design.md
//
// Savant bat-tracking fields used (verified against a live Savant CSV pull —
// column names below are exactly what the endpoint returns):
//   squared_up_per_swing  – fraction of swings making ideal contact (0–1)
//   blast_per_swing       – hard squared-up contact fraction (0–1)
//   swords / swings_competitive – swords is a raw count, not a rate; the
//                            per-swing fraction is derived from the two
//   avg_bat_speed         – bat speed mph (used to weight timing precision)
//
// We derive three error components from these proxies:
//   timingError   ← swords / swings_competitive (misses = pure timing/reaction failure)
//   contactError  ← 1 - squared_up_per_swing (off-center contact)
//   verticalError ← 1 - blast_per_swing (vertical barrel miss)
//
// Weighted AMD per spec: sqrt((t×.50)² + (c×.30)² + (v×.20)²)
// Scaled to AMD+ = (player / leagueAvg) × 100; lower = better for hitters.
// IMD+ inverts: higher = better for pitchers (inducing larger miss distance).
//
// League-average calibration (2024 Savant population medians):
//   squared_up_per_swing ≈ 0.315, blast_per_swing ≈ 0.062, swords rate ≈ 0.082
//   → raw AMD_avg ≈ 0.445

const AMD_LEAGUE_AVG = 0.281;  // corrected: sqrt((0.082×.5)²+(0.685×.3)²+(0.938×.2)²)

export function computeAMD(batTracking) {
  if (!batTracking) return null;

  // Empty CSV cells are not zeroes. The model needs the two rate fields and
  // the competitive-swing denominator; otherwise it would manufacture a
  // large miss-distance score from whichever columns happened to be present.
  const squared = Number.parseFloat(batTracking.squared_up_per_swing);
  const blasts  = Number.parseFloat(batTracking.blast_per_swing);
  const swingsCompetitive = Number.parseFloat(batTracking.swings_competitive);
  const swordsRaw = Number.parseFloat(batTracking.swords);
  if (![squared, blasts, swingsCompetitive, swordsRaw].every(Number.isFinite)
      || swingsCompetitive <= 0
      || squared < 0 || squared > 1
      || blasts < 0 || blasts > 1
      || swordsRaw < 0) return null;
  const swords  = swordsRaw / swingsCompetitive;

  // Do not allow an impossible swords rate to distort the model.
  if (!Number.isFinite(swords)) return null;

  const timingError  = Math.min(1, swords);               // 0 = perfect timing
  const contactError = Math.min(1, Math.max(0, 1 - squared)); // 0 = perfect contact
  const verticalError= Math.min(1, Math.max(0, 1 - blasts));  // 0 = perfect barrel height

  const rawAMD = Math.sqrt(
    Math.pow(timingError  * 0.50, 2) +
    Math.pow(contactError * 0.30, 2) +
    Math.pow(verticalError* 0.20, 2)
  );

  const amdPlus = Math.round((rawAMD / AMD_LEAGUE_AVG) * 100);
  // rawAMD can legitimately be exactly 0 for a small-sample player with
  // perfect contact/timing/barrel metrics — guard against producing
  // Infinity for imdPlus in that case.
  const imdPlus = rawAMD > 0 ? Math.round((AMD_LEAGUE_AVG / rawAMD) * 100) : 200;

  // Hitter percentile: lower AMD+ = better = higher percentile
  // Pitcher percentile: higher IMD+ = better = higher percentile
  // Both scaled so 100 (league avg) → 50th pct, linearly out from there
  const hitterPct  = Math.round(Math.max(1, Math.min(99, 100 - (amdPlus - 50))));
  const pitcherPct = Math.round(Math.max(1, Math.min(99, imdPlus - 50)));

  return {
    rawAMD:        +rawAMD.toFixed(3),
    amdPlus,
    imdPlus,
    hitterPct,
    pitcherPct,
    timingError:   +timingError.toFixed(3),
    contactError:  +contactError.toFixed(3),
    verticalError: +verticalError.toFixed(3),
    batSpeed:      parseFloat(batTracking.avg_bat_speed) || null,
  };
}

// ─── eFV — SKIP's Outcome-Informed Future Value Grade ──────────────────────
// The traditional 20-80 scouting scale snaps every player to the nearest 5
// (45, 50, 55...). That's fine for a single scout's verbal shorthand, but it
// throws away information once you're ranking 100 players — dozens end up
// tied at the same number with no way to tell them apart. eFV keeps a
// prospect's ranked position but lets the grade itself be a precise integer,
// so two players a few ranks apart don't get artificially flattened to the
// same score. It's computed from three inputs, recalculated live whenever
// underlying stats change:
//
//   1. Board position — the prospect's rank in SKIP's combined Top-100
//      (batters and pitchers share one list). This is the dominant signal:
//      a smooth curve from 70 at #1 down to ~43 at #100, matching the real
//      shape of published Top-100 lists (70-grade prospects are exceedingly
//      rare; the bottom of most boards clusters in the low 40s).
//   2. Level-relative performance — how far a prospect's current OPS
//      (hitters) or ERA/K-rate (pitchers) sits from the median of SKIP's
//      tracked pool at the same stage. This is what lets a rank-40 prospect
//      on a heater nose ahead of a rank-30 prospect in a slump — the delta
//      is intentionally small so a week of stats can't override the
//      underlying scouting-consensus rank.
//   3. Age-for-level — a player performing young for their level gets a
//      small bump (more runway before their theoretical peak); an old-for-
//      level player is discounted slightly (less projection remaining).
//
// Output is clamped to [35, 70] and rounded to a whole number. SKIP doesn't
// hand out 20-30 or 75-80 grades on a ranked farm list — those live at the
// tails of the full prospect universe, not the tracked Top 100.
function median(values) {
  const clean = values.filter(v => v != null && !Number.isNaN(v));
  if (!clean.length) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Typical age SKIP expects a prospect to be at each level, and roughly how
// many development years remain before that level projects to the majors.
// Levels are recorded as compound strings when a player repeated/split time
// (e.g. 'A+/AA') — those use a blended baseline between the two levels.
const LEVEL_INFO = {
  ROK:        { etaYears: 3, ageBaseline: 19.0, proximity: 1.00 },
  A:          { etaYears: 3, ageBaseline: 20.0, proximity: 0.85 },
  'A/A+':     { etaYears: 2, ageBaseline: 20.3, proximity: 0.75 },
  'A+':       { etaYears: 2, ageBaseline: 20.6, proximity: 0.65 },
  'A/AA':     { etaYears: 2, ageBaseline: 20.8, proximity: 0.60 },
  'A/A+/AA':  { etaYears: 2, ageBaseline: 21.0, proximity: 0.55 },
  'A+/AA':    { etaYears: 1, ageBaseline: 21.2, proximity: 0.50 },
  AA:         { etaYears: 1, ageBaseline: 21.7, proximity: 0.40 },
  'AA/AAA':   { etaYears: 1, ageBaseline: 22.2, proximity: 0.28 },
  AAA:        { etaYears: 0, ageBaseline: 22.8, proximity: 0.15 },
  MLB:        { etaYears: 0, ageBaseline: 24.0, proximity: 0.00 },
};
function levelInfo(level) { return LEVEL_INFO[level] || LEVEL_INFO.AA; }

// Batters and pitchers are ranked on one shared Top-100 board (a batter's
// `rank` and a pitcher's `rank` are positions in the same combined list,
// not two separate 1-N sequences) — so the board-position curve always
// normalizes against this fixed size, never against the pool's own length.
// The pool is still used below (via fvBaselines) for the level-relative
// performance median, where it's correctly scoped to same-type peers.
const COMBINED_BOARD_SIZE = 100;

function clampRange(lo, hi, v) { return Math.max(lo, Math.min(hi, v)); }

// Pool-level baseline stats for the performance nudge below, factored out
// so a Top-100 board only sorts each stat once (O(n log n)) instead of once
// per prospect (O(n^2 log n)) — computeFV() used to call median() on the
// full pool from inside the per-prospect .map(), which is fine at n=100 but
// is needless repeated work for something that doesn't change per-call.
export function fvBaselines(pool, isPitcher) {
  if (isPitcher) {
    const medEra = median((pool || []).map(p => p.era)) ?? 4.0;
    const medK9  = median((pool || []).map(p => {
      const ip = trueIP(p.ip);
      return ip ? (p.so / ip) * 9 : null;
    })) ?? 9;
    return { medEra, medK9 };
  }
  const medOps = median((pool || []).map(p => p.ops)) ?? 0.80;
  return { medOps };
}

export function computeFV(prospect, baselines, isPitcher) {
  if (!prospect) return null;
  const rank = prospect.rank || COMBINED_BOARD_SIZE;

  // 1. Board-position curve — steep near the top, flattens toward the tail.
  const t = Math.max(0, Math.min(1, (rank - 1) / (COMBINED_BOARD_SIZE - 1)));
  const base = 70 - 27 * Math.pow(t, 0.72);

  // 2. Level-relative performance nudge.
  let perfAdj = 0;
  if (isPitcher) {
    const { medEra, medK9 } = baselines;
    if (prospect.era != null) {
      perfAdj += clampRange(-2.5, 2.5, (medEra - prospect.era) * 1.4);
    }
    // IP is recorded in MLB's .1/.2-for-partial-innings notation (thirds,
    // not tenths) — trueIP() converts before any rate-stat math.
    const ip = trueIP(prospect.ip);
    const k9 = ip ? (prospect.so / ip) * 9 : medK9;
    perfAdj += clampRange(-1.5, 1.5, (k9 - medK9) * 0.25);
  } else {
    const { medOps } = baselines;
    if (prospect.ops != null) {
      perfAdj += clampRange(-3, 3, (prospect.ops - medOps) * 12);
    }
  }

  // 3. Age-for-level nudge (positive age gap = young for level = small bump).
  const info = levelInfo(prospect.level);
  const ageGap = info.ageBaseline - (prospect.age ?? info.ageBaseline);
  const ageAdj = clampRange(-1.5, 1.5, ageGap * 0.8);

  return clampRange(35, 70, Math.round(base + perfAdj + ageAdj));
}

// Rough 5-year WAR projection implied by an eFV grade, interpolated between
// anchor points. These anchors aren't fit to any external model — they're
// SKIP's own stated assumptions about what each grade tier has historically
// meant in outcome terms, kept here as a single editable table rather than
// scattered through the UI.
const FV_WAR_ANCHORS = [[35, 0.3], [40, 1.0], [45, 2.5], [50, 4.5], [55, 7.0], [60, 10.0], [65, 12.5], [70, 15.0]];
export function projectedWAR(fv) {
  if (fv == null) return null;
  const pts = FV_WAR_ANCHORS;
  if (fv <= pts[0][0]) return pts[0][1];
  if (fv >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [fv0, w0] = pts[i], [fv1, w1] = pts[i + 1];
    if (fv >= fv0 && fv <= fv1) {
      const frac = (fv - fv0) / (fv1 - fv0);
      return Math.round((w0 + frac * (w1 - w0)) * 10) / 10;
    }
  }
  return pts[pts.length - 1][1];
}

// Risk band — driven by how far a prospect still has to climb (level
// proximity to the majors) and whether their age is a meaningful outlier
// for that level in either direction. A player performing young for their
// level is the textbook definition of unproven-against-better-competition
// risk; a player old for their level trades some risk for a lower ceiling.
export function fvRiskBand(prospect) {
  if (!prospect) return 'Medium';
  const info = levelInfo(prospect.level);
  const ageGap = (prospect.age ?? info.ageBaseline) - info.ageBaseline; // + = old for level
  const youngPenalty = ageGap < 0 ? Math.min(1, -ageGap * 0.35) : 0;
  const oldRelief = ageGap > 0 ? Math.min(0.3, ageGap * 0.12) : 0;
  const score = Math.max(0, info.proximity + youngPenalty - oldRelief);
  if (score >= 0.55) return 'High';
  if (score >= 0.30) return 'Medium';
  return 'Low';
}

// Approximate promotion-to-majors year, purely a function of current level.
// SEASON is passed in rather than imported to keep this module free of a
// dependency on constants/data.js.
export function fvETA(prospect, season) {
  if (!prospect) return '—';
  if (prospect.level === 'MLB') return 'MLB';
  return String(season + levelInfo(prospect.level).etaYears);
}

// Numeric companion to fvETA() for column sorting (Roadmap #6) — fvETA
// returns a display string ('MLB' | '2027'), which sorts lexicographically
// wrong ('MLB' lands after all numeric years since 'M' > '2' in ASCII, even
// though an MLB player's ETA is "now", not "later"). This returns 0 for
// MLB (sorts first — already arrived) and the numeric projected year
// otherwise, so ascending sort reads as "soonest ETA first".
export function fvETAYear(prospect, season) {
  if (!prospect) return 9999;
  if (prospect.level === 'MLB') return 0;
  return season + levelInfo(prospect.level).etaYears;
}
