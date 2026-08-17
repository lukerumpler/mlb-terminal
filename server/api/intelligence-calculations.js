import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { nextUtcMidnightMs, utcDayKey } from "./daily-provider-policy.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const cache = new Map();
const inFlight = new Map();
const DAILY_STALE_MS = 7 * 24 * 60 * 60_000;
const SEASON_LENGTH = 162;
// A 48-win baseline is the convention used for a team-level
// wins-above-replacement approximation. This is deliberately a proxy, not
// FanGraphs team WAR or a substitute for its player-component methodology.
const REPLACEMENT_WIN_BASELINE = 48;
const PLAYOFF_MARGIN_SCALE_WINS = 4;

export function __resetIntelligenceCalculationStateForTests() {
  cache.clear();
  inFlight.clear();
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function standingRows(payload) {
  return (payload?.records || []).flatMap(group => group?.teamRecords || []).filter(Boolean);
}

function findTeamStanding(payload, teamId) {
  return standingRows(payload).find(row => Number(row.team?.id) === Number(teamId)) || null;
}

function standingDivisionId(row) {
  return Number(row?.division?.id ?? row?.team?.division?.id) || null;
}

function standingLeagueId(row) {
  return Number(row?.league?.id ?? row?.team?.league?.id) || null;
}

function winProjection(row) {
  const wins = numeric(row?.wins ?? row?.w);
  const losses = numeric(row?.losses ?? row?.l);
  const played = wins != null && losses != null ? wins + losses : 0;
  if (!played) return null;
  return (wins / played) * SEASON_LENGTH;
}

function logisticProbability(margin, scale = PLAYOFF_MARGIN_SCALE_WINS) {
  if (!Number.isFinite(margin)) return null;
  return 1 / (1 + Math.exp(-margin / scale));
}

/**
 * Deterministic, standings-only estimate. It is intentionally not presented as
 * a FanGraphs forecast: no schedule strength, injuries, roster projections, or
 * simulation inputs are assumed. The output is useful only when the verified
 * FanGraphs model is absent and is labeled as an intelligence calculation.
 */
export function calculateStandingsPlayoffProjection(payload, targetStanding) {
  const targetProjection = winProjection(targetStanding);
  const targetLeague = standingLeagueId(targetStanding);
  const targetDivision = standingDivisionId(targetStanding);
  if (targetProjection == null || !targetLeague || !targetDivision) return null;

  const leagueRows = standingRows(payload).filter(row => standingLeagueId(row) === targetLeague && winProjection(row) != null);
  const divisionRows = leagueRows.filter(row => standingDivisionId(row) === targetDivision);
  if (leagueRows.length < 4 || divisionRows.length < 2) return null;

  const projectedDivision = [...divisionRows].sort((a, b) => winProjection(b) - winProjection(a));
  const targetDivisionRank = projectedDivision.findIndex(row => Number(row.team?.id) === Number(targetStanding.team?.id)) + 1;
  const divisionCompetitor = projectedDivision.find(row => Number(row.team?.id) !== Number(targetStanding.team?.id));
  const divisionMargin = divisionCompetitor ? targetProjection - winProjection(divisionCompetitor) : null;
  const divisionTitleProbability = logisticProbability(divisionMargin);

  const divisionLeaders = new Map();
  for (const row of leagueRows) {
    const divisionId = standingDivisionId(row);
    const current = divisionLeaders.get(divisionId);
    if (!current || winProjection(row) > winProjection(current)) divisionLeaders.set(divisionId, row);
  }
  const projectedWildCardPool = leagueRows
    .filter(row => Number(row.team?.id) !== Number(divisionLeaders.get(standingDivisionId(row))?.team?.id))
    .sort((a, b) => winProjection(b) - winProjection(a));
  const wildCardCutline = projectedWildCardPool[2] || null;
  const targetIsProjectedDivisionLeader = targetDivisionRank === 1;
  const targetWildCardRank = projectedWildCardPool.findIndex(row => Number(row.team?.id) === Number(targetStanding.team?.id)) + 1;
  const wildCardMargin = !targetIsProjectedDivisionLeader && wildCardCutline
    ? targetProjection - winProjection(wildCardCutline)
    : null;
  const wildCardProbability = targetIsProjectedDivisionLeader ? 0 : logisticProbability(wildCardMargin);
  const playoffProbability = divisionTitleProbability == null
    ? null
    : targetIsProjectedDivisionLeader
      ? divisionTitleProbability
      : divisionTitleProbability + (1 - divisionTitleProbability) * (wildCardProbability || 0);

  return {
    probability: playoffProbability == null ? null : Number((playoffProbability * 100).toFixed(1)),
    divisionTitleProbability: divisionTitleProbability == null ? null : Number((divisionTitleProbability * 100).toFixed(1)),
    wildCardProbability: wildCardProbability == null ? null : Number((wildCardProbability * 100).toFixed(1)),
    projectedDivisionRank: targetDivisionRank || null,
    projectedWildCardRank: targetWildCardRank || null,
    divisionMarginWins: divisionMargin == null ? null : Number(divisionMargin.toFixed(1)),
    wildCardMarginWins: wildCardMargin == null ? null : Number(wildCardMargin.toFixed(1)),
    model: "deterministic standings pace with 4-win logistic uncertainty; excludes schedule, roster, injury, and simulation inputs",
  };
}

export function calculateFromStanding(standing, season, standingsPayload = null) {
  if (!standing) return null;
  const wins = numeric(standing.wins ?? standing.w);
  const losses = numeric(standing.losses ?? standing.l);
  if (wins == null || losses == null || wins + losses <= 0) return null;

  const gamesPlayed = wins + losses;
  const winPct = wins / gamesPlayed;
  const projectedWins = winPct * SEASON_LENGTH;
  const projectedLosses = SEASON_LENGTH - projectedWins;
  const runsScored = numeric(standing.runsScored ?? standing.runs);
  const runsAllowed = numeric(standing.runsAllowed ?? standing.runsAgainst);
  const pythagoreanExponent = 1.83;
  const pythagoreanWinPct = runsScored != null && runsAllowed != null && runsScored + runsAllowed > 0
    ? (runsScored ** pythagoreanExponent) / ((runsScored ** pythagoreanExponent) + (runsAllowed ** pythagoreanExponent))
    : null;
  const pythagoreanWins = pythagoreanWinPct == null ? null : pythagoreanWinPct * SEASON_LENGTH;
  const teamWarProxy = pythagoreanWins == null ? null : pythagoreanWins - REPLACEMENT_WIN_BASELINE;
  const playoffProjection = calculateStandingsPlayoffProjection(standingsPayload, standing);

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
      teamWarProxy: teamWarProxy == null ? null : "pythagorean expected wins minus a 48-win replacement baseline; not FanGraphs Team WAR",
      playoffProbability: playoffProjection == null ? null : playoffProjection.model,
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
      pythagoreanWins,
      teamWarProxy,
      replacementWinBaseline: teamWarProxy == null ? null : REPLACEMENT_WIN_BASELINE,
      playoffProbability: playoffProjection?.probability ?? null,
      divisionTitleProbability: playoffProjection?.divisionTitleProbability ?? null,
      wildCardProbability: playoffProjection?.wildCardProbability ?? null,
    },
    playoffProjection,
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
    const data = calculateFromStanding(findTeamStanding(standings, teamId), season, standings);
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
