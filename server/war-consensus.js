// Wisdom-of-the-crowd team WAR.
//
// Each provider (FanGraphs fWAR, Baseball-Reference bWAR, and any later source)
// is one independent estimate of the same quantity. The headline is their mean,
// and the spread between them says how far to trust it: when estimates cluster,
// the average is solid; when they diverge, the number is approximate and the UI
// should say so instead of presenting false precision.
//
// This file is mirrored byte-for-byte in client/src/lib/warConsensus.js and a
// parity test keeps the two in sync. Add providers by passing more `sources`;
// nothing here is specific to two providers.

/** Spread (max - min, in WAR) that counts as agreement. Heuristic, not provider-published. */
export const AGREEMENT_THRESHOLDS = Object.freeze({
  highWithin: 3,
  moderateWithin: 6,
});

function finiteOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round1(value) {
  const rounded = Number(value.toFixed(1));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Summarise one quantity across providers.
 * @param {Array<{provider: string, value: unknown}>} entries
 * @returns {null | {value:number, median:number, min:number, max:number, spread:number, n:number, providers:string[], sources:Array<{provider:string,value:number}>}}
 */
export function summarizeWarValues(entries) {
  const sources = (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      provider: String(entry?.provider || "Unknown"),
      value: finiteOrNull(entry?.value),
    }))
    .filter(entry => entry.value != null);
  if (!sources.length) return null;
  const values = sources.map(entry => entry.value).sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const middle = Math.floor(n / 2);
  const median =
    n % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const min = values[0];
  const max = values[n - 1];
  return {
    // A lone source is passed through untouched; rounding only applies to a blend.
    value: n === 1 ? values[0] : round1(mean),
    median: n === 1 ? values[0] : round1(median),
    min,
    max,
    spread: round1(max - min),
    n,
    providers: sources.map(entry => entry.provider),
    sources,
  };
}

/** @returns {"unavailable"|"single-source"|"high"|"moderate"|"low"} */
export function classifyAgreement(summary, thresholds = AGREEMENT_THRESHOLDS) {
  if (!summary) return "unavailable";
  if (summary.n < 2) return "single-source";
  if (summary.spread <= thresholds.highWithin) return "high";
  if (summary.spread <= thresholds.moderateWithin) return "moderate";
  return "low";
}

/**
 * Build the consensus for a team from any number of provider rows.
 * Defensive WAR needs at least two providers to count as a blend, matching the
 * existing rule that it is only shown when comparable values exist on both sides.
 * @param {Array<{provider:string,total?:unknown,batting?:unknown,pitching?:unknown,defensive?:unknown}>} sources
 */
export function buildWarConsensus(
  sources,
  { thresholds = AGREEMENT_THRESHOLDS } = {}
) {
  const rows = (Array.isArray(sources) ? sources : []).filter(Boolean);
  const pick = key =>
    summarizeWarValues(
      rows.map(row => ({ provider: row.provider, value: row[key] }))
    );
  const total = pick("total");
  const defensive = pick("defensive");
  return {
    total,
    batting: pick("batting"),
    pitching: pick("pitching"),
    defensive: defensive && defensive.n >= 2 ? defensive : null,
    agreement: classifyAgreement(total, thresholds),
    providerCount: total ? total.n : 0,
  };
}

/** Human label for the agreement grade, e.g. "Sources agree (spread 2.2 WAR)". */
export function describeAgreement(consensus) {
  const spread = consensus?.total?.spread;
  switch (consensus?.agreement) {
    case "high":
      return `Sources agree (spread ${spread.toFixed(1)} WAR)`;
    case "moderate":
      return `Sources differ (spread ${spread.toFixed(1)} WAR)`;
    case "low":
      return `Sources diverge (spread ${spread.toFixed(1)} WAR); treat as approximate`;
    case "single-source":
      return "Single source; no cross-check available";
    default:
      return "Unavailable";
  }
}
