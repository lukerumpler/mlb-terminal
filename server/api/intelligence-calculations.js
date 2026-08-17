import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { nextUtcMidnightMs, utcDayKey } from "./daily-provider-policy.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const allTeamCache = new Map();
const allTeamInFlight = new Map();
const DAILY_STALE_MS = 7 * 24 * 60 * 60_000;
const SEASON_LENGTH = 162;
const REPLACEMENT_WIN_BASELINE = 48;
const PLAYOFF_MARGIN_SCALE_WINS = 4;
const WILD_CARD_SLOTS = 3;

export function __resetIntelligenceCalculationStateForTests() {
  allTeamCache.clear();
  allTeamInFlight.clear();
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

function teamId(row) {
  return Number(row?.team?.id) || null;
}

function winProjection(row) {
  const wins = numeric(row?.wins ?? row?.w);
  const losses = numeric(row?.losses ?? row?.l);
  const played = wins != null && losses != null ? wins + losses : 0;
  if (!played) return null;
  return (wins / played) * SEASON_LENGTH;
}

function hasCalculableRecord(row) {
  return winProjection(row) != null;
}

function gamesPlayed(row) {
  const wins = numeric(row?.wins ?? row?.w);
  const losses = numeric(row?.losses ?? row?.l);
  return wins != null && losses != null ? wins + losses : null;
}

function logisticProbability(margin, scale = PLAYOFF_MARGIN_SCALE_WINS) {
  if (!Number.isFinite(margin)) return null;
  return 1 / (1 + Math.exp(-margin / scale));
}

function sortByProjectedWins(rows) {
  return [...rows].sort((left, right) => {
    const projectionDifference = (winProjection(right) || 0) - (winProjection(left) || 0);
    return projectionDifference || String(left?.team?.name || '').localeCompare(String(right?.team?.name || ''));
  });
}

function buildDivisionLeaders(leagueRows) {
  const leaders = new Map();
  for (const row of leagueRows) {
    const divisionId = standingDivisionId(row);
    if (!divisionId) continue;
    const current = leaders.get(divisionId);
    if (!current || (winProjection(row) || 0) > (winProjection(current) || 0)) leaders.set(divisionId, row);
  }
  return leaders;
}

function pairwiseSweepProbability(targetProjection, competitorRows) {
  const probabilities = competitorRows.map(row => logisticProbability(targetProjection - (winProjection(row) || 0)));
  if (!probabilities.length || probabilities.some(value => value == null)) return null;
  return probabilities.reduce((product, probability) => product * probability, 1);
}

/**
 * Deterministic, standings-only estimate. The fallback is intentionally not a
 * FanGraphs forecast: it excludes schedule strength, roster projections,
 * injuries, transactions, and Monte Carlo simulation. Every result carries
 * this methodology so it cannot be confused with a provider model.
 */
export function calculateStandingsPlayoffProjection(payload, targetStanding) {
  const targetProjection = winProjection(targetStanding);
  const targetLeague = standingLeagueId(targetStanding);
  const targetDivision = standingDivisionId(targetStanding);
  const targetId = teamId(targetStanding);
  if (targetProjection == null || !targetLeague || !targetDivision || !targetId) return null;

  const leagueRows = standingRows(payload).filter(row => standingLeagueId(row) === targetLeague && hasCalculableRecord(row));
  const divisionRows = leagueRows.filter(row => standingDivisionId(row) === targetDivision);
  const divisionCount = new Set(leagueRows.map(standingDivisionId).filter(Boolean)).size;
  if (divisionCount < 3 || divisionRows.length < 2 || leagueRows.length < 10) return null;

  const projectedDivision = sortByProjectedWins(divisionRows);
  const targetDivisionRank = projectedDivision.findIndex(row => teamId(row) === targetId) + 1;
  if (!targetDivisionRank) return null;
  const divisionCompetitors = projectedDivision.filter(row => teamId(row) !== targetId);
  const nearestDivisionCompetitor = divisionCompetitors[0] || null;
  const divisionMargin = nearestDivisionCompetitor ? targetProjection - (winProjection(nearestDivisionCompetitor) || 0) : null;
  const seasonComplete = leagueRows.every(row => (gamesPlayed(row) || 0) >= SEASON_LENGTH);
  const divisionTitleProbability = seasonComplete
    ? (targetDivisionRank === 1 ? 1 : 0)
    : pairwiseSweepProbability(targetProjection, divisionCompetitors);

  const divisionLeaders = buildDivisionLeaders(leagueRows);
  const targetIsProjectedDivisionLeader = teamId(divisionLeaders.get(targetDivision)) === targetId;
  // All non-leaders are projected Wild Card candidates. A projected division
  // leader is also included here solely to estimate the chance of reaching a
  // Wild Card spot if it loses the division race.
  const wildcardCandidates = sortByProjectedWins(leagueRows.filter(row => {
    const isDivisionLeader = teamId(divisionLeaders.get(standingDivisionId(row))) === teamId(row);
    return !isDivisionLeader || teamId(row) === targetId;
  }));
  const targetWildCardRank = wildcardCandidates.findIndex(row => teamId(row) === targetId) + 1;
  const cutoffIndex = targetWildCardRank > 0 && targetWildCardRank <= WILD_CARD_SLOTS
    ? WILD_CARD_SLOTS
    : WILD_CARD_SLOTS - 1;
  const wildcardCutline = wildcardCandidates[cutoffIndex] || null;
  const wildCardMargin = wildcardCutline ? targetProjection - (winProjection(wildcardCutline) || 0) : null;
  const wildCardProbability = seasonComplete
    ? (targetIsProjectedDivisionLeader ? 0 : targetWildCardRank > 0 && targetWildCardRank <= WILD_CARD_SLOTS ? 1 : 0)
    : targetWildCardRank && wildcardCutline
      ? logisticProbability(wildCardMargin)
      : null;
  const playoffProbability = divisionTitleProbability == null || wildCardProbability == null
    ? null
    : divisionTitleProbability + (1 - divisionTitleProbability) * wildCardProbability;

  return {
    probability: playoffProbability == null ? null : Number((playoffProbability * 100).toFixed(1)),
    divisionTitleProbability: divisionTitleProbability == null ? null : Number((divisionTitleProbability * 100).toFixed(1)),
    wildCardProbability: wildCardProbability == null ? null : Number((wildCardProbability * 100).toFixed(1)),
    projectedDivisionRank: targetDivisionRank || null,
    projectedWildCardRank: targetWildCardRank || null,
    divisionMarginWins: divisionMargin == null ? null : Number(divisionMargin.toFixed(1)),
    wildCardMarginWins: wildCardMargin == null ? null : Number(wildCardMargin.toFixed(1)),
    divisionCount,
    wildCardSlots: WILD_CARD_SLOTS,
    seasonComplete,
    model: seasonComplete
      ? "completed-season standings placement; division leader and three-Wild-Card positions are deterministic"
      : "deterministic standings pace; pairwise division sweep and three-Wild-Card cutline with 4-win logistic uncertainty; excludes schedule, roster, injury, transaction, and simulation inputs",
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
    teamId: teamId(standing),
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

export function calculateAllStandingsIntelligence(payload, season) {
  const rows = standingRows(payload);
  const teams = [];
  const unavailableTeams = [];
  const seenTeamIds = new Set();
  for (const row of rows) {
    const id = teamId(row);
    if (!id || seenTeamIds.has(id)) continue;
    seenTeamIds.add(id);
    const result = calculateFromStanding(row, season, payload);
    if (result) teams.push(result);
    else unavailableTeams.push({ teamId:id, teamName:row?.team?.name || null, reason:"insufficient verified standings record" });
  }
  const calculablePlayoffTeams = teams.filter(team => team.metrics.playoffProbability != null).length;
  const calculableWarTeams = teams.filter(team => team.metrics.teamWarProxy != null).length;
  return {
    season:Number(season),
    source:"MLB Stats API",
    provenance:"calculated-from-verified-standings",
    freshness:"calculated",
    totalStandingsTeams:seenTeamIds.size,
    calculatedTeams:teams.length,
    playoffEligibleCalculations:calculablePlayoffTeams,
    teamWarProxyCalculations:calculableWarTeams,
    unavailableTeams,
    teams:teams.sort((left, right) => String(left.teamName || '').localeCompare(String(right.teamName || ''))),
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

async function loadAllCalculations(season) {
  const key = String(season);
  const now = Date.now();
  const day = utcDayKey(now);
  const cached = allTeamCache.get(key);
  if (cached?.day === day) return { data:cached.data, cache:"DAILY" };
  const existing = allTeamInFlight.get(key);
  if (existing) return { data:await existing, cache:"COALESCED" };

  const request = (async () => {
    const standings = await fetchJson(`${MLB_BASE}/standings?leagueId=103,104&season=${encodeURIComponent(season)}&standingsTypes=regularSeason&hydrate=team,division,league`);
    const data = calculateAllStandingsIntelligence(standings, season);
    if (!data.calculatedTeams) {
      const error = new Error("MLB standings did not contain enough verified fields for calculation");
      error.status = 422;
      throw error;
    }
    allTeamCache.set(key, { day, data, expiresAt:nextUtcMidnightMs(now), staleExpiresAt:nextUtcMidnightMs(now) + DAILY_STALE_MS });
    return data;
  })();
  allTeamInFlight.set(key, request);
  try {
    return { data:await request, cache:"MISS" };
  } finally {
    if (allTeamInFlight.get(key) === request) allTeamInFlight.delete(key);
  }
}

function resultForTeam(data, teamId) {
  return data?.teams?.find(result => Number(result.teamId) === Number(teamId)) || null;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "intelligence-calculations")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://placeholder.invalid");
  const season = Number(url.searchParams.get("season"));
  const mode = String(url.searchParams.get("mode") || "team").toLowerCase();
  const teamId = Number(url.searchParams.get("teamId"));
  if (!Number.isInteger(season) || season < 1900 || season > 2200 || !["team", "all"].includes(mode)) {
    return res.status(400).json({ error: "Valid season and optional mode=all are required" });
  }
  if (mode === "team" && (!Number.isInteger(teamId) || teamId <= 0)) {
    return res.status(400).json({ error: "Valid teamId and season are required" });
  }

  try {
    const result = await loadAllCalculations(season);
    const payload = mode === "all" ? result.data : resultForTeam(result.data, teamId);
    if (!payload) {
      return res.status(422).json({ error:"The requested team lacks sufficient verified standings data", provenance:"calculation-unavailable" });
    }
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    res.setHeader("X-Provider-Cache", result.cache);
    return res.status(200).json({ ...payload, servedAt:new Date().toISOString() });
  } catch (error) {
    const cached = allTeamCache.get(String(season));
    if (cached?.staleExpiresAt > Date.now()) {
      const payload = mode === "all" ? cached.data : resultForTeam(cached.data, teamId);
      if (payload) {
        res.setHeader("X-Provider-Cache", "STALE");
        return res.status(200).json({ ...payload, freshness:"stale-cached", staleReason:error.message, servedAt:new Date().toISOString() });
      }
    }
    return res.status(error.status || 502).json({ error:"Backend intelligence calculation unavailable", detail:error.message, provenance:"calculation-unavailable" });
  }
}
