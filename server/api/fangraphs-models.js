import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

import { createHash } from 'node:crypto';
import { readDurableCache, writeDurableCache } from '../durable-cache';
import { hasAttemptedProviderToday, nextUtcMidnightMs, utcDayKey } from './daily-provider-policy.js';
import { currentMlbSeason, isPlausibleSeason } from "../season.ts";

const TEAM_CODE = /^[A-Z]{2,3}$/;
const ODDS_URL = "https://www.fangraphs.com/standings/playoff-odds/fg/mlb";
const WAR_URL = "https://www.fangraphs.com/depthcharts.aspx?position=Team";
const AGGREGATE_WAR_URL = (season, stats) =>
  `https://www.fangraphs.com/leaders-legacy.aspx?pos=all&stats=${stats}&lg=all&qual=y&type=8&season=${season}&season1=${season}&month=0&ind=0&team=0%2Cts&rost=0&age=0%2C100&filter=&players=&page=1_50`;
const BASEBALL_REFERENCE_TEAM_WAR_URL = season =>
  `https://www.baseball-reference.com/leagues/team_compare.cgi?year=${season}&lg=MLB&stat=WAR`;
const UA = "Mozilla/5.0 (compatible; SKIPBaseball/1.0)";
const CACHE_TTL_MS = 15 * 60_000;
const STALE_TTL_MS = 60 * 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const FANGRAPHS_FAILURE_COOLDOWN_MS = 15_000;
const modelCache = new Map();
const modelInFlight = new Map();
const aggregateWarCache = new Map();
const aggregateWarInFlight = new Map();
let fanGraphsCooldownUntil = 0;
const modelFailureCooldownUntil = new Map();
const modelDailyAttemptDay = new Map();
const aggregateDailyAttemptDay = new Map();
const TEAM_NAME_ALIASES = {
  ARI: ["Diamondbacks"], ATH: ["Athletics"], ATL: ["Braves"],
  BAL: ["Orioles"], BOS: ["Red Sox"], CHC: ["Cubs"], CIN: ["Reds"],
  CLE: ["Guardians"], COL: ["Rockies"], CWS: ["White Sox"], DET: ["Tigers"],
  HOU: ["Astros"], KC: ["Royals"], KCR: ["Royals"], LAA: ["Angels"],
  LAD: ["Dodgers"], MIA: ["Marlins"], MIL: ["Brewers"], MIN: ["Twins"],
  NYM: ["Mets"], NYY: ["Yankees"], OAK: ["Athletics"], PHI: ["Phillies"],
  PIT: ["Pirates"], SD: ["Padres"], SEA: ["Mariners"], SF: ["Giants"],
  STL: ["Cardinals"], TB: ["Rays"], TEX: ["Rangers"], TOR: ["Blue Jays"],
  WSH: ["Nationals"],
};

export function __seedFanGraphsModelCacheForTests(teamAbbr, season, data, { expiresAt, staleExpiresAt } = {}) {
  modelCache.set(modelKey(teamAbbr, season), {
    data,
    expiresAt: expiresAt ?? Date.now() - 1,
    staleExpiresAt: staleExpiresAt ?? Date.now() + 60_000,
  });
}

export function __resetFanGraphsProviderStateForTests() {
  modelCache.clear();
  modelInFlight.clear();
  aggregateWarCache.clear();
  aggregateWarInFlight.clear();
  modelFailureCooldownUntil.clear();
  modelDailyAttemptDay.clear();
  aggregateDailyAttemptDay.clear();
  fanGraphsCooldownUntil = 0;
}

export function isFanGraphsProviderBlockedResponse(status, body) {
  return Number(status) === 403 && /cloudflare|just a moment|challenge/i.test(String(body || ''));
}

function parseRetryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  if (!value) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return Math.max(1_000, Math.min(120_000, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(1_000, Math.min(120_000, date - Date.now()))
    : DEFAULT_COOLDOWN_MS;
}

function durableFanGraphsKey(scope) {
  return `fangraphs:${createHash('sha256').update(scope).digest('hex')}`;
}

function modelKey(teamAbbr, season) {
  return `${teamAbbr}:${season}`;
}

function staleModel(cacheEntry) {
  return cacheEntry && cacheEntry.staleExpiresAt > Date.now()
    ? cacheEntry
    : null;
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^<>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Provider pages are parsed with regexes, so a truncated or garbled response must
// cost a scan, not a rescan per tag. Two rules keep every pattern linear:
//  1. opener classes are `[^<>]*` (they never run across another tag), and
//  2. only text up to the LAST closing tag is searched: an unclosed opener after
//     it can never match, but would otherwise rescan the whole remainder each time.
const TABLE_BLOCK = /<table[^<>]*>([\s\S]*?)<\/table>/gi;
const TABLE_CLOSE = /<\/table>/gi;
const ROW_BLOCK = /<tr[^<>]*>([\s\S]*?)<\/tr>/gi;
const ROW_CLOSE = /<\/tr>/gi;
const CELL_BLOCK = /<t[dh][^<>]*>([\s\S]*?)<\/t[dh]>/gi;
const CELL_WITH_ATTRS_BLOCK = /<t([dh])([^<>]*)>([\s\S]*?)<\/t[dh]>/gi;
const CELL_CLOSE = /<\/t[dh]>/gi;
const ANCHOR_CLOSE = /<\/a>/gi;

function upToLastClose(text, closing) {
  const source = String(text || "");
  let end = -1;
  for (const match of source.matchAll(closing)) end = match.index + match[0].length;
  return end < 0 ? "" : source.slice(0, end);
}

function closedBlocks(text, pattern, closing) {
  return [...upToLastClose(text, closing).matchAll(pattern)];
}

function cellsFromRow(row) {
  return closedBlocks(row, CELL_BLOCK, CELL_CLOSE).map(match => stripTags(match[1]));
}

function tablesFromHtml(html) {
  return closedBlocks(html, TABLE_BLOCK, TABLE_CLOSE).map(match => match[1]);
}

// Providers print negative WAR with ASCII hyphens, Unicode minus signs
// (U+2212, en/em dashes) or accounting parentheses. Reading "\u22121.2" as 1.2 would
// silently flip the sign, so normalise before matching.
function normalizeNegatives(value) {
  return String(value ?? "")
    .replace(/[\u2212\u2013\u2014\u2012]/g, "-")
    .replace(/,/g, "")
    .replace(/^\s*\((\d+(?:\.\d+)?)\)\s*$/, "-$1");
}

function numeric(value) {
  const match = normalizeNegatives(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// League/total rows are not teams and must not become WAR entries.
const NON_TEAM_ROW = /^(total|totals|league|lg|mlb|average|avg|al|nl)$/i;

function findTeamRow(html, teamAbbr) {
  for (const table of tablesFromHtml(html)) {
    for (const row of closedBlocks(table, ROW_BLOCK, ROW_CLOSE)) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(cell => matchesTeamName(cell, teamAbbr))) return cells;
    }
  }
  return null;
}

function parsePercentage(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function normalizeMetricKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function matchesTeamName(cell, teamAbbr) {
  const upper = String(teamAbbr).toUpperCase();
  const aliases = [upper, ...(TEAM_NAME_ALIASES[upper] || [])];
  return aliases.some(alias =>
    new RegExp(
      `(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
      "i"
    ).test(cell)
  );
}

function findTeamRowDetails(html, teamAbbr) {
  for (const table of tablesFromHtml(html)) {
    const tableRows = closedBlocks(table, ROW_BLOCK, ROW_CLOSE);
    const headerMatch = tableRows[0];
    const headers = headerMatch ? cellsFromRow(headerMatch[1]) : [];
    for (const row of tableRows) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(cell => matchesTeamName(cell, teamAbbr))) {
        const metrics = {};
        cells.forEach((cell, index) => {
          const key = normalizeMetricKey(headers[index]);
          const value = numeric(cell);
          if (key && value != null) metrics[key] = value;
        });
        return { cells, metrics };
      }
    }
  }
  return null;
}

export function parseFanGraphsProviderUpdatedText(html) {
  const text = stripTags(html);
  const match = text.match(/\bUpdated:\s*([^\n]+?\b(?:ET|EST|EDT))\b/i);
  return match ? match[1].trim() : null;
}

export function parseFanGraphsModelHtml(
  { oddsHtml, warHtml },
  teamAbbr,
  season = currentMlbSeason()
) {
  const oddsDetails = findTeamRowDetails(oddsHtml, teamAbbr);
  const warDetails = findTeamRowDetails(warHtml, teamAbbr);
  const oddsRow = oddsDetails?.cells || findTeamRow(oddsHtml, teamAbbr);
  const warRow = warDetails?.cells || findTeamRow(warHtml, teamAbbr);
  const metrics = {
    ...(oddsDetails?.metrics || {}),
    ...(warDetails?.metrics || {}),
  };
  const pick = (...keys) =>
    keys.map(key => metrics[key]).find(value => value != null) ?? null;
  const playoffOdds = pick(
    "make_playoffs",
    "playoff_odds",
    "make_postseason",
    "postseason_odds"
  ) ?? (oddsRow
    ? (oddsRow.map(parsePercentage).find(value => value != null) ?? null)
    : null);
  const teamWar = pick("war", "team_war", "total_war") ?? (warRow
    ? (warRow.map(numeric).find(value => value != null) ?? null)
    : null);
  return {
    playoffOdds,
    teamWar,
    season,
    teamAbbr,
    source: "FanGraphs",
    sourceUrls: { playoffOdds: ODDS_URL, teamWar: WAR_URL },
    providerUpdatedText: parseFanGraphsProviderUpdatedText(oddsHtml),
    advancedMetrics: {
      projectedWins: pick("projected_wins", "proj_w", "wins", "w"),
      projectedLosses: pick("projected_losses", "proj_l", "losses", "l"),
      projectedRuns: pick("projected_runs", "runs", "r"),
      projectedRunsAllowed: pick(
        "projected_runs_allowed",
        "runs_allowed",
        "ra"
      ),
      offenseWar: pick("offense_war", "off_war", "batting_war"),
      defenseWar: pick("defense_war", "def_war", "fielding_war"),
      bullpenWar: pick("bullpen_war", "relief_war"),
      projectedWrcPlus: pick("projected_wrc_plus", "wrc_plus"),
      projectedFip: pick("projected_fip", "fip"),
    },
  };
}

export function parseFanGraphsAggregateWarHtml(
  { battingHtml, pitchingHtml },
  season = currentMlbSeason()
) {
  const parseRows = html => {
    const rows = new Map();
    for (const table of tablesFromHtml(html)) {
      const matches = closedBlocks(table, ROW_BLOCK, ROW_CLOSE);
      if (!matches.length) continue;
      const headers = cellsFromRow(matches[0][1]);
      const teamIndex = headers.findIndex(
        header =>
          normalizeMetricKey(header) === "team" ||
          normalizeMetricKey(header).includes("team")
      );
      const warIndex = headers.findIndex(
        header =>
          normalizeMetricKey(header) === "war" ||
          normalizeMetricKey(header).endsWith("_war")
      );
      if (teamIndex < 0 || warIndex < 0) continue;
      for (const match of matches.slice(1)) {
        const cells = cellsFromRow(match[1]);
        const team = cells[teamIndex];
        const war = numeric(cells[warIndex]);
        if (team && !NON_TEAM_ROW.test(team) && war != null && !rows.has(team)) {
          rows.set(team, war);
        }
      }
      if (rows.size) break;
    }
    return rows;
  };
  const batting = parseRows(battingHtml);
  const pitching = parseRows(pitchingHtml);
  const names = new Set([...batting.keys(), ...pitching.keys()]);
  return {
    season,
    teams: [...names].map(team => ({
      team,
      battingWAR: batting.get(team) ?? null,
      pitchingWAR: pitching.get(team) ?? null,
      totalWAR:
        batting.has(team) && pitching.has(team)
          ? Number((batting.get(team) + pitching.get(team)).toFixed(1))
          : null,
    })),
  };
}

export function parseBaseballReferenceTeamWarHtml(html, season = currentMlbSeason()) {
  const teams = [];
  const seen = new Set();
  const strip = value => String(value || "")
    .replace(/<[^<>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Expand colspan so a header like <th colspan=2> keeps later columns aligned
  // with their data cells.
  const expandedCells = (rowHtml, transform) => {
    const out = [];
    for (const match of closedBlocks(rowHtml, CELL_WITH_ATTRS_BLOCK, CELL_CLOSE)) {
      const span = Math.min(
        Math.max(Number((match[2].match(/colspan\s*=\s*["']?(\d+)/i) || [])[1]) || 1, 1),
        20
      );
      const value = transform(strip(match[3]));
      for (let i = 0; i < span; i += 1) out.push(value);
    }
    return out;
  };
  const tables = tablesFromHtml(html);
  for (const tableHtml of tables) {
    const rows = closedBlocks(tableHtml, ROW_BLOCK, ROW_CLOSE);
    // The real header row is the one that names a WAR or team column; an
    // over-header row (grouped columns) must not be mistaken for it.
    let headers = [];
    for (const row of rows) {
      if (!/<th/i.test(row[1])) continue;
      const candidate = expandedCells(row[1], value => value.toLowerCase());
      if (candidate.some(h => /war|^tm$|^team$/.test(h))) {
        headers = candidate;
        break;
      }
    }
    const warHeaderIndex = headers.findIndex(header => /^(t?war|total war|war total)$/.test(header));
    const defensiveIndex = headers.findIndex(header => /def|fld|field|dwar/.test(header) && !/off/.test(header));
    const columnIndex = pattern => headers.findIndex(header => pattern.test(header));
    // FanGraphs' "batting WAR" is position-player WAR (it includes defense and
    // positional adjustment), so only a comparable Baseball-Reference column may
    // fill battingWAR. oWAR is the offence-only component: keep it separate and
    // never average it with FanGraphs batting WAR.
    const battingIndex = columnIndex(/^(batting war|bat war|position war|position players war|pos war)$/);
    const offensiveIndex = columnIndex(/^(owar|offensive war|off war)$/);
    const pitchingIndex = columnIndex(/^(pitching war|pit war|pwar)$/);
    for (const rowMatch of rows) {
      const rowHtml = rowMatch[1];
      const teamLink = upToLastClose(rowHtml, ANCHOR_CLOSE).match(new RegExp(`<a[^<>]+href=["']/teams/[^/<>]+/${season}\\.shtml[^"'<>]*["'][^<>]*>([\\s\\S]*?)<\\/a>`, "i"));
      if (!teamLink) continue;
      const team = strip(teamLink[1]);
      if (!team || NON_TEAM_ROW.test(team) || seen.has(team)) continue;
      const cells = expandedCells(rowHtml, value => value);
      const teamIndex = cells.findIndex(cell => cell === team);
      const at = index => (index >= 0 && index < cells.length ? numeric(cells[index]) : null);
      const totalWar = warHeaderIndex >= 0 && warHeaderIndex < cells.length
        ? at(warHeaderIndex)
        : teamIndex >= 0 ? at(teamIndex + 1) : null;
      if (totalWar == null) continue;
      const defensiveWAR = at(defensiveIndex);
      const offensiveWAR = at(offensiveIndex);
      seen.add(team);
      teams.push({
        team,
        battingWAR: at(battingIndex),
        pitchingWAR: at(pitchingIndex),
        totalWAR: totalWar,
        ...(defensiveWAR != null ? { defensiveWAR } : {}),
        ...(offensiveWAR != null ? { offensiveWAR } : {}),
        season,
      });
    }
  }
  return teams;
}

async function loadBaseballReferenceAggregateWar(season) {
  const sourceUrl = BASEBALL_REFERENCE_TEAM_WAR_URL(season);
  const html = await fetchHtml(sourceUrl);
  const teams = parseBaseballReferenceTeamWarHtml(html, season);
  if (!teams.length) {
    const error = new Error("Baseball-Reference aggregate Team WAR unavailable");
    error.status = 502;
    throw error;
  }
  return {
    found: true,
    season,
    teams,
    source: "Baseball-Reference",
    sourceUrls: { aggregate: sourceUrl },
    retrievedAt: new Date().toISOString(),
    freshness: "live",
    fallback: true,
    statuses: { batting: "not-provided", pitching: "not-provided", teamWar: "fallback-live" },
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const retryAfterMs =
      response.status === 429 ? parseRetryAfterMs(response) : 0;
    let providerBlocked = false;
    if (response.status === 403) {
      const body = await response.text().catch(() => '');
      providerBlocked = isFanGraphsProviderBlockedResponse(response.status, body);
    }
    throw Object.assign(
      new Error(`FanGraphs returned HTTP ${response.status}`),
      { status: response.status, retryAfterMs, providerBlocked }
    );
  }
  return response.text();
}

export async function loadAggregateWar(season) {
  const key = String(season);
  let cached = aggregateWarCache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return { data: cached.data, cache: "HIT" };
  if (process.env.NODE_ENV !== "test" && (!cached || cached.expiresAt <= Date.now())) {
    const durable = await readDurableCache(durableFanGraphsKey(`aggregate-blended-v3:${season}`));
    if (durable) {
      cached = {
        data: durable.data,
        expiresAt: new Date(durable.freshUntil).getTime(),
        staleExpiresAt: new Date(durable.staleUntil).getTime(),
      };
      aggregateWarCache.set(key, cached);
      if (cached.expiresAt > Date.now()) return { data: cached.data, cache: "DURABLE-HIT" };
    }
  }
  const day = utcDayKey();
  const existing = aggregateWarInFlight.get(key);
  if (existing) return { data: await existing, cache: "COALESCED" };
  if (hasAttemptedProviderToday(aggregateDailyAttemptDay.get(key), Date.now())) {
    if (cached) return { data: { ...cached.data, freshness: 'daily-cached' }, cache: 'DAILY' };
    const error = new Error('FanGraphs aggregate daily refresh already attempted');
    error.status = 503;
    throw error;
  }
  if (fanGraphsCooldownUntil > Date.now()) {
    if (cached && cached.staleExpiresAt > Date.now())
      return {
        data: {
          ...cached.data,
          freshness: "stale-cached",
          staleReason: "FanGraphs rate limit cooldown",
        },
        cache: "STALE",
      };
    const error = new Error("FanGraphs aggregate rate limit cooldown active");
    error.status = 429;
    error.retryAfter = Math.ceil((fanGraphsCooldownUntil - Date.now()) / 1000);
    throw error;
  }
  aggregateDailyAttemptDay.set(key, day);
  const request = (async () => {
    // Baseball-Reference is independent of FanGraphs, so start it now instead of
    // after FanGraphs finishes: cold-load latency becomes max(FG, BR) rather than
    // FG + BR. Still exactly one BR request per refresh (it also serves as the
    // fallback below). The attempt is wrapped so it can never reject: an early BR
    // failure must not become an unhandled rejection while FanGraphs is pending.
    const baseballReferenceAttempt = loadBaseballReferenceAggregateWar(season).then(
      value => value,
      () => null
    );
    const [battingResult, pitchingResult] = await Promise.allSettled([
      fetchHtml(AGGREGATE_WAR_URL(season, "bat")),
      fetchHtml(AGGREGATE_WAR_URL(season, "pit")),
    ]);
    const throttled = [battingResult, pitchingResult].filter(
      result => result.status === "rejected" && result.reason?.status === 429
    );
    if (throttled.length)
      fanGraphsCooldownUntil = Math.max(
        fanGraphsCooldownUntil,
        Date.now() +
          Math.max(
            ...throttled.map(
              result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
            )
          )
      );
    const parsed = parseFanGraphsAggregateWarHtml(
      {
        battingHtml:
          battingResult.status === "fulfilled" ? battingResult.value : "",
        pitchingHtml:
          pitchingResult.status === "fulfilled" ? pitchingResult.value : "",
      },
      season
    );
    const hasRows = parsed.teams.some(team => team.totalWAR != null);
    if (!hasRows) {
      const baseballReference = await baseballReferenceAttempt;
      if (baseballReference) {
        return {
          ...baseballReference,
          providerSnapshots: {
            fanGraphs: null,
            baseballReference,
          },
        };
      }
      // Preserve the FanGraphs error contract when both providers fail.
      // The caller will serve an already-cached aggregate snapshot if one exists.
      const providerBlocked = [battingResult, pitchingResult].some(
        result => result.status === "rejected" && result.reason?.providerBlocked
      );
      const error = new Error(
        providerBlocked
          ? "FanGraphs provider blocked the aggregate WAR request"
          : "FanGraphs aggregate Team WAR unavailable"
      );
      error.status = throttled.length ? 429 : 502;
      error.providerBlocked = providerBlocked;
      if (throttled.length)
        error.retryAfter = Math.ceil(
          Math.max(
            ...throttled.map(
              result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
            )
          ) / 1000
        );
      throw error;
    }
    const baseballReference = await baseballReferenceAttempt;
    const fanGraphs = {
      found: hasRows,
      season,
      teams: parsed.teams,
      source: "FanGraphs",
      sourceUrls: {
        batting: AGGREGATE_WAR_URL(season, "bat"),
        pitching: AGGREGATE_WAR_URL(season, "pit"),
      },
      retrievedAt: new Date().toISOString(),
      freshness: "live",
    };
    return {
      ...fanGraphs,
      providerSnapshots: { fanGraphs, baseballReference },
      statuses: {
        batting:
          battingResult.status === "fulfilled" && battingResult.value
            ? "live"
            : "upstream-unavailable",
        pitching:
          pitchingResult.status === "fulfilled" && pitchingResult.value
            ? "live"
            : "upstream-unavailable",
        baseballReference: baseballReference ? "live" : "upstream-unavailable",
      },
    };
  })();
  aggregateWarInFlight.set(key, request);
  try {
    const data = await request;
      const expiresAt = nextUtcMidnightMs();
      const staleExpiresAt = expiresAt + STALE_TTL_MS;
      aggregateWarCache.set(key, {
        data,
        expiresAt,
        staleExpiresAt,
      });
      void writeDurableCache({
        cacheKey: durableFanGraphsKey(`aggregate-blended-v3:${season}`),
        source: data.source || 'FanGraphs',
        data,
        freshUntil: new Date(expiresAt),
        staleUntil: new Date(staleExpiresAt),
        lastAttemptDay: day,
      });
    return { data, cache: "MISS" };
  } catch (error) {
    if (cached && cached.staleExpiresAt > Date.now())
      return {
        data: {
          ...cached.data,
          freshness: "stale-cached",
          staleReason:
            error.status === 429
              ? "FanGraphs rate limit"
              : "FanGraphs upstream unavailable",
        },
        cache: "STALE",
      };
    throw error;
  } finally {
    if (aggregateWarInFlight.get(key) === request)
      aggregateWarInFlight.delete(key);
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "https://placeholder.invalid");
  const teamAbbr = String(url.searchParams.get("team") || "")
    .trim()
    .toUpperCase();
  const seasonValue = Number(url.searchParams.get("season") || currentMlbSeason());
  const season = Number.isInteger(seasonValue) ? seasonValue : currentMlbSeason();
  // Each distinct season is an upstream fetch and a cache key; bound it.
  if (!isPlausibleSeason(season)) {
    return res.status(400).json({
      error: `season must be an integer from 1901 to ${currentMlbSeason() + 1}`,
    });
  }
  if (url.searchParams.get("mode") === "aggregate") {
    if (isRateLimited(req, "fangraphs")) return rateLimitResponse(res);
    try {
      const result = await loadAggregateWar(season);
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=1800"
      );
      res.setHeader("X-Provider-Cache", result.cache);
      return res
        .status(200)
        .json({ ...result.data, servedAt: new Date().toISOString() });
    } catch (error) {
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
          return res
        .status(error?.status || 502)
        .json({
          found: false,
          season,
          teams: [],
          statuses: { batting: "unavailable", pitching: "unavailable" },
          providerBlocked: Boolean(error?.providerBlocked),
          error: error?.providerBlocked
            ? "FanGraphs provider blocked the aggregate WAR request"
            : "FanGraphs aggregate Team WAR unavailable",
        });
    }
  }
  if (!TEAM_CODE.test(teamAbbr))
    return res
      .status(400)
      .json({ error: "Missing or invalid team abbreviation" });

  const key = modelKey(teamAbbr, season);
  let cached = modelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=1800"
    );
    res.setHeader("X-Provider-Cache", "HIT");
    return res
      .status(200)
      .json({
        ...cached.data,
        freshness: "cached",
        servedAt: new Date().toISOString(),
      });
  }
  if (process.env.NODE_ENV !== "test" && (!cached || cached.expiresAt <= Date.now())) {
    const durable = await readDurableCache(durableFanGraphsKey(`model:${teamAbbr}:${season}`));
    if (durable) {
      cached = {
        data: durable.data,
        expiresAt: new Date(durable.freshUntil).getTime(),
        staleExpiresAt: new Date(durable.staleUntil).getTime(),
      };
      modelCache.set(key, cached);
      if (cached.expiresAt > Date.now()) {
        res.setHeader('X-Provider-Cache', 'DURABLE-HIT');
        return res.status(200).json({ ...cached.data, freshness: 'cached', servedAt: new Date().toISOString() });
      }
    }
  }

  const day = utcDayKey();
  const existing = modelInFlight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=900, stale-while-revalidate=1800"
      );
      res.setHeader("X-Provider-Cache", "COALESCED");
      return res
        .status(200)
        .json({
          ...data,
          freshness: "live",
          servedAt: new Date().toISOString(),
        });
    } catch (error) {
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      return res
        .status(error?.status || 502)
        .json(error?.payload || { error: "FanGraphs request failed" });
    }
  }

  if (hasAttemptedProviderToday(modelDailyAttemptDay.get(key), Date.now())) {
    if (cached) {
      res.setHeader('X-Provider-Cache', 'DAILY');
      return res.status(200).json({ ...cached.data, freshness: 'daily-cached', servedAt: new Date().toISOString() });
    }
    const staleDaily = staleModel(cached);
    if (staleDaily) {
      res.setHeader('X-Provider-Cache', 'STALE');
      return res.status(200).json({ ...staleDaily.data, freshness: 'stale-cached', servedAt: new Date().toISOString(), staleReason: 'FanGraphs daily refresh already attempted' });
    }
    return res.status(503).json({ error: 'FanGraphs daily refresh already attempted', retryAfter: Math.ceil((nextUtcMidnightMs() - Date.now()) / 1000) });
  }

  const stale = staleModel(cached);
  if (fanGraphsCooldownUntil > Date.now()) {
    if (stale) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res
        .status(200)
        .json({
          ...stale.data,
          freshness: "stale-cached",
          servedAt: new Date().toISOString(),
          staleReason: "FanGraphs rate limit cooldown",
        });
    }
    const retryAfter = Math.ceil((fanGraphsCooldownUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({ error: "FanGraphs rate limit cooldown active", retryAfter });
  }
  const failureUntil = modelFailureCooldownUntil.get(key) || 0;
  if (failureUntil > Date.now()) {
    if (stale) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res
        .status(200)
        .json({
          ...stale.data,
          freshness: "stale-cached",
          servedAt: new Date().toISOString(),
          staleReason: "FanGraphs recent upstream failure",
        });
    }
    const retryAfter = Math.ceil((failureUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(503)
      .json({
        error: "FanGraphs temporary upstream cooldown active",
        retryAfter,
      });
  }
  if (failureUntil) modelFailureCooldownUntil.delete(key);

  if (isRateLimited(req, "fangraphs")) return rateLimitResponse(res);
  modelDailyAttemptDay.set(key, day);
  const upstreamRequest = (async () => {
    const retrievedAt = new Date().toISOString();
    const [oddsResult, warResult] = await Promise.allSettled([
      fetchHtml(ODDS_URL),
      fetchHtml(WAR_URL),
    ]);
    const throttledResults = [oddsResult, warResult].filter(
      result => result.status === "rejected" && result.reason?.status === 429
    );
    const rateLimited = throttledResults.length > 0;
    if (rateLimited) {
      const cooldownMs = Math.max(
        ...throttledResults.map(
          result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
        )
      );
      fanGraphsCooldownUntil = Math.max(
        fanGraphsCooldownUntil,
        Date.now() + cooldownMs
      );
    }
    const parsed = parseFanGraphsModelHtml(
      {
        oddsHtml: oddsResult.status === "fulfilled" ? oddsResult.value : "",
        warHtml: warResult.status === "fulfilled" ? warResult.value : "",
      },
      teamAbbr,
      season
    );
    if (
      !parsed.found &&
      oddsResult.status === "rejected" &&
      warResult.status === "rejected"
    ) {
      const retryAfter = rateLimited
        ? Math.ceil(
            Math.max(
              ...throttledResults.map(
                result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS
              )
            ) / 1000
          )
        : undefined;
      const providerBlocked = [oddsResult, warResult].some(
        result => result.status === "rejected" && result.reason?.providerBlocked
      );
      throw {
        status: rateLimited ? 429 : 502,
        retryAfter,
        providerBlocked,
        payload: {
          error: rateLimited
            ? "FanGraphs rate limited both model sources"
            : providerBlocked
              ? "FanGraphs provider blocked the model request"
              : "FanGraphs model sources unavailable",
          providerBlocked,
        },
      };
    }
    return {
      found: parsed.playoffOdds != null || parsed.teamWar != null,
      retrievedAt,
      source: parsed.source,
      sourceUrls: parsed.sourceUrls,
      season,
      teamAbbr,
      playoffOdds: parsed.playoffOdds,
      teamWar: parsed.teamWar,
      advancedMetrics: parsed.advancedMetrics,
      statuses: {
        playoffOdds:
          parsed.playoffOdds != null
            ? "live"
            : oddsResult.status === "fulfilled"
              ? "unparsed"
              : "upstream-unavailable",
        teamWar:
          parsed.teamWar != null
            ? "live"
            : warResult.status === "fulfilled"
              ? "unparsed"
              : "upstream-unavailable",
      },
      freshness: "live",
    };
  })();
  modelInFlight.set(key, upstreamRequest);
  try {
    const data = await upstreamRequest;
    modelFailureCooldownUntil.delete(key);
    const expiresAt = nextUtcMidnightMs();
    const staleExpiresAt = expiresAt + STALE_TTL_MS;
    modelCache.set(key, {
      data,
      expiresAt,
      staleExpiresAt,
    });
    void writeDurableCache({
      cacheKey: durableFanGraphsKey(`model:${teamAbbr}:${season}`),
      source: 'FanGraphs',
      data,
      freshUntil: new Date(expiresAt),
      staleUntil: new Date(staleExpiresAt),
      lastAttemptDay: day,
    });
    if (modelCache.size > 200)
      modelCache.delete(modelCache.keys().next().value);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=1800"
    );
    res.setHeader("X-Provider-Cache", "MISS");
    return res
      .status(200)
      .json({ ...data, servedAt: new Date().toISOString() });
  } catch (error) {
    if (error?.status >= 500)
      modelFailureCooldownUntil.set(
        key,
        Date.now() + FANGRAPHS_FAILURE_COOLDOWN_MS
      );
    const fallback = staleModel(cached);
    if (fallback) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      res.setHeader("X-Provider-Cache", "STALE");
      return res
        .status(200)
        .json({
          ...fallback.data,
          freshness: "stale-cached",
          servedAt: new Date().toISOString(),
            staleReason:
              error?.status === 429
                ? "FanGraphs rate limit"
                : error?.providerBlocked
                  ? "FanGraphs provider blocked the request"
                  : "FanGraphs upstream unavailable",
        });
    }
    if (error?.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    return res
      .status(error?.status || 502)
      .json(error?.payload || { error: "FanGraphs request failed" });
  } finally {
    if (modelInFlight.get(key) === upstreamRequest) modelInFlight.delete(key);
  }
}
