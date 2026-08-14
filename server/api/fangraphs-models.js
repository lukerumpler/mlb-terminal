import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';

const DEFAULT_SEASON = 2026;
const TEAM_CODE = /^[A-Z]{2,3}$/;
const ODDS_URL = 'https://www.fangraphs.com/standings/playoff-odds/fg/mlb';
const WAR_URL = 'https://www.fangraphs.com/depthcharts.aspx?position=Team';
const UA = 'Mozilla/5.0 (compatible; SKIPBaseball/1.0)';

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
  if (!response.ok) throw new Error(`FanGraphs returned HTTP ${response.status}`);
  return response.text();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (isRateLimited(req, 'fangraphs')) return rateLimitResponse(res);
  const url = new URL(req.url, 'https://placeholder.invalid');
  const teamAbbr = String(url.searchParams.get('team') || '').trim().toUpperCase();
  const seasonValue = Number(url.searchParams.get('season') || DEFAULT_SEASON);
  const season = Number.isInteger(seasonValue) ? seasonValue : DEFAULT_SEASON;
  if (!TEAM_CODE.test(teamAbbr)) return res.status(400).json({ error: 'Missing or invalid team abbreviation' });

  const retrievedAt = new Date().toISOString();
  const [oddsResult, warResult] = await Promise.allSettled([fetchHtml(ODDS_URL), fetchHtml(WAR_URL)]);
  const parsed = parseFanGraphsModelHtml({
    oddsHtml: oddsResult.status === 'fulfilled' ? oddsResult.value : '',
    warHtml: warResult.status === 'fulfilled' ? warResult.value : '',
  }, teamAbbr, season);
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  return res.status(200).json({
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
  });
}
