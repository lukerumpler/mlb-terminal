function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

export const CACHE_POLICY = Object.freeze({
  teamEfficiencyFreshMs: positiveInteger(process.env.TEAM_EFFICIENCY_FRESH_SECONDS, 300) * 1000,
  teamEfficiencyStaleMs: positiveInteger(process.env.TEAM_EFFICIENCY_STALE_SECONDS, 86400) * 1000,
  teamFinancialFreshMs: positiveInteger(process.env.TEAM_FINANCIALS_FRESH_SECONDS, 1800) * 1000,
  teamFinancialStaleMs: positiveInteger(process.env.TEAM_FINANCIALS_STALE_SECONDS, 21600) * 1000,
});

export function cachePolicySummary() {
  return Object.fromEntries(Object.entries(CACHE_POLICY).map(([key, value]) => [key, { milliseconds: value, seconds: Math.round(value / 1000) }]));
}
