import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { nextUtcMidnightMs, utcDayKey } from "./daily-provider-policy.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const cache = new Map();
const inFlight = new Map();
const DAILY_STALE_MS = 7 * 24 * 60 * 60_000;

export function __resetIntelligenceCalculationStateForTests() {
  cache.clear();
  inFlight.clear();
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function findTeamStanding(payload, teamId) {
  for (const grouping of payload?.records || []) {
    for (const row of grouping.teamRecords || []) {
      if (Number(row.team?.id) === Number(teamId)) return row;
    }
  }
  return null;
}

function calculateFromStanding(standing, season) {
  if (!standing) return null;
  const wins = numeric(standing.wins ?? standing.w);
  const losses = numeric(standing.losses ?? standing.l);
  if (wins == null || losses == null || wins + losses <= 0) return null;

  const gamesPlayed = wins + losses;
  const winPct = wins / gamesPlayed;
  const seasonLength = 162;
  const projectedWins = winPct * seasonLength;
  const projectedLosses = seasonLength - projectedWins;
  const runsScored = numeric(standing.runsScored ?? standing.runs);
  const runsAllowed = numeric(standing.runsAllowed ?? standing.runsAgainst);
  const pythagoreanExponent = 1.83;
  const pythagoreanWinPct = runsScored != null && runsAllowed != null && runsScored + runsAllowed > 0
    ? (runsScored ** pythagoreanExponent) / ((runsScored ** pythagoreanExponent) + (runsAllowed ** pythagoreanExponent))
    : null;
  const pythagoreanProjectedWins = pythagoreanWinPct == null ? null : pythagoreanWinPct * seasonLength;
  // This is deliberately a transparent deterministic proxy, not an official
  // playoff model. It turns current 162-game win pace into a bounded chance
  // centered on an 88-win benchmark, which is easier to audit than a hidden
  // simulation and is only shown when FanGraphs odds are unavailable.
  const calculatedPlayoffOdds = Math.max(1, Math.min(99,
    100 / (1 + Math.exp(-(projectedWins - 88) / 3.5))
  ));
  // Pythagorean expected wins above a fixed 48-win replacement baseline.
  // This is a team wins-above-replacement proxy, not FanGraphs player WAR.
  const calculatedWarProxy = pythagoreanProjectedWins == null
    ? null
    : Math.max(0, pythagoreanProjectedWins - 48);

  return {
    season: Number(season),
    teamId: Number(standing.team?.id),
    teamName: standing.team?.name || null,
    source: "MLB Stats API",
    provenance: "calculated-from-verified-standings",
    freshness: "calculated",
    methodology: {
      projectedWins: "current verified win percentage multiplied by a 162-game season",
      projectedLosses: "162 minus calculated projected wins",
      pythagoreanWinPct: pythagoreanWinPct == null ? null : "runs scored and runs allowed with exponent 1.83",
      calculatedPlayoffOdds: "deterministic logistic transform of verified 162-game win pace, centered at 88 wins with a 3.5-win scale; a calculated proxy, not official or FanGraphs odds",
      calculatedWarProxy: calculatedWarProxy == null ? null : "pythagorean expected 162-game wins minus a 48-win replacement baseline; a team wins-above-replacement proxy, not FanGraphs WAR",
    },
    metrics: {
      wins,
      losses,
      gamesPlayed,
      winPct,
      projectedWins,
      projectedLosses,
      runsScored,
      runsAllowed,
      runDifferential: runsScored != null && runsAllowed != null ? runsScored - runsAllowed : null,
      pythagoreanWinPct,
      pythagoreanProjectedWins,
      calculatedPlayoffOdds,
      calculatedWarProxy,
    },
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SKIPBaseball/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`MLB Stats API responded with ${response.status}`);
  return response.json();
}

async function loadCalculation(teamId, season) {
  const key = `${teamId}:${season}`;
  const now = Date.now();
  const day = utcDayKey(now);
  const cached = cache.get(key);
  if (cached?.day === day) return { data: cached.data, cache: "DAILY" };
  const existing = inFlight.get(key);
  if (existing) return { data: await existing, cache: "COALESCED" };

  const request = (async () => {
    const standings = await fetchJson(`${MLB_BASE}/standings?leagueId=103,104&season=${encodeURIComponent(season)}&standingsTypes=regularSeason&hydrate=team,division,league`);
    const data = calculateFromStanding(findTeamStanding(standings, teamId), season);
    if (!data) {
      const error = new Error("MLB standings did not contain enough verified fields for calculation");
      error.status = 422;
      throw error;
    }
    cache.set(key, { day, data, expiresAt: nextUtcMidnightMs(now), staleExpiresAt: nextUtcMidnightMs(now) + DAILY_STALE_MS });
    return data;
  })();
  inFlight.set(key, request);
  try {
    return { data: await request, cache: "MISS" };
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "intelligence-calculations")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://placeholder.invalid");
  const teamId = Number(url.searchParams.get("teamId"));
  const season = Number(url.searchParams.get("season"));
  if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(season) || season < 1900 || season > 2200) {
    return res.status(400).json({ error: "Valid teamId and season are required" });
  }

  try {
    const result = await loadCalculation(teamId, season);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    res.setHeader("X-Provider-Cache", result.cache);
    return res.status(200).json({ ...result.data, servedAt: new Date().toISOString() });
  } catch (error) {
    const cached = cache.get(`${teamId}:${season}`);
    if (cached?.staleExpiresAt > Date.now()) {
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json({ ...cached.data, freshness: "stale-cached", staleReason: error.message, servedAt: new Date().toISOString() });
    }
    return res.status(error.status || 502).json({ error: "Backend intelligence calculation unavailable", detail: error.message, provenance: "calculation-unavailable" });
  }
}
