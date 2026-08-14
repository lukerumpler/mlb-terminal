import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';

const DEFAULT_SEASON = 2026;
const TEAM_CODE = /^[A-Z]{2,3}$/;
const ODDS_URL = 'https://www.fangraphs.com/standings/playoff-odds/fg/mlb';
const WAR_URL = 'https://www.fangraphs.com/depthcharts.aspx?position=Team';
const UA = 'Mozilla/5.0 (compatible; SKIPBaseball/1.0)';
const CACHE_TTL_MS = 15 * 60_000;
const STALE_TTL_MS = 60 * 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const modelCache = new Map();
const modelInFlight = new Map();
let fanGraphsCooldownUntil = 0;

function parseRetryAfterMs(response) {
  const value = response?.headers?.get?.('Retry-After');
  if (!value) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1_000, Math.min(120_000, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, Math.min(120_000, date - Date.now())) : DEFAULT_COOLDOWN_MS;
}

function modelKey(teamAbbr, season) {
  return `${teamAbbr}:${season}`;
}

function staleModel(cacheEntry) {
  return cacheEntry && cacheEntry.staleExpiresAt > Date.now() ? cacheEntry : null;
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellsFromRow(row) {
  return [...String(row || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => stripTags(match[1]));
}

function tablesFromHtml(html) {
  return [...String(html || '').matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map(match => match[1]);
}

function numeric(value) {
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function findTeamRow(html, teamAbbr) {
  const upper = String(teamAbbr).toUpperCase();
  for (const table of tablesFromHtml(html)) {
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(cell => new RegExp(`(?:^|\\s)${upper}(?:\\s|$)`, 'i').test(cell))) return cells;
    }
  }
  return null;
}

function parsePercentage(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function normalizeMetricKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function findTeamRowDetails(html, teamAbbr) {
  const upper = String(teamAbbr).toUpperCase();
  for (const table of tablesFromHtml(html)) {
    const headerMatch = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const headers = headerMatch ? cellsFromRow(headerMatch[1]) : [];
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = cellsFromRow(row[1]);
      if (cells.some(cell => new RegExp(`(?:^|\\s)${upper}(?:\\s|$)`, 'i').test(cell))) {
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

export function parseFanGraphsModelHtml({ oddsHtml, warHtml }, teamAbbr, season = DEFAULT_SEASON) {
  const oddsDetails = findTeamRowDetails(oddsHtml, teamAbbr);
  const warDetails = findTeamRowDetails(warHtml, teamAbbr);
  const oddsRow = oddsDetails?.cells || findTeamRow(oddsHtml, teamAbbr);
  const warRow = warDetails?.cells || findTeamRow(warHtml, teamAbbr);
  const playoffOdds = oddsRow ? oddsRow.map(parsePercentage).find(value => value != null) ?? null : null;
  const teamWar = warRow ? warRow.map(numeric).find(value => value != null) ?? null : null;
  const metrics = { ...(oddsDetails?.metrics || {}), ...(warDetails?.metrics || {}) };
  const pick = (...keys) => keys.map(key => metrics[key]).find(value => value != null) ?? null;
  return {
    playoffOdds,
    teamWar,
    season,
    teamAbbr,
    source: 'FanGraphs',
    sourceUrls: { playoffOdds: ODDS_URL, teamWar: WAR_URL },
    advancedMetrics: {
      projectedWins: pick('projected_wins', 'wins', 'w'),
      projectedLosses: pick('projected_losses', 'losses', 'l'),
      projectedRuns: pick('projected_runs', 'runs', 'r'),
      projectedRunsAllowed: pick('projected_runs_allowed', 'runs_allowed', 'ra'),
      offenseWar: pick('offense_war', 'off_war', 'batting_war'),
      defenseWar: pick('defense_war', 'def_war', 'fielding_war'),
      bullpenWar: pick('bullpen_war', 'relief_war'),
      projectedWrcPlus: pick('projected_wrc_plus', 'wrc_plus'),
      projectedFip: pick('projected_fip', 'fip'),
    },
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const retryAfterMs = response.status === 429 ? parseRetryAfterMs(response) : 0;
    throw Object.assign(new Error(`FanGraphs returned HTTP ${response.status}`), { status: response.status, retryAfterMs });
  }
  return response.text();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = new URL(req.url, 'https://placeholder.invalid');
  const teamAbbr = String(url.searchParams.get('team') || '').trim().toUpperCase();
  const seasonValue = Number(url.searchParams.get('season') || DEFAULT_SEASON);
  const season = Number.isInteger(seasonValue) ? seasonValue : DEFAULT_SEASON;
  if (!TEAM_CODE.test(teamAbbr)) return res.status(400).json({ error: 'Missing or invalid team abbreviation' });

  const key = modelKey(teamAbbr, season);
  const cached = modelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.setHeader('X-Provider-Cache', 'HIT');
    return res.status(200).json({ ...cached.data, freshness: 'cached', servedAt: new Date().toISOString() });
  }

  const existing = modelInFlight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
      res.setHeader('X-Provider-Cache', 'COALESCED');
      return res.status(200).json({ ...data, freshness: 'live', servedAt: new Date().toISOString() });
    } catch (error) {
      if (error?.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(error?.status || 502).json(error?.payload || { error: 'FanGraphs request failed' });
    }
  }

  const stale = staleModel(cached);
  if (fanGraphsCooldownUntil > Date.now()) {
    if (stale) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-Provider-Cache', 'STALE');
      return res.status(200).json({ ...stale.data, freshness: 'stale-cached', servedAt: new Date().toISOString(), staleReason: 'FanGraphs rate limit cooldown' });
    }
    const retryAfter = Math.ceil((fanGraphsCooldownUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'FanGraphs rate limit cooldown active', retryAfter });
  }

  if (isRateLimited(req, 'fangraphs')) return rateLimitResponse(res);
  const upstreamRequest = (async () => {
    const retrievedAt = new Date().toISOString();
    const [oddsResult, warResult] = await Promise.allSettled([fetchHtml(ODDS_URL), fetchHtml(WAR_URL)]);
    const throttledResults = [oddsResult, warResult].filter(result => result.status === 'rejected' && result.reason?.status === 429);
    const rateLimited = throttledResults.length > 0;
    if (rateLimited) {
      const cooldownMs = Math.max(...throttledResults.map(result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS));
      fanGraphsCooldownUntil = Math.max(fanGraphsCooldownUntil, Date.now() + cooldownMs);
    }
    const parsed = parseFanGraphsModelHtml({
      oddsHtml: oddsResult.status === 'fulfilled' ? oddsResult.value : '',
      warHtml: warResult.status === 'fulfilled' ? warResult.value : '',
    }, teamAbbr, season);
    if (!parsed.found && oddsResult.status === 'rejected' && warResult.status === 'rejected') {
      const retryAfter = rateLimited ? Math.ceil(Math.max(...throttledResults.map(result => result.reason?.retryAfterMs || DEFAULT_COOLDOWN_MS)) / 1000) : undefined;
      throw { status: rateLimited ? 429 : 502, retryAfter, payload: { error: rateLimited ? 'FanGraphs rate limited both model sources' : 'FanGraphs model sources unavailable' } };
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
        playoffOdds: parsed.playoffOdds != null ? 'live' : oddsResult.status === 'fulfilled' ? 'unparsed' : 'upstream-unavailable',
        teamWar: parsed.teamWar != null ? 'live' : warResult.status === 'fulfilled' ? 'unparsed' : 'upstream-unavailable',
      },
      freshness: 'live',
    };
  })();
  modelInFlight.set(key, upstreamRequest);
  try {
    const data = await upstreamRequest;
    modelCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS, staleExpiresAt: Date.now() + CACHE_TTL_MS + STALE_TTL_MS });
    if (modelCache.size > 200) modelCache.delete(modelCache.keys().next().value);
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.setHeader('X-Provider-Cache', 'MISS');
    return res.status(200).json({ ...data, servedAt: new Date().toISOString() });
  } catch (error) {
    const fallback = staleModel(cached);
    if (fallback) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-Provider-Cache', 'STALE');
      return res.status(200).json({ ...fallback.data, freshness: 'stale-cached', servedAt: new Date().toISOString(), staleReason: error?.status === 429 ? 'FanGraphs rate limit' : 'FanGraphs upstream unavailable' });
    }
    if (error?.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    return res.status(error?.status || 502).json(error?.payload || { error: 'FanGraphs request failed' });
  } finally {
    if (modelInFlight.get(key) === upstreamRequest) modelInFlight.delete(key);
  }
}
