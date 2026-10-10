import { createHash } from "node:crypto";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { readDurableCache, writeDurableCache } from "../durable-cache";
import { getTeamFinancialSnapshot } from "./team-financials.js";
import { loadAggregateWar } from "./fangraphs-models.js";
import { CACHE_POLICY } from "../cache-policy.js";
import { currentMlbSeason, isSupportedSeason } from "../season.ts";

const TEAM_CODE = /^[A-Z]{2,3}$/;
const FRESH_TTL_MS = CACHE_POLICY.teamEfficiencyFreshMs;
const STALE_TTL_MS = CACHE_POLICY.teamEfficiencyStaleMs;
const MAX_COMPARISON_TEAMS = 30;
const efficiencyCache = new Map();
const efficiencyInFlight = new Map();

const TEAM_ALIASES = {
  ARI: ["ARI", "AZ", "ARIZONA DIAMONDBACKS", "DIAMONDBACKS", "D-BACKS"],
  ATL: ["ATL", "ATLANTA BRAVES", "BRAVES"],
  BAL: ["BAL", "BALTIMORE ORIOLES", "ORIOLES"],
  BOS: ["BOS", "BOSTON RED SOX", "RED SOX"],
  CHC: ["CHC", "CHICAGO CUBS", "CUBS"],
  CWS: ["CWS", "CHW", "CHICAGO WHITE SOX", "WHITE SOX"],
  CIN: ["CIN", "CINCINNATI REDS", "REDS"],
  CLE: ["CLE", "CLEVELAND GUARDIANS", "GUARDIANS"],
  COL: ["COL", "COLORADO ROCKIES", "ROCKIES"],
  DET: ["DET", "DETROIT TIGERS", "TIGERS"],
  HOU: ["HOU", "HOUSTON ASTROS", "ASTROS"],
  KC: ["KC", "KCR", "KANSAS CITY ROYALS", "ROYALS"],
  LAA: ["LAA", "ANA", "LOS ANGELES ANGELS", "LOS ANGELES ANGELS OF ANAHEIM", "ANGELS"],
  LAD: ["LAD", "LOS ANGELES DODGERS", "DODGERS"],
  MIA: ["MIA", "FLA", "MIAMI MARLINS", "MARLINS"],
  MIL: ["MIL", "MILWAUKEE BREWERS", "BREWERS"],
  MIN: ["MIN", "MINNESOTA TWINS", "TWINS"],
  NYM: ["NYM", "NEW YORK METS", "METS"],
  NYY: ["NYY", "NEW YORK YANKEES", "YANKEES"],
  OAK: ["OAK", "ATH", "ATHLETICS", "OAKLAND ATHLETICS"],
  PHI: ["PHI", "PHILADELPHIA PHILLIES", "PHILLIES"],
  PIT: ["PIT", "PITTSBURGH PIRATES", "PIRATES"],
  SD: ["SD", "SDP", "SAN DIEGO PADRES", "PADRES"],
  SF: ["SF", "SFG", "SAN FRANCISCO GIANTS", "GIANTS"],
  SEA: ["SEA", "SEATTLE MARINERS", "MARINERS"],
  STL: ["STL", "ST. LOUIS CARDINALS", "ST LOUIS CARDINALS", "CARDINALS"],
  TB: ["TB", "TBR", "TAMPA BAY RAYS", "RAYS"],
  TEX: ["TEX", "TEXAS RANGERS", "RANGERS"],
  TOR: ["TOR", "TORONTO BLUE JAYS", "BLUE JAYS"],
  WSH: ["WSH", "WAS", "WSN", "WASHINGTON NATIONALS", "NATIONALS"],
};

function token(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function canonicalTeamAbbreviation(value) {
  const normalized = token(value);
  if (!normalized) return null;
  for (const [abbr, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some(alias => token(alias) === normalized)) return abbr;
  }
  return normalized.length <= 3 ? normalized : null;
}

function findWarRow(rows, requestedTeam) {
  const target = canonicalTeamAbbreviation(requestedTeam);
  return (Array.isArray(rows) ? rows : []).find(row => {
    const rowAbbr = canonicalTeamAbbreviation(row.teamAbbreviation || row.abbr || row.team);
    return rowAbbr && target && rowAbbr === target;
  }) || null;
}

function sourceFreshness(financials, warData) {
  const values = [financials?.freshness, warData?.freshness].filter(Boolean);
  if (values.includes("stale-cached")) return "stale-cached";
  if (values.includes("daily-cached") || values.includes("cached")) return "cached";
  return "live";
}

function durableEfficiencyKey(team, season, payrollBasis) {
  return `team-efficiency:${createHash("sha256").update(`${team}:${season}:${payrollBasis}`).digest("hex")}`;
}

function payrollAmount(financials, payrollBasis) {
  if (payrollBasis === "taxPayroll") return financials?.tax?.taxPayroll;
  if (payrollBasis === "totalTaxPayroll") return financials?.tax?.totalTaxPayroll;
  return financials?.payroll?.[payrollBasis];
}

export function calculateSalaryWarEfficiency({ payrollUsd, totalWar }) {
  const payroll = Number(payrollUsd);
  const war = Number(totalWar);
  if (!Number.isFinite(payroll) || payroll <= 0 || !Number.isFinite(war) || war <= 0) {
    return { dollarsPerWar: null, warPer100m: null };
  }
  return {
    dollarsPerWar: Math.round(payroll / war),
    warPer100m: Number(((war / payroll) * 100_000_000).toFixed(2)),
  };
}

export function selectWarSplit(fanGraphsRow, baseballReferenceRow) {
  const has = row => row?.battingWAR != null || row?.pitchingWAR != null;
  const pick = (row, provider) => ({
    offensive: row.battingWAR ?? null,
    pitching: row.pitchingWAR ?? null,
    provider,
  });
  if (has(fanGraphsRow)) return pick(fanGraphsRow, "FanGraphs");
  if (has(baseballReferenceRow)) return pick(baseballReferenceRow, "Baseball-Reference");
  return { offensive: null, pitching: null, provider: null };
}

export function calculateBlendedWar({ fanGraphsWar, baseballReferenceWar, fanGraphsDefensiveWar = null, baseballReferenceDefensiveWar = null }) {
  const numeric = value => value == null || value === "" ? null : Number(value);
  const fWAR = numeric(fanGraphsWar);
  const bWAR = numeric(baseballReferenceWar);
  const defensiveValues = [numeric(fanGraphsDefensiveWar), numeric(baseballReferenceDefensiveWar)].filter(Number.isFinite);
  return {
    fWAR: Number.isFinite(fWAR) ? fWAR : null,
    bWAR: Number.isFinite(bWAR) ? bWAR : null,
    blendedWAR: Number.isFinite(fWAR) && Number.isFinite(bWAR)
      ? Number(((fWAR + bWAR) / 2).toFixed(1))
      : Number.isFinite(fWAR) ? fWAR : Number.isFinite(bWAR) ? bWAR : null,
    defensiveAverage: defensiveValues.length === 2
      ? Number(((defensiveValues[0] + defensiveValues[1]) / 2).toFixed(1))
      : null,
    defensiveMethodology: defensiveValues.length === 2
      ? "Average of comparable FanGraphs and Baseball-Reference defensive WAR"
      : "Unavailable unless both providers expose comparable defensive WAR",
  };
}

export function normalizeEfficiencyRecord({ team, season, payrollBasis, financials, warData, warRow, fanGraphsRow = null, baseballReferenceRow = null, warnings = [] }) {
  const payroll = payrollAmount(financials, payrollBasis);
  const payrollUsd = payroll == null ? null : Number(payroll);
  const fWARRow = fanGraphsRow || (warData?.source === "FanGraphs" ? warRow : null);
  const bWARRow = baseballReferenceRow || (warData?.source === "Baseball-Reference" ? warRow : null);
  const blend = calculateBlendedWar({
    fanGraphsWar: fWARRow?.totalWAR,
    baseballReferenceWar: bWARRow?.totalWAR,
    fanGraphsDefensiveWar: fWARRow?.defensiveWAR,
    baseballReferenceDefensiveWar: bWARRow?.defensiveWAR,
  });
  const totalWar = blend.blendedWAR;
  const split = selectWarSplit(fWARRow, bWARRow);
  const efficiency = calculateSalaryWarEfficiency({ payrollUsd, totalWar });
  const complete = efficiency.dollarsPerWar != null && efficiency.warPer100m != null;
  const freshness = sourceFreshness(financials, warData);
  return {
    found: complete,
    status: complete ? freshness : "source-gap",
    team: fWARRow?.team || bWARRow?.team || warRow?.team || team,
    teamAbbreviation: canonicalTeamAbbreviation(team),
    season,
    payroll: {
      amountUsd: Number.isFinite(payrollUsd) ? payrollUsd : null,
      basis: payrollBasis,
      source: financials?.source || "Spotrac",
      sourceUrl: financials?.sourceUrls?.payroll || financials?.payroll?.sourceUrl || null,
      retrievedAt: financials?.retrievedAt || null,
      freshness: financials?.freshness || "unavailable",
    },
    war: {
      total: Number.isFinite(totalWar) ? totalWar : null,
      fWAR: blend.fWAR,
      bWAR: blend.bWAR,
      // Offensive/pitching come from ONE provider so the pair is internally
      // consistent: FanGraphs when it has either value, else Baseball-Reference.
      offensive: split.offensive,
      pitching: split.pitching,
      splitProvider: split.provider,
      defensive: blend.defensiveAverage,
      defensiveFanGraphs: fWARRow?.defensiveWAR ?? null,
      defensiveBaseballReference: bWARRow?.defensiveWAR ?? null,
      provider: blend.fWAR != null && blend.bWAR != null
        ? "FanGraphs + Baseball-Reference"
        : fWARRow ? "FanGraphs" : bWARRow ? "Baseball-Reference" : "Unavailable",
      methodology: blend.fWAR != null && blend.bWAR != null ? "Blended fWAR/bWAR average" : fWARRow ? "fWAR" : bWARRow ? "bWAR/rWAR" : "Unavailable",
      defensiveMethodology: blend.defensiveMethodology,
      sourceUrl: warData?.sourceUrls?.aggregate || warData?.sourceUrls?.batting || null,
      sourceUrls: {
        fanGraphs: warData?.providerSnapshots?.fanGraphs?.sourceUrls || (fWARRow ? warData?.sourceUrls : null),
        baseballReference: warData?.providerSnapshots?.baseballReference?.sourceUrls || (bWARRow ? warData?.sourceUrls : null),
      },
      retrievedAt: warData?.retrievedAt || null,
      freshness: warData?.freshness || "unavailable",
      fallback: Boolean(warData?.fallback),
    },
    efficiency: {
      ...efficiency,
      calculationVersion: "salary-war-v2-blended-fwar-bwar",
    },
    sourceUrls: {
      payroll: financials?.sourceUrls?.payroll || null,
      tax: financials?.sourceUrls?.tax || null,
      war: warData?.sourceUrls?.aggregate || warData?.sourceUrls?.batting || null,
    },
    retrievedAt: new Date().toISOString(),
    freshness,
    warnings: [...warnings,
      ...(blend.fWAR == null ? ["FanGraphs fWAR unavailable; blended WAR uses Baseball-Reference only or is unavailable"] : []),
      ...(blend.bWAR == null ? ["Baseball-Reference bWAR unavailable; blended WAR uses FanGraphs only or is unavailable"] : []),
      ...(blend.defensiveAverage == null ? ["Defensive WAR blend unavailable because both comparable provider fields were not present"] : []),
      ...(financials?.freshness === "stale-cached" ? ["Payroll is stale-cached"] : []),
      ...(warData?.freshness === "stale-cached" ? ["WAR is stale-cached"] : [])],
  };
}

async function fetchEfficiencyRecord(team, season, payrollBasis) {
  const warnings = [];
  const [financialResult, warResult] = await Promise.allSettled([
    getTeamFinancialSnapshot(team, season),
    loadAggregateWar(season),
  ]);
  const financials = financialResult.status === "fulfilled" ? financialResult.value : null;
  const warData = warResult.status === "fulfilled" ? warResult.value?.data || warResult.value : null;
  if (financialResult.status === "rejected") warnings.push("Spotrac payroll unavailable");
  if (warResult.status === "rejected") warnings.push("Team WAR unavailable from FanGraphs and Baseball-Reference");
  const fanGraphsData = warData?.providerSnapshots?.fanGraphs;
  const baseballReferenceData = warData?.providerSnapshots?.baseballReference;
  const warRow = findWarRow(warData?.teams, team);
  const fanGraphsRow = findWarRow(fanGraphsData?.teams, team) || (warData?.source === "FanGraphs" ? warRow : null);
  const baseballReferenceRow = findWarRow(baseballReferenceData?.teams, team) || (warData?.source === "Baseball-Reference" ? warRow : null);
  if (!fanGraphsRow && !baseballReferenceRow) warnings.push("No verified team WAR row matched the requested team");
  if (!financials?.found) warnings.push("No verified team payroll matched the requested team");
  return normalizeEfficiencyRecord({ team, season, payrollBasis, financials, warData, warRow, fanGraphsRow, baseballReferenceRow, warnings });
}

export async function getTeamEfficiencySnapshot(team, season = currentMlbSeason(), payrollBasis = "payroll") {
  const normalizedTeam = canonicalTeamAbbreviation(team);
  const normalizedSeason = Number.isInteger(Number(season)) ? Number(season) : currentMlbSeason();
  const normalizedBasis = String(payrollBasis || "payroll");
  const cacheKey = `${normalizedTeam}:${normalizedSeason}:${normalizedBasis}`;
  const now = Date.now();
  let cached = efficiencyCache.get(cacheKey);
  if (cached?.freshUntil > now) return { ...cached.data, cache: "HIT" };

  if (!process.env.VITEST && process.env.DATABASE_URL && (!cached || cached.staleUntil <= now)) {
    const durable = await readDurableCache(durableEfficiencyKey(normalizedTeam, normalizedSeason, normalizedBasis));
    if (durable) {
      cached = {
        data: durable.data,
        freshUntil: new Date(durable.freshUntil).getTime(),
        staleUntil: new Date(durable.staleUntil).getTime(),
      };
      efficiencyCache.set(cacheKey, cached);
      if (cached.freshUntil > now) return { ...cached.data, cache: "DURABLE-HIT" };
    }
  }

  const existing = efficiencyInFlight.get(cacheKey);
  if (existing) return { ...(await existing), cache: "COALESCED" };

  const request = fetchEfficiencyRecord(normalizedTeam, normalizedSeason, normalizedBasis);
  efficiencyInFlight.set(cacheKey, request);
  try {
    const data = await request;
    const freshUntil = Date.now() + FRESH_TTL_MS;
    const staleUntil = freshUntil + STALE_TTL_MS;
    efficiencyCache.set(cacheKey, { data, freshUntil, staleUntil });
    if (!process.env.VITEST && process.env.DATABASE_URL) {
      void writeDurableCache({
        cacheKey: durableEfficiencyKey(normalizedTeam, normalizedSeason, normalizedBasis),
        source: "SKIP normalized team efficiency",
        data,
        freshUntil: new Date(freshUntil),
        staleUntil: new Date(staleUntil),
      });
    }
    return { ...data, cache: "MISS" };
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) {
      return {
        ...cached.data,
        status: "stale-cached",
        freshness: "stale-cached",
        warnings: [...(cached.data.warnings || []), error?.message || "Efficiency refresh failed"],
        cache: "STALE",
      };
    }
    throw error;
  } finally {
    if (efficiencyInFlight.get(cacheKey) === request) efficiencyInFlight.delete(cacheKey);
  }
}

export function __resetTeamEfficiencyStateForTests() {
  efficiencyCache.clear();
  efficiencyInFlight.clear();
}

// "partial" means some requested teams have no usable row. A complete result that
// merely came from cache keeps its own freshness instead of being called partial.
export function aggregateStatus(rows) {
  if (!rows.some(row => row.found)) return "source-gap";
  if (!rows.every(row => row.found)) return "partial";
  if (rows.some(row => row.status === "stale-cached")) return "stale-cached";
  return rows.every(row => row.status === "live") ? "live" : "cached";
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = new URL(req.url, "https://placeholder.invalid");
  const seasonValue = Number(url.searchParams.get("season") || currentMlbSeason());
  const season = isSupportedSeason(seasonValue) ? seasonValue : currentMlbSeason();
  const payrollBasis = url.searchParams.get("payrollBasis") || "payroll";
  const requested = [
    ...String(url.searchParams.get("teams") || "").split(","),
    url.searchParams.get("team") || "",
  ].map(value => canonicalTeamAbbreviation(value)).filter(Boolean);
  const teams = [...new Set(requested)];
  if (!teams.length || teams.length > MAX_COMPARISON_TEAMS || teams.some(team => !TEAM_CODE.test(team))) {
    return res.status(400).json({ error: "Provide one team or up to 30 comma-separated MLB team abbreviations", example: "/api/team-efficiency?team=SD&season=2026" });
  }
  if (!['payroll', 'active', 'taxPayroll', 'totalTaxPayroll'].includes(payrollBasis)) {
    return res.status(400).json({ error: "Unsupported payrollBasis", valid: ['payroll', 'active', 'taxPayroll', 'totalTaxPayroll'] });
  }
  if (isRateLimited(req, "team-efficiency")) return rateLimitResponse(res);

  const results = await Promise.allSettled(teams.map(team => getTeamEfficiencySnapshot(team, season, payrollBasis)));
  const rows = results.map((result, index) => result.status === "fulfilled"
    ? result.value
    : {
        found: false,
        status: "source-gap",
        freshness: "unavailable",
        team: teams[index],
        teamAbbreviation: teams[index],
        season,
        payroll: { amountUsd: null, basis: payrollBasis, source: "Unavailable", sourceUrl: null, retrievedAt: null, freshness: "unavailable" },
        war: { total: null, offensive: null, pitching: null, defensive: null, provider: "Unavailable", methodology: "Unavailable", sourceUrl: null, retrievedAt: null, freshness: "unavailable", fallback: false },
        efficiency: { dollarsPerWar: null, warPer100m: null, calculationVersion: "salary-war-v1" },
        sourceUrls: { payroll: null, tax: null, war: null },
        retrievedAt: new Date().toISOString(),
        warnings: [result.reason?.message || "Team efficiency snapshot failed"],
        cache: "ERROR",
      });
  const complete = rows.filter(row => row.found);
  const response = {
    found: complete.length > 0,
    season,
    payrollBasis,
    rows,
    record: teams.length === 1 ? rows[0] : null,
    source: "Spotrac + FanGraphs/Baseball-Reference",
    retrievedAt: new Date().toISOString(),
    status: aggregateStatus(rows),
  };
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  res.setHeader("X-Provider-Cache", rows.some(row => row.cache === "HIT" || row.cache === "DURABLE-HIT") ? "HIT" : "MISS");
  res.setHeader("X-Provider-Freshness", response.status);
  return res.status(200).json(response);
}
