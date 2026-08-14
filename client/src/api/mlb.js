// SKIP — MLB + MiLB Stats API Client
import { inferMlbFeedKey, recordFeedSuccess } from '../lib/feedFreshness.js';

// All requests route through /api/mlb (Vercel serverless proxy) to avoid CORS.
// Same MLB Stats API serves both MLB and all MiLB levels via sportId/levelIds.
//
// SPORT / LEVEL IDs:
//   1     = MLB          11 = Triple-A     12 = Double-A
//   13    = High-A       14 = Single-A     15 = Low-A
//   5442  = Rookie Adv.  16 = Rookie       17 = Winter League
//
// KEY ENDPOINTS:
//   /schedule?sportId=1&date=YYYY-MM-DD&hydrate=linescore,team   → today's games
//   /schedule?sportIds=11,12&date=YYYY-MM-DD                     → MiLB games
//   /standings?leagueId=103,104&season=YYYY                      → MLB standings
//   /standings?leagueId=117,112&season=YYYY                      → Triple-A standings
//   /stats/leaders?leaderCategories=homeRuns&sportId=1           → MLB leaders
//   /stats/leaders?leaderCategories=homeRuns&sportId=11          → Triple-A leaders
//   /people/search?names=QUERY                                    → player search
//   /people/{id}?hydrate=currentTeam                             → player profile
//   /people/{id}/stats?stats=season&group=hitting&season=YYYY    → season stats
//   /people/{id}/stats?stats=yearByYear&group=hitting            → career (all levels)
//   /teams?sportId=1                                             → all MLB teams
//   /teams/{id}/affiliates                                        → farm system
//   /game/{gamePk}/linescore                                     → live linescore
//   /game/{gamePk}/boxscore                                      → full boxscore
//   /game/{gamePk}/playByPlay                                    → PBP (MLB + MiLB)

const BASE   = '/api/mlb';
export const SEASON = 2026;

// MiLB league IDs for standings calls
export const MILB_LEAGUES = {
  tripleA: { ids: '117,112', name: 'Triple-A'  }, // International + Pacific Coast
  doubleA: { ids: '113,110,111', name: 'Double-A' },
  highA:   { ids: '214,215,223', name: 'High-A'  },
  singleA: { ids: '302,303',     name: 'Single-A' },
};

// MiLB sportId values
export const MILB_LEVELS = {
  tripleA: 11, doubleA: 12, highA: 13,
  singleA: 14, lowA: 15, rookie: 16, winter: 17,
};

// ─── Request cache / in-flight de-dupe / rate-limit guard ───────────────────
// Several pages (App's live ticker, OverviewPage, LeaguePage) independently
// call the same endpoints within milliseconds of each other. A short cache
// and in-flight de-dupe collapse identical work, while the small client-side
// queue keeps a page transition from bursting past the proxy's per-IP limit.
// The queue is deliberately below the server limit because other SKIP feeds
// share the same browser session and the proxy is best-effort across warm
// instances.
const CACHE_TTL_MS = 20_000;
const STALE_CACHE_TTL_MS = 10 * 60_000;
const CLIENT_WINDOW_MS = 10_000;
const CLIENT_MAX_REQUESTS_PER_WINDOW = 18;
const CLIENT_MAX_CONCURRENT = 4;
const cache    = new Map(); // key -> { data, expires, staleExpires }
const inFlight = new Map(); // key -> Promise
const requestQueue = [];
const requestStarts = [];
let activeRequests = 0;
let queueTimer = null;
let proxyCooldownUntil = 0;

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return undefined;
}

function staleCacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.staleExpires > Date.now()) return hit.data;
  if (hit && hit.staleExpires <= Date.now()) cache.delete(key);
  return undefined;
}

function parseRetryAfterMs(response) {
  const value = response?.headers?.get?.('Retry-After');
  if (!value) return 10_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1_000, Math.min(60_000, seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, Math.min(60_000, date - Date.now())) : 10_000;
}

function pumpRequestQueue() {
  if (queueTimer != null) return;
  const now = Date.now();
  while (requestStarts.length && now - requestStarts[0] >= CLIENT_WINDOW_MS) requestStarts.shift();
  const nextAllowedAt = Math.max(
    proxyCooldownUntil,
    requestStarts.length >= CLIENT_MAX_REQUESTS_PER_WINDOW ? requestStarts[0] + CLIENT_WINDOW_MS + 25 : now,
  );
  if (!requestQueue.length || activeRequests >= CLIENT_MAX_CONCURRENT) return;
  if (nextAllowedAt > now) {
    queueTimer = globalThis.setTimeout(() => {
      queueTimer = null;
      pumpRequestQueue();
    }, Math.max(25, nextAllowedAt - now));
    return;
  }

  const job = requestQueue.shift();
  activeRequests += 1;
  requestStarts.push(now);
  fetch(job.url, { signal: AbortSignal.timeout(job.timeoutMs) })
    .then(response => {
      if (response.status === 429) {
        proxyCooldownUntil = Math.max(proxyCooldownUntil, Date.now() + parseRetryAfterMs(response));
      }
      job.resolve(response);
    }, job.reject)
    .finally(() => {
      activeRequests -= 1;
      pumpRequestQueue();
    })
    .catch(() => {});
  pumpRequestQueue();
}

function scheduledFetch(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ url, timeoutMs, resolve, reject });
    pumpRequestQueue();
  });
}

export function __resetMlbClientStateForTests() {
  cache.clear();
  inFlight.clear();
  requestQueue.splice(0, requestQueue.length);
  requestStarts.splice(0, requestStarts.length);
  activeRequests = 0;
  proxyCooldownUntil = 0;
  if (queueTimer != null) {
    globalThis.clearTimeout(queueTimer);
    queueTimer = null;
  }
}

class MlbProxyError extends Error {
  constructor(status, path, retryAfterMs = 0) {
    super(`MLB API ${status} — ${path}`);
    this.name = 'MlbProxyError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.rateLimited = status === 429;
  }
}

// ─── Core fetcher ─────────────────────────────────────────────────────────
// Keeps commas unencoded in hydrate strings so MLB receives them intact.
export async function mlb(path, params = {}, { cache: useCache = true, ttl = CACHE_TTL_MS, timeoutMs = 10_000, quietStatuses = [] } = {}) {
  const extraQs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v)).replace(/%2C/g, ',')}`)
    .join('&');
  const url = `${BASE}?path=${encodeURIComponent(path)}${extraQs ? '&' + extraQs : ''}`;

  if (useCache) {
    const cached = cacheGet(url);
    if (cached !== undefined) return cached;
    const pending = inFlight.get(url);
    if (pending) return pending;
  }

  const request = (async () => {
    let res;
    try {
      res = await scheduledFetch(url, timeoutMs);
    } catch (error) {
      const stale = useCache ? staleCacheGet(url) : undefined;
      if (stale !== undefined) return stale;
      throw error;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const retryAfterMs = res.status === 429 ? parseRetryAfterMs(res) : 0;
      if (res.status === 429) {
        proxyCooldownUntil = Math.max(proxyCooldownUntil, Date.now() + retryAfterMs);
        const stale = useCache ? staleCacheGet(url) : undefined;
        if (stale !== undefined) {
          console.warn('[mlb] proxy rate limit; using verified cached response', path);
          return stale;
        }
        console.warn('[mlb] proxy rate limit; pausing MLB requests', path);
      } else if (quietStatuses.includes(res.status)) {
        console.warn('[mlb] expected upstream unavailable response', res.status, path);
      } else {
        console.error('[mlb] proxy error', res.status, url, body.slice(0, 200));
      }
      throw new MlbProxyError(res.status, path, retryAfterMs);
    }
    // A 200 with a non-JSON body (misconfigured proxy, a dev-only routing
    // quirk, an unexpected upstream change) used to throw a raw SyntaxError
    // straight out of res.json() — and that error's own .message ends up
    // shown to the user verbatim (PlayersPage.jsx: `Could not load ${name}.
    // ${err.message}`), so it surfaced as literal parser noise like
    // `Unexpected token '/', "/**..." is not valid JSON` instead of a
    // readable message. Found via a debug pass. Not a production failure
    // mode this reproduces on its own, but the missing defensive handling
    // was real regardless of what triggers it.
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`MLB API returned an unreadable response — ${path}`);
    }
    if (useCache) {
      const expires = Date.now() + ttl;
      cache.set(url, { data, expires, staleExpires: expires + STALE_CACHE_TTL_MS });
    }
    recordFeedSuccess(inferMlbFeedKey(path));
    return data;
  })();

  if (useCache) {
    inFlight.set(url, request);
    // .finally() returns a *new* derived promise that also rejects when
    // `request` does — and since nothing else references or catches that
    // specific derived promise, it surfaces as an unhandled rejection on
    // every failed request, independent of and in addition to whatever the
    // caller does with the `request` reference actually returned below.
    request.finally(() => inFlight.delete(url)).catch(() => {});
  }
  return request;
}

// Full-roster leaderboard endpoints (Savant expected_statistics, bat-tracking,
// statcast_leaderboard, sprint_speed, oaa) return every player's row just so
// the caller can pick out one — hundreds of rows parsed and transferred to
// find a single match. Worse, every one of those calls previously used a raw
// fetch() instead of the cache above, so searching for 5 different players
// within a few seconds of each other re-fetched and re-parsed the exact same
// multi-hundred-row CSV response 5 separate times. These leaderboards don't
// meaningfully change more than every few minutes, so a longer TTL than the
// live-game 20s default is both safe and worth a lot more here.
const LEADERBOARD_TTL_MS = 5 * 60_000;
function annotateProviderRows(data, response) {
  if (!Array.isArray(data)) return data;
  const meta = {
    freshness: response?.headers?.get?.('X-Provider-Freshness') || 'live',
    cache: response?.headers?.get?.('X-Provider-Cache') || 'MISS',
  };
  try { Object.defineProperty(data, '__providerMeta', { value: meta, enumerable: false, configurable: true }); } catch { /* arrays may be frozen by a test/client */ }
  return data;
}

async function fetchLeaderboard(url, { timeoutMs = 8_000 } = {}) {
  const cached = cacheGet(url);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = (async () => {
    let res;
    try {
      res = await scheduledFetch(url, timeoutMs);
    } catch {
      return staleCacheGet(url) ?? null;
    }
    if (!res.ok) {
      if (res.status === 429) {
        proxyCooldownUntil = Math.max(proxyCooldownUntil, Date.now() + parseRetryAfterMs(res));
        console.warn('[mlb] Savant rate limit; using verified cached rows when available');
        return staleCacheGet(url) ?? null;
      }
      return null;
    }
    // Same defensive fix as mlb() above, same reason — most callers of
    // fetchLeaderboard() already wrap the whole promise in .catch(() =>
    // null), so a thrown SyntaxError here was already being swallowed
    // functionally, but throwing a real Error first (rather than letting
    // a raw parser SyntaxError propagate) keeps behavior consistent and
    // makes any future caller that doesn't catch blindly fail safely too.
    let data;
    try {
      data = annotateProviderRows(await res.json(), res);
    } catch {
      return null;
    }
    const expires = Date.now() + LEADERBOARD_TTL_MS;
    cache.set(url, { data, expires, staleExpires: expires + STALE_CACHE_TTL_MS });
    if (data?.__providerMeta?.freshness !== 'stale-cached') recordFeedSuccess('savant');
    return data;
  })();

  inFlight.set(url, request);
  // See the matching comment in mlb() above — same fix, same reason.
  request.finally(() => inFlight.delete(url)).catch(() => {});
  return request;
}

// Find the correct stats group by displayName — never assume [0]
function findStatGroup(statsArr, groupName) {
  if (!Array.isArray(statsArr)) return null;
  return (
    statsArr.find(s => s.group?.displayName?.toLowerCase() === groupName.toLowerCase())
    ?? statsArr[0]
    ?? null
  );
}

// A season response can contain team, league, and sport-level splits. Prefer
// the current profile sport and an aggregate/total row before falling back to
// the first available split. This matters for players who changed teams or
// who are found through the MiLB-inclusive search path.
export function selectSeasonSplit(splits, sportId) {
  if (!Array.isArray(splits) || !splits.length) return null;
  const sportSplits = sportId == null
    ? splits
    : splits.filter(split => String(split?.sport?.id) === String(sportId));
  const candidates = sportSplits.length ? sportSplits : splits;
  return candidates.find(split => split?.isTotal === true)
    ?? candidates.find(split => split?.team == null)
    ?? candidates[0]
    ?? null;
}

// Try current season, fall back to prior year automatically
async function getSeasonStatsSafe(id, group, season, sportId) {
  const tryYear = async (yr) => {
    try {
      const data  = await mlb(`/people/${id}/stats`, { stats: 'season', group, season: yr });
      const grp   = findStatGroup(data.stats, group);
      const split = selectSeasonSplit(grp?.splits, sportId);
      return split?.stat && Object.keys(split.stat).length > 2 ? split.stat : null;
    } catch { return null; }
  };
  const current = await tryYear(season);
  if (current) return { stat: current, season, isFallback: false };
  const prev = await tryYear(season - 1);
  if (prev)    return { stat: prev, season: season - 1, isFallback: true };
  return { stat: {}, season, isFallback: false };
}

// Optional advanced season fields. MLB does not guarantee WAR or wRC+ in every
// Stats API response, so this adapter preserves only explicit provider fields.
export function normalizeSeasonAdvancedStat(stat = {}, season, source = 'MLB Stats API seasonAdvanced') {
  const war = stat.war ?? stat.fWAR ?? stat.bWAR ?? stat.rWAR ?? null;
  const wrcPlus = stat.wrcPlus ?? stat.wRCPlus ?? stat.wrc_plus ?? null;
  return { season, war, wrcPlus, source, status:(war != null || wrcPlus != null) ? 'live' : 'unavailable' };
}

export async function getSeasonAdvancedStatsSafe(id, season, sportId) {
  try {
    const data = await mlb(`/people/${id}/stats`, { stats:'seasonAdvanced', group:'hitting', season });
    const group = findStatGroup(data.stats, 'hitting');
    const split = selectSeasonSplit(group?.splits, sportId);
    return normalizeSeasonAdvancedStat(split?.stat || {}, season);
  } catch {
    return { season, war:null, wrcPlus:null, source:'MLB Stats API seasonAdvanced', status:'unavailable' };
  }
}

// Career year-by-year splits across ALL levels (includes MiLB years)
export async function getCareerSplits(id, group) {
  try {
    const data = await mlb(`/people/${id}/stats`, { stats: 'yearByYear', group });
    const grp  = findStatGroup(data.stats, group);
    return grp?.splits || [];
  } catch { return []; }
}

// Handedness splits are returned as situational rows by the MLB stats API.
// Keep this normalization deliberately narrow: only explicit vl/vr (or
// clearly named left/right descriptions) become LHP/RHP rows; unknown rows are
// discarded rather than being presented as a made-up comparison.
export function normalizeHandednessSplits(splits) {
  if (!Array.isArray(splits)) return [];
  return splits.map(split => {
    const marker = String(split?.split?.code ?? split?.split?.description ?? split?.split?.name ?? '').toLowerCase();
    const side = marker === 'vl' || marker.includes('left') ? 'LHP'
      : marker === 'vr' || marker.includes('right') ? 'RHP' : null;
    if (!side || !split?.stat || typeof split.stat !== 'object') return null;
    return { side, stat: split.stat };
  }).filter(Boolean);
}

export async function getHandednessSplits(id, season) {
  const fetchRows = async (stats, yr) => {
    try {
      const data = await mlb(`/people/${id}/stats`, { stats, group:'hitting', season:yr, sitCodes:'vl,vr' });
      const grp = findStatGroup(data.stats, 'hitting');
      return normalizeHandednessSplits(grp?.splits);
    } catch { return []; }
  };
  const currentRows = await fetchRows('season', season);
  const usedSeason = currentRows.length ? season : season - 1;
  const rows = currentRows.length ? currentRows : await fetchRows('season', usedSeason);
  const careerRows = await fetchRows('yearByYear', season);
  return { rows, careerRows, season:usedSeason, isFallback:usedSeason !== season };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER API
// ═══════════════════════════════════════════════════════════════════════════

export async function searchPlayers(query, limit = 12) {
  try {
    // Search both MLB and MiLB players by including all sportIds
    const data = await mlb('/people/search', { 
      names: query, 
      limit,
      sportId: '1,11,12,13,14,15,16,17,5442'
    });
    return data.people || [];
  } catch { return []; }
}

export async function getPlayerProfile(id) {
  const data = await mlb(`/people/${id}`, { hydrate: 'currentTeam' });
  return data.people?.[0] || null;
}

/**
 * Fetch contract data via /api/contract (Spotrac + BRef + MLB Stats API).
 * Ports github.com/Robbiedudz34/mlb-contract-data to serverless Node.js.
 * Passes both name (for HTML scraping) and id (for MLB API service time).
 * Returns null on any failure — never throws.
 */
const teamFinancialsCache = new Map();

export async function fetchTeamFinancials(teamAbbreviation, season = SEASON) {
  const team = String(teamAbbreviation || '').trim().toUpperCase();
  if (!team) return null;
  const cacheKey = `${team}:${season}`;
  if (teamFinancialsCache.has(cacheKey)) return teamFinancialsCache.get(cacheKey);
  const promise = (async () => {
    try {
      const params = new URLSearchParams({ team, season:String(season) });
      const res = await fetch(`/api/team-financials?${params}`, { signal:AbortSignal.timeout(18_000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.found) recordFeedSuccess('spotrac');
      return data?.found ? data : null;
    } catch { return null; }
  })().then(result => {
    // Do not turn a transient 429, timeout, or source gap into a permanent
    // in-memory miss. A later retry should be allowed to recover the feed.
    if (result == null) teamFinancialsCache.delete(cacheKey);
    return result;
  });
  teamFinancialsCache.set(cacheKey, promise);
  return promise;
}

export async function fetchContractData(playerId, fullName) {
  try {
    const params = new URLSearchParams({ id: String(playerId) });
    if (fullName) params.set('name', fullName);
    const res = await fetch(`/api/contract?${params}`, {
      signal: AbortSignal.timeout(14_000),  // BRef can be slow
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.found) recordFeedSuccess('contracts');
    return data?.found ? data : null;
  } catch { return null; }
}

function parseBoxscoreInnings(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const [whole, fraction = '0'] = text.split('.');
  const outs = Number(fraction);
  return (Number(whole) || 0) + (outs === 1 || outs === 2 ? outs / 3 : 0);
}
function makeBoxscoreBucket(label) {
  return { label, games: 0, plateAppearances: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, runs: 0, rbi: 0, walks: 0, hitByPitch: 0, sacrificeFlies: 0, totalBases: 0, inningsPitched: 0, earnedRuns: 0, hitsAllowed: 0, walksAllowed: 0, strikeOuts: 0, gamesStarted: 0 };
}
function findBoxscorePlayer(boxscore, playerId) {
  const target = String(playerId);
  for (const side of ['home', 'away']) {
    const players = boxscore?.teams?.[side]?.players || {};
    const match = Object.entries(players).find(([key, row]) => String(row?.person?.id || key).replace(/^ID/, '') === target);
    if (match) return { ...match[1], side };
  }
  return null;
}
function addBoxscoreBatting(bucket, stats) {
  if (!stats) return;
  bucket.plateAppearances += Number(stats.plateAppearances) || 0;
  bucket.atBats += Number(stats.atBats) || 0;
  bucket.hits += Number(stats.hits) || 0;
  bucket.doubles += Number(stats.doubles) || 0;
  bucket.triples += Number(stats.triples) || 0;
  bucket.homeRuns += Number(stats.homeRuns) || 0;
  bucket.runs += Number(stats.runs) || 0;
  bucket.rbi += Number(stats.rbi) || 0;
  bucket.walks += Number(stats.baseOnBalls) || 0;
  bucket.hitByPitch += Number(stats.hitByPitch) || 0;
  bucket.sacrificeFlies += Number(stats.sacrificeFlies) || 0;
  bucket.totalBases += Number(stats.totalBases) || 0;
}
function addBoxscorePitching(bucket, stats) {
  if (!stats) return;
  bucket.inningsPitched += parseBoxscoreInnings(stats.inningsPitched);
  bucket.earnedRuns += Number(stats.earnedRuns) || 0;
  bucket.hitsAllowed += Number(stats.hits) || 0;
  bucket.walksAllowed += Number(stats.baseOnBalls) || 0;
  bucket.strikeOuts += Number(stats.strikeOuts) || 0;
  bucket.gamesStarted += Number(stats.gamesStarted) || 0;
}
function finalizeBoxscoreBucket(bucket, kind) {
  const out = { ...bucket };
  if (kind === 'batting') {
    const obpDenominator = out.atBats + out.walks + out.hitByPitch + out.sacrificeFlies;
    out.avg = out.atBats ? out.hits / out.atBats : null;
    out.obp = obpDenominator ? (out.hits + out.walks + out.hitByPitch) / obpDenominator : null;
    out.slg = out.atBats ? out.totalBases / out.atBats : null;
    out.ops = out.obp != null && out.slg != null ? out.obp + out.slg : null;
  } else {
    out.era = out.inningsPitched ? (out.earnedRuns * 9) / out.inningsPitched : null;
    out.whip = out.inningsPitched ? (out.hitsAllowed + out.walksAllowed) / out.inningsPitched : null;
  }
  return out;
}
export async function getPlayerBoxscoreSplits(playerId, teamId, season = SEASON) {
  const id = Number(playerId);
  const clubId = Number(teamId);
  const unavailable = (reason = 'No completed official boxscores were returned for this player.') => ({ status: 'unavailable', source: 'MLB Stats API boxscores', season, retrievedAt: new Date().toISOString(), games: 0, requestedGames: 0, reason, batting: [], pitching: [], recentGames: [] });
  if (playerId == null || teamId == null || playerId === '' || teamId === '' || !Number.isFinite(id) || !Number.isFinite(clubId) || id <= 0 || clubId <= 0) return unavailable('The player does not have a current MLB team identifier.');
  try {
    const today = new Date();
    const startDate = `${season}-03-01`;
    const endDate = season === today.getUTCFullYear() ? today.toISOString().slice(0, 10) : `${season}-10-05`;
    const schedule = await mlb('/schedule', { sportId: 1, teamId: clubId, startDate, endDate, gameType: 'R', hydrate: 'team' }, { ttl: 5 * 60_000, timeoutMs: 12_000 });
    const games = (schedule?.dates || []).flatMap(date => date.games || []).filter(game => String(game.status?.abstractGameState || '').toLowerCase() === 'final').sort((a, b) => String(b.gameDate || '').localeCompare(String(a.gameDate || ''))).slice(0, 30);
    if (!games.length) return unavailable('No completed regular-season games were returned for the current team and season.');
    const results = [];
    for (const game of games) {
      try {
        const boxscore = await getGameBoxscore(game.gamePk);
        const row = findBoxscorePlayer(boxscore, id);
        if (row) results.push({ game, row });
      } catch { /* one unavailable boxscore must not erase verified rows from other games */ }
    }
    if (!results.length) return unavailable('The available official boxscores did not include this player.');
    const batting = new Map();
    const pitching = new Map();
    const ensure = (map, key) => { if (!map.has(key)) map.set(key, makeBoxscoreBucket(key)); return map.get(key); };
    for (const { game, row } of results) {
      const date = new Date(game.gameDate || `${season}-01-01T00:00:00Z`);
      const month = Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) : 'Unknown';
      const dimensions = ['All', row.side === 'home' ? 'Home' : 'Away', String(game.dayNight || '').toLowerCase() === 'day' ? 'Day' : String(game.dayNight || '').toLowerCase() === 'night' ? 'Night' : null, month].filter(Boolean);
      for (const key of dimensions) {
        const bat = ensure(batting, key); const pit = ensure(pitching, key);
        bat.games += 1; pit.games += 1;
        addBoxscoreBatting(bat, row.stats?.batting);
        addBoxscorePitching(pit, row.stats?.pitching);
      }
    }
    const finalize = (map, kind) => [...map.values()].map(bucket => finalizeBoxscoreBucket(bucket, kind)).filter(row => row.games > 0);
    const recentGames = results.slice(0, 10).map(({ game, row }) => {
      const battingBucket = makeBoxscoreBucket('Game');
      const pitchingBucket = makeBoxscoreBucket('Game');
      battingBucket.games = 1;
      pitchingBucket.games = 1;
      addBoxscoreBatting(battingBucket, row.stats?.batting);
      addBoxscorePitching(pitchingBucket, row.stats?.pitching);
      return {
        gamePk: game.gamePk,
        date: game.gameDate || null,
        opponent: row.side === 'home' ? game.teams?.away?.team?.name || null : game.teams?.home?.team?.name || null,
        batting: finalizeBoxscoreBucket(battingBucket, 'batting'),
        pitching: finalizeBoxscoreBucket(pitchingBucket, 'pitching'),
      };
    });
    return { status: 'live', source: 'MLB Stats API boxscores', season, retrievedAt: new Date().toISOString(), games: results.length, requestedGames: games.length, windowLabel: `Most recent ${games.length} completed regular-season games`, batting: finalize(batting, 'batting'), pitching: finalize(pitching, 'pitching'), recentGames };
  } catch (error) {
    return unavailable(error?.message?.includes('429') ? 'The MLB boxscore provider is rate-limited; retry shortly.' : 'The official MLB schedule or boxscore feed is unavailable right now.');
  }
}
export async function loadFullPlayer(person, season = SEASON) {
  const id = person.id;

  // All 6 requests run in parallel — contract never blocks stats
  const profile = await getPlayerProfile(id);
  const profileSportId = profile?.currentTeam?.sport?.id ?? profile?.sport?.id ?? null;
  const currentTeamAbbreviation = profile?.currentTeam?.abbreviation || person.team || null;
  const boxscoreSplitsPromise = getPlayerBoxscoreSplits(id, profile?.currentTeam?.id, season);
  const [hittingResult, pitchingResult, careerHitting, careerPitching, contractRaw, handednessResult, teamFinancials, advancedMetrics] = await Promise.all([
    getSeasonStatsSafe(id, 'hitting',  season, profileSportId),
    getSeasonStatsSafe(id, 'pitching', season, profileSportId),
    getCareerSplits(id, 'hitting'),
    getCareerSplits(id, 'pitching'),
    fetchContractData(id, person.fullName),
    getHandednessSplits(id, season),
    fetchTeamFinancials(currentTeamAbbreviation, season),
    getSeasonAdvancedStatsSafe(id, season, profileSportId),
  ]);

  // Savant & bat-tracking are optional — never block. Each tries current season then prior year
  // independently so batTracking can fall back to yr-1 even when savant has current-year data.
  let savant = null;
  let batTracking = null;
  let statcastPopulation = null;
  let expectedStatisticsPopulation = null;
  let batTrackingPopulation = null;

  // isPitcher needs to be known *before* the optional-Savant block below so
  // pitch_arsenal (Roadmap #1) — a pitcher-only, per-pitch-type leaderboard —
  // is only ever fetched for pitchers, not on every single player load.
  // Moved up from where this used to be computed (just before the return),
  // past the point everything it depends on (profile, hitting/pitchingResult)
  // is already available from the Promise.all above.
  const posType = profile?.primaryPosition?.type || '';
  const posAbbr = profile?.primaryPosition?.abbreviation || '';
  const hasPitchStats = pitchingResult?.stat && !!pitchingResult.stat.era;
  const hasHitStats   = hittingResult?.stat  && !!hittingResult.stat.atBats;

  let isPitcher = posType === 'Pitcher' || posAbbr === 'SP' || posAbbr === 'RP' || posAbbr === 'P';
  if (isPitcher && hasHitStats && !hasPitchStats) isPitcher = false; // two-way override

  // Fired off now, not after the tryYear() round trip(s) below — these two
  // don't depend on expected_statistics/bat-tracking/statcast_leaderboard in
  // any way (only the merge step a few lines down needs `savant` to exist),
  // so waiting for those to resolve first was purely wasted latency: a whole
  // extra sequential network round trip for no reason, doubly so when the
  // current season comes back empty and tryYear falls back to season - 1.
  const speedPromise = fetchLeaderboard(`/api/savant?endpoint=sprint_speed&year=${season}`, { timeoutMs: 5_000 }).catch(() => null);
  const oaaPromise   = fetchLeaderboard(`/api/savant?endpoint=oaa&year=${season}`, { timeoutMs: 5_000 }).catch(() => null);

  // pitch_arsenal (Roadmap #1) — unlike the batter leaderboards above, a
  // pitcher has *multiple* rows in this one (one per pitch type), so this
  // collects all matches rather than the single-row findByPlayerId() below.
  // Tries current season, falls back to season-1 on its own, independent of
  // the savant/batTracking fallback logic (different leaderboard, no reason
  // to couple their retry timing together).
  //
  // Also retains the full unfiltered population (`population` below), not
  // just this pitcher's own rows — added for the pitcher side of Roadmap
  // #2 (plate-discipline percentiles), which needs something to rank a
  // pitcher's aggregate Whiff% against. Same shape of fix as the batter
  // statcastPopulation field a few lines below: the array's already sitting
  // in memory from the fetch, discarding everything but one player's rows
  // after filtering was throwing away data a caller would need again.
  const pitchArsenalPromise = (async () => {
    if (!isPitcher) return { rows: null, population: null };
    const tryPitchYear = async (yr) => {
      const arr = await fetchLeaderboard(`/api/savant?endpoint=pitch_arsenal&year=${yr}`, { timeoutMs: 7_000 }).catch(() => null);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const rows = arr.filter(p => String(p.player_id ?? p.pitcher_id ?? p.id) === String(id));
      return { rows: rows.length ? rows : null, population: arr };
    };
    const cur = await tryPitchYear(season);
    if (cur?.rows) return cur;
    const prev = await tryPitchYear(season - 1);
    return prev || { rows: null, population: null };
  })();

  // contact_points (Roadmap #3) — supersedes the batting_stance fetch this
  // used to be (see api/savant.js's comment for the full reasoning): real
  // per-swing intercept-point data instead of a season-average leaderboard
  // row. Batter-only, structurally different from every fetch above:
  // Statcast Search is inherently player-scoped server-side (a
  // `batters_lookup[]` param, not something filtered down after the fact),
  // so there's no "population" to also retain the way pitchArsenalPromise
  // does above — just this player's own competitive-swing rows. Runs a
  // longer timeout than any other endpoint on this page: it's the one
  // genuinely pitch-level fetch, not a compact season-aggregate row.
  const contactPointsPromise = (async () => {
    if (isPitcher) return null;
    const tryYearCP = (yr) => fetchLeaderboard(
      `/api/savant?endpoint=contact_points&year=${yr}&playerId=${id}`,
      { timeoutMs: 20_000 },
    ).catch(() => null);
    const cur = await tryYearCP(season);
    if (Array.isArray(cur) && cur.length) return cur;
    const prev = await tryYearCP(season - 1);
    return Array.isArray(prev) && prev.length ? prev : null;
  })();

  // pitcher_pitches (Roadmap #1, added 2026-08-08) — the pitcher-side
  // mirror of contactPointsPromise directly above, same reasoning and same
  // structural shape (Statcast Search is player-scoped server-side via
  // `pitchers_lookup[]`, so there's no population to retain here either —
  // just this pitcher's own pitches). This is what closes the two gaps
  // PitchShapePanel.jsx's own comment has documented since #1 was first
  // built: a true velocity distribution (real per-pitch `release_speed`
  // values, not a single season-average bar) and a real LHH/RHH usage
  // split (the `stand` column pitch_arsenal never carried). Same 20s
  // timeout as contact_points for the same reason — this is the other
  // genuinely pitch-level fetch on this page, not a compact aggregate row.
  const pitcherPitchesPromise = (async () => {
    if (!isPitcher) return null;
    const tryYearPP = (yr) => fetchLeaderboard(
      `/api/savant?endpoint=pitcher_pitches&year=${yr}&playerId=${id}`,
      { timeoutMs: 20_000 },
    ).catch(() => null);
    const cur = await tryYearPP(season);
    if (Array.isArray(cur) && cur.length) return cur;
    const prev = await tryYearPP(season - 1);
    return Array.isArray(prev) && prev.length ? prev : null;
  })();

  try {
    // Baseball Savant is inconsistent about the player-id column name across
    // its own leaderboards: expected_statistics uses 'player_id', but the
    // newer bat-tracking leaderboard uses plain 'id' (confirmed against a
    // live CSV pull — e.g. Giancarlo Stanton's row is `519317,"Stanton,
    // Giancarlo",...` under an `id` header, no `player_id` column at all).
    // Matching on player_id alone meant bat-tracking silently matched zero
    // players, every player, every time. Check both so either schema works.
    const findByPlayerId = (arr, targetId) =>
      arr.find(p => String(p.player_id ?? p.id) === String(targetId)) || null;

    // Try both endpoints for current season first, then prior year if needed
    const tryYear = async (yr) => {
      const [sArr, btArr, scArr] = await Promise.all([
        fetchLeaderboard(`/api/savant?endpoint=expected_statistics&year=${yr}`),
        fetchLeaderboard(`/api/savant?endpoint=bat-tracking&year=${yr}`),
        // Exit velocity, barrel%, hard-hit%, sweet-spot%, launch angle — this
        // endpoint was defined in the server-side proxy from the start but
        // never actually called from here, so brl_percent/hard_hit_percent/
        // sweet_spot_percent were always undefined and every UI tile reading
        // them was silently falling back to its estimated proxy value.
        fetchLeaderboard(`/api/savant?endpoint=statcast_leaderboard&year=${yr}`),
      ]);
      let sData = null, btData = null;
      if (Array.isArray(sArr) && sArr.length > 0) sData = findByPlayerId(sArr, id);
      if (Array.isArray(btArr) && btArr.length > 0) btData = findByPlayerId(btArr, id);
      if (Array.isArray(scArr) && scArr.length > 0) {
        const scData = findByPlayerId(scArr, id);
        // Merge onto sData rather than replace — expected_statistics and
        // statcast_leaderboard carry different, complementary fields for
        // the same player, and either fetch can independently be missing.
        if (scData) sData = { ...(sData || {}), ...scData };
      }
      // Hand back the full statcast_leaderboard rows too, not just this
      // player's row — plate-discipline percentile bars need to rank the
      // player against the real qualified-batter population, and this
      // array is already sitting in memory from the fetch above (cached,
      // so grabbing it here costs nothing extra).
      return {
        sData,
        btData,
        scArr: Array.isArray(scArr) ? scArr : null,
        expectedArr: Array.isArray(sArr) ? sArr : null,
        btArr: Array.isArray(btArr) ? btArr : null,
      };
    };

    const cur = await tryYear(season);
    savant      = cur.sData;
    batTracking = cur.btData;
    statcastPopulation = cur.scArr;
    expectedStatisticsPopulation = cur.expectedArr;
    batTrackingPopulation = cur.btArr;

    // Fall back independently: only re-fetch what's still missing
    if (!savant || !batTracking) {
      const prev = await tryYear(season - 1);
      if (!savant)      savant      = prev.sData;
      if (!batTracking) batTracking = prev.btData;
      if (!statcastPopulation) statcastPopulation = prev.scArr;
      if (!expectedStatisticsPopulation) expectedStatisticsPopulation = prev.expectedArr;
      if (!batTrackingPopulation) batTrackingPopulation = prev.btArr;
    }

    // Additional high-fidelity metrics (Speed & Defense) — already in flight
    // since before the try block, just waiting to be picked up here.
    const [speedArr, oaaArr] = await Promise.all([speedPromise, oaaPromise]);

    if (savant) {
      if (Array.isArray(speedArr)) {
        const s = findByPlayerId(speedArr, id);
        if (s) savant.sprint_speed = s.sprint_speed;
      }
      if (Array.isArray(oaaArr)) {
        const s = findByPlayerId(oaaArr, id);
        if (s) savant.oaa = s.oaa;
      }
    }
  } catch { /* optional — never block player load */ }

  // Resolved outside the try block above (and awaited independently of it)
  // so a savant/batTracking failure can't take pitch_arsenal down with it —
  // the promise was already created, so this just picks up its result.
  const { rows: pitchArsenal, population: pitchArsenalPopulation } =
    await pitchArsenalPromise.catch(() => ({ rows: null, population: null }));
  const contactPoints = await contactPointsPromise.catch(() => null);
  const pitcherPitches = await pitcherPitchesPromise.catch(() => null);

  const statResult = isPitcher ? pitchingResult : hittingResult;

  return {
    id, profile, savant, batTracking, statcastPopulation,
    expectedStatisticsPopulation, batTrackingPopulation, isPitcher,
    pitchArsenal, pitchArsenalPopulation, contactPoints, pitcherPitches,
    stats:        statResult?.stat        || {},
    advancedMetrics,
    statSeason:   statResult?.season      || season,
    isFallback:   statResult?.isFallback  || false,
    career:       careerHitting,
    careerPitching,
    hittingStats:  hittingResult?.stat    || {},
    pitchingStats: pitchingResult?.stat   || {},
    contractData:  contractRaw,
    handednessSplits: handednessResult,
    teamFinancials,
    boxscoreSplits: await boxscoreSplitsPromise,
  };
}

// Intelligence page comparison
export async function searchAndGetStats(name, season = SEASON) {
  const people = await searchPlayers(name, 1);
  if (!people.length) return null;
  const id     = people[0].id;
  const result = await getSeasonStatsSafe(id, 'hitting', season);
  return { name: people[0].fullName, id, stats: result.stat, season: result.season, isFallback: result.isFallback };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE — MLB + MiLB
// ═══════════════════════════════════════════════════════════════════════════

function normalizeGame(g) {
  return {
    gamePk:     g.gamePk,
    status:     g.status?.detailedState || '',
    statusCode: g.status?.statusCode    || '',
    inning:     g.linescore?.currentInning  || null,
    inningHalf: g.linescore?.inningHalf     || '',
    away: {
      name:   g.teams?.away?.team?.name         || '',
      abbr:   g.teams?.away?.team?.abbreviation || '',
      id:     g.teams?.away?.team?.id,
      runs:   g.linescore?.teams?.away?.runs   ?? g.teams?.away?.score ?? null,
      hits:   g.linescore?.teams?.away?.hits   ?? null,
      errors: g.linescore?.teams?.away?.errors ?? null,
      wins:   g.teams?.away?.leagueRecord?.wins,
      losses: g.teams?.away?.leagueRecord?.losses,
    },
    home: {
      name:   g.teams?.home?.team?.name         || '',
      abbr:   g.teams?.home?.team?.abbreviation || '',
      id:     g.teams?.home?.team?.id,
      runs:   g.linescore?.teams?.home?.runs   ?? g.teams?.home?.score ?? null,
      hits:   g.linescore?.teams?.home?.hits   ?? null,
      errors: g.linescore?.teams?.home?.errors ?? null,
      wins:   g.teams?.home?.leagueRecord?.wins,
      losses: g.teams?.home?.leagueRecord?.losses,
    },
    venue:     g.venue?.name || '',
    weather:   g.weather || g.gameData?.weather || null,
    time:      g.gameDate,
    gameType:  g.gameType,
    levelName: g.teams?.home?.team?.sport?.name || 'MLB',
    levelId:   g.teams?.home?.team?.sport?.id   || 1,
  };
}

export async function getTodaysGames(date) {
  const d    = date || new Date().toISOString().slice(0, 10);
  const data = await mlb('/schedule', {
    sportId: 1, date: d,
    hydrate: 'linescore(matchup,runners),team,flags,review,weather',
    language: 'en',
  }, { ttl: 60_000 });
  return (data.dates?.[0]?.games || []).map(normalizeGame);
}

export async function getMiLBGames(date, levelIds = [11, 12, 13, 14]) {
  const d    = date || new Date().toISOString().slice(0, 10);
  const ids  = Array.isArray(levelIds) ? levelIds.join(',') : String(levelIds);
  const data = await mlb('/schedule', { sportIds: ids, date: d, hydrate: 'linescore,team', language: 'en' }, { ttl: 60_000 });
  const games = (data.dates?.[0]?.games || []).map(normalizeGame);
  const byLevel = {};
  for (const g of games) {
    const key = g.levelName || 'Other';
    if (!byLevel[key]) byLevel[key] = [];
    byLevel[key].push(g);
  }
  return { games, byLevel };
}

export async function getMiLBGamePks(date, levelIds = [11, 12]) {
  const d    = date || new Date().toISOString().slice(0, 10);
  const ids  = Array.isArray(levelIds) ? levelIds.join(',') : String(levelIds);
  const data = await mlb('/schedule', { sportIds: ids, date: d });
  return (data.dates?.[0]?.games || [])
    .filter(g => g.status?.codedGameState === 'F' || g.status?.abstractGameState === 'Live')
    .map(g => ({
      gamePk:  g.gamePk,
      away:    g.teams?.away?.team?.name || '',
      home:    g.teams?.home?.team?.name || '',
      level:   g.teams?.home?.team?.sport?.name || '',
      levelId: g.teams?.home?.team?.sport?.id,
      status:  g.status?.detailedState || '',
    }));
}

export async function getOrgGames(date, mlbTeamId) {
  const d = date || new Date().toISOString().slice(0, 10);
  const [mlbGames, milbResult] = await Promise.all([
    getTodaysGames(d),
    getMiLBGames(d, [11, 12, 13, 14, 15]),
  ]);
  let affiliateIds = new Set([mlbTeamId]);
  try {
    const aff = await mlb(`/teams/${mlbTeamId}/affiliates`, { season: SEASON }, { ttl: 10 * 60_000 });
    for (const t of aff.teams || []) affiliateIds.add(t.id);
  } catch (_) { /* best effort */ }
  return [
    ...mlbGames.filter(g => affiliateIds.has(g.away.id) || affiliateIds.has(g.home.id)),
    ...milbResult.games.filter(g => affiliateIds.has(g.away.id) || affiliateIds.has(g.home.id)),
  ];
}

export async function getGameFeedMetadata(gameOrPk) {
  const gamePk = typeof gameOrPk === 'object' ? gameOrPk?.gamePk : gameOrPk;
  if (!gamePk) return null;
  const scheduledWeather = typeof gameOrPk === 'object' ? gameOrPk?.weather : null;
  const normalizeWeather = weather => weather ? { condition: weather.condition || null, temp: weather.temp || null, wind: weather.wind || null } : null;
  if (scheduledWeather) return { weather: normalizeWeather(scheduledWeather), mediaUrl: `https://www.mlb.com/gameday/${gamePk}`, retrievedAt: new Date().toISOString(), source: 'MLB schedule' };
  const finalGame = typeof gameOrPk === 'object' && String(gameOrPk?.status || '').toLowerCase() === 'final';
  if (finalGame) return { weather: null, mediaUrl: `https://www.mlb.com/gameday/${gamePk}`, retrievedAt: new Date().toISOString(), status: 'unavailable', reason: 'Recorded weather was not included in the official schedule response.' };
  try {
    const data = await mlb(`/game/${gamePk}/feed/live`, {}, { ttl: 10 * 60_000, timeoutMs: 10_000, quietStatuses:[404, 502, 503, 504] });
    return { weather: normalizeWeather(data?.gameData?.weather), mediaUrl: `https://www.mlb.com/gameday/${gamePk}`, retrievedAt: new Date().toISOString(), source: 'MLB live feed' };
  } catch {
    return { weather: null, mediaUrl: `https://www.mlb.com/gameday/${gamePk}`, retrievedAt: new Date().toISOString(), status: 'unavailable' };
  }
}
const teamVenueMetadataCache = new Map();
export async function getTeamVenueMetadata(teamId) {
  const id = Number(teamId);
  if (!Number.isFinite(id)) return { status: 'source-gap', source: 'MLB Stats API', venue: null, retrievedAt: new Date().toISOString() };
  const cached = teamVenueMetadataCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.data, freshness: 'cached' };
  try {
    const teamResponse = await mlb(`/teams/${id}`, { hydrate: 'venue,league,division,sport' }, { ttl: 60 * 60_000, timeoutMs: 12_000 });
    const team = teamResponse?.teams?.[0];
    const venueId = Number(team?.venue?.id);
    if (!Number.isFinite(venueId)) return { status: 'source-gap', source: 'MLB Stats API', venue: null, retrievedAt: new Date().toISOString() };
    const venueResponse = await mlb(`/venues/${venueId}`, { hydrate: 'location,fieldInfo' }, { ttl: 24 * 60 * 60_000, timeoutMs: 12_000 });
    const raw = venueResponse?.venues?.[0] || {};
    const fieldInfo = raw.fieldInfo || {};
    const location = raw.location || {};
    const numberOrNull = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const data = {
      status: raw.id ? 'live' : 'source-gap',
      source: 'MLB Stats API',
      sourceUrl: `https://statsapi.mlb.com/api/v1/venues/${venueId}?hydrate=location,fieldInfo`,
      retrievedAt: new Date().toISOString(),
      venue: raw.id ? {
        id: raw.id,
        name: raw.name || team?.venue?.name || null,
        capacity: numberOrNull(fieldInfo.capacity),
        surface: fieldInfo.turfType || null,
        roof: fieldInfo.roofType || null,
        dimensions: {
          leftLine: numberOrNull(fieldInfo.leftLine),
          leftCenter: numberOrNull(fieldInfo.leftCenter),
          center: numberOrNull(fieldInfo.center),
          rightCenter: numberOrNull(fieldInfo.rightCenter),
          rightLine: numberOrNull(fieldInfo.rightLine),
        },
        latitude: numberOrNull(location.latitude),
        longitude: numberOrNull(location.longitude),
      } : null,
      freshness: 'live',
    };
    teamVenueMetadataCache.set(id, { data, expiresAt: Date.now() + 24 * 60 * 60_000 });
    return data;
  } catch {
    if (cached) return { ...cached.data, status: 'cached', freshness: 'stale-cached', reason: 'MLB venue metadata unavailable' };
    return { status: 'upstream-unavailable', source: 'MLB Stats API', venue: null, retrievedAt: new Date().toISOString() };
  }
}

export function __resetTeamVenueMetadataCacheForTests() { teamVenueMetadataCache.clear(); }

export async function getGameLinescore(gamePk) { return mlb(`/game/${gamePk}/linescore`); }
export async function getGameBoxscore(gamePk)  { return mlb(`/game/${gamePk}/boxscore`); }

// Play-by-play — works for both MLB and MiLB
// MiLB: pitch x/y pixel coords available; Statcast-level data NOT available.
export async function getGamePBP(gamePk) {
  const data  = await mlb(`/game/${gamePk}/playByPlay`);
  const plays = data.allPlays || [];
  return plays.map(play => ({
    atBatIndex:  play.atBatIndex,
    inning:      play.about?.inning,
    half:        play.about?.halfInning,
    batter:      { id: play.matchup?.batter?.id, name: play.matchup?.batter?.fullName },
    pitcher:     { id: play.matchup?.pitcher?.id, name: play.matchup?.pitcher?.fullName },
    batSide:     play.matchup?.batSide?.code,
    pitchHand:   play.matchup?.pitchHand?.code,
    result:      play.result?.event,
    resultType:  play.result?.eventType,
    description: play.result?.description,
    rbi:         play.result?.rbi,
    pitches: (play.pitchIndex || []).map(idx => {
      const pe = play.playEvents?.[idx] || {};
      return {
        pitchNumber: pe.pitchNumber,
        callCode:    pe.details?.call?.code,
        callDesc:    pe.details?.call?.description,
        type:        pe.details?.type?.description,
        // MiLB: pixel coords — multiply by -1 for catcher's-view orientation
        coordX:      pe.pitchData?.coordinates?.x,
        coordY:      pe.pitchData?.coordinates?.y,
        hitCoordX:   pe.hitData?.coordinates?.coordX,
        hitCoordY:   pe.hitData?.coordinates?.coordY,
        trajectory:  pe.hitData?.trajectory,
        hardness:    pe.hitData?.hardness,
        balls:       pe.count?.balls,
        strikes:     pe.count?.strikes,
        outs:        pe.count?.outs,
      };
    }),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDINGS — MLB + MiLB
// ═══════════════════════════════════════════════════════════════════════════

function parseStandingsRecord(rec) {
  return {
    divisionName: rec.division?.name || rec.division?.nameShort || '',
    teams: rec.teamRecords.map(t => ({
      id:       t.team.id,
      name:     t.team.name,
      abbr:     t.team.abbreviation || '',
      w:        t.wins,
      l:        t.losses,
      pct:      parseFloat(t.winningPercentage) || 0,
      gb:       t.gamesBack,
      streak:   t.streak?.streakCode || '',
      l10:  (() => { const r = t.records?.splitRecords?.find(r => r.type === 'lastTen'); return r ? `${r.wins}-${r.losses}` : ''; })(),
      home: (() => { const r = t.records?.overallRecords?.find(r => r.type === 'home');  return r ? `${r.wins}-${r.losses}` : ''; })(),
      away: (() => { const r = t.records?.overallRecords?.find(r => r.type === 'away');  return r ? `${r.wins}-${r.losses}` : ''; })(),
      rs:       t.runsScored,
      ra:       t.runsAllowed,
      diff:     t.runDifferential,
      divRank:  t.divisionRank,
      wildRank: t.wildCardRank,
      elim:     t.eliminationNumber,
    }))
  };
}

async function fetchStandings(leagueIds, season = SEASON) {
  const ids  = Array.isArray(leagueIds) ? leagueIds.join(',') : String(leagueIds);
  const data = await mlb('/standings', { leagueId: ids, season, standingsTypes: 'regularSeason', hydrate: 'team,division,league' }, { ttl: 5 * 60_000 });
  const out  = {};
  for (const rec of data.records || []) {
    const parsed = parseStandingsRecord(rec);
    out[parsed.divisionName] = parsed.teams;
  }
  return out;
}

// MLB: AL (103) + NL (104)
export const getStandings       = (season = SEASON) => fetchStandings('103,104', season);
const teamScheduleSplitsCache = new Map();
export async function getTeamScheduleSplits(teamId, season = SEASON) {
  const id = Number(teamId);
  if (!Number.isFinite(id)) return [];
  const cacheKey = `${id}:${season}`;
  const cached = teamScheduleSplitsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  try {
    const today = new Date();
    const start = new Date(`${season}-03-01T00:00:00Z`);
    const scheduleDates = [];
    for (let cursor = start; cursor <= today; cursor = new Date(cursor.getTime() + 30 * 86400000)) {
      const chunkStart = cursor.toISOString().slice(0, 10);
      const chunkEnd = new Date(Math.min(cursor.getTime() + 29 * 86400000, today.getTime())).toISOString().slice(0, 10);
      const data = await mlb('/schedule', { sportId: 1, teamId: id, startDate: chunkStart, endDate: chunkEnd, gameType: 'R', hydrate: 'linescore', language: 'en' }, { ttl: 5 * 60_000, timeoutMs: 12_000 });
      scheduleDates.push(...(data.dates || []));
    }
    const buckets = { home: { w: 0, l: 0 }, away: { w: 0, l: 0 }, day: { w: 0, l: 0 }, night: { w: 0, l: 0 } };
    for (const game of scheduleDates.flatMap(date => date.games || [])) {
      if (String(game.status?.abstractGameState || '').toLowerCase() !== 'final') continue;
      const home = Number(game.teams?.home?.team?.id) === id;
      const away = Number(game.teams?.away?.team?.id) === id;
      if (!home && !away) continue;
      const won = Boolean((home ? game.teams.home : game.teams.away)?.isWinner);
      const side = home ? buckets.home : buckets.away;
      side[won ? 'w' : 'l'] += 1;
      const timeBucket = String(game.dayNight || '').toLowerCase() === 'day' ? buckets.day : String(game.dayNight || '').toLowerCase() === 'night' ? buckets.night : null;
      if (timeBucket) timeBucket[won ? 'w' : 'l'] += 1;
    }
    const rows = [
      { split: 'Home', ...buckets.home, ops: '—', era: '—' },
      { split: 'Away', ...buckets.away, ops: '—', era: '—' },
      { split: 'Day', ...buckets.day, ops: '—', era: '—' },
      { split: 'Night', ...buckets.night, ops: '—', era: '—' },
    ].filter(row => row.w + row.l > 0);
    teamScheduleSplitsCache.set(cacheKey, { rows, expiresAt: Date.now() + 5 * 60_000 });
    return rows;
  } catch {
    return [];
  }
}

function seededRandom(seed) {
  let value = Math.abs(Number(seed) || 1) % 2147483647;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function flattenStandings(standings) {
  return Object.entries(standings || {}).flatMap(([divisionName, teams]) => (teams || []).map(team => ({ ...team, divisionName, leagueName: divisionName.startsWith('American') ? 'American League' : divisionName.startsWith('National') ? 'National League' : '' })));
}

export async function getSkipPlayoffOddsEstimate(teamId, season = SEASON, simulations = 1200) {
  if (!teamId) return { status: 'unavailable', source: 'SKIP estimate', estimate: null, retrievedAt: new Date().toISOString() };
  try {
    const standings = await getStandings(season);
    const teams = flattenStandings(standings);
    const selected = teams.find(team => Number(team.id) === Number(teamId));
    if (!selected || teams.length < 20) throw new Error('Insufficient standings data');
    const today = new Date();
    const startDate = today.toISOString().slice(0, 10);
    const endDate = `${season}-10-05`;
    const chunkDays = 14;
    const scheduleDates = [];
    for (let cursor = new Date(`${startDate}T00:00:00Z`); cursor <= new Date(`${endDate}T00:00:00Z`); cursor = new Date(cursor.getTime() + chunkDays * 86400000)) {
      const chunkStart = cursor.toISOString().slice(0, 10);
      const chunkEnd = new Date(Math.min(cursor.getTime() + (chunkDays - 1) * 86400000, new Date(`${endDate}T00:00:00Z`).getTime())).toISOString().slice(0, 10);
      const chunk = await mlb('/schedule', { sportId: 1, startDate: chunkStart, endDate: chunkEnd, hydrate: 'team', language: 'en' }, { ttl: 5 * 60_000, timeoutMs: 12_000 });
      scheduleDates.push(...(chunk.dates || []));
    }
    const remaining = scheduleDates.flatMap(date => date.games || []).filter(game => {
      const state = String(game.status?.abstractGameState || '').toLowerCase();
      return game.gameDate && new Date(game.gameDate).getTime() >= today.getTime() && state !== 'final';
    });
    if (!remaining.length) throw new Error('No remaining schedule data');
    const byId = new Map(teams.map(team => [Number(team.id), team]));
    const games = remaining.map(game => ({
      home: Number(game.teams?.home?.team?.id),
      away: Number(game.teams?.away?.team?.id),
    })).filter(game => byId.has(game.home) && byId.has(game.away));
    if (!games.length) throw new Error('No usable remaining games');
    const baseWins = new Map(teams.map(team => [Number(team.id), Number(team.w) || 0]));
    const seed = Number(teamId) * 1009 + Number(season) * 9176 + games.length;
    const random = seededRandom(seed);
    let playoffHits = 0;
    const count = Math.max(400, Math.min(5000, Number(simulations) || 1200));
    for (let iteration = 0; iteration < count; iteration += 1) {
      const wins = new Map(baseWins);
      for (const game of games) {
        const home = byId.get(game.home);
        const away = byId.get(game.away);
        const homePct = Number(home.pct) || 0.5;
        const awayPct = Number(away.pct) || 0.5;
        const probability = Math.min(0.78, Math.max(0.22, (awayPct / (homePct + awayPct)) * 0.96 + 0.04));
        if (random() < probability) wins.set(game.away, (wins.get(game.away) || 0) + 1);
        else wins.set(game.home, (wins.get(game.home) || 0) + 1);
      }
      const qualified = new Set();
      const byDivision = new Map();
      teams.forEach(team => {
        const key = team.divisionName || 'Unknown division';
        if (!byDivision.has(key)) byDivision.set(key, []);
        byDivision.get(key).push(team);
      });
      const wildByLeague = new Map();
      for (const divisionTeams of byDivision.values()) {
        const ordered = divisionTeams.slice().sort((a, b) => (wins.get(Number(b.id)) - wins.get(Number(a.id))) || ((Number(b.pct) || 0) - (Number(a.pct) || 0)));
        ordered.slice(0, 1).forEach(team => qualified.add(Number(team.id)));
        const league = ordered[0]?.leagueName || 'Unknown league';
        if (!wildByLeague.has(league)) wildByLeague.set(league, []);
        wildByLeague.get(league).push(...ordered.slice(1));
      }
      for (const wildCandidates of wildByLeague.values()) {
        wildCandidates.sort((a, b) => (wins.get(Number(b.id)) - wins.get(Number(a.id))) || ((Number(b.pct) || 0) - (Number(a.pct) || 0)));
        wildCandidates.slice(0, 3).forEach(team => qualified.add(Number(team.id)));
      }
      if (qualified.has(Number(teamId))) playoffHits += 1;
    }
    return {
      status: 'estimated',
      source: 'SKIP estimate',
      estimate: Number(((playoffHits / count) * 100).toFixed(1)),
      simulationCount: count,
      remainingGames: games.length,
      retrievedAt: new Date().toISOString(),
      method: 'Deterministic Monte Carlo using current MLB winning percentages, home-field adjustment, and remaining MLB schedule.',
    };
  } catch {
    return { status: 'unavailable', source: 'SKIP estimate', estimate: null, retrievedAt: new Date().toISOString() };
  }
}
// MiLB levels
export const getTripleAStandings = (season = SEASON) => fetchStandings('117,112',     season);
export const getDoubleAStandings = (season = SEASON) => fetchStandings('113,110,111', season);
export const getHighAStandings   = (season = SEASON) => fetchStandings('214,215,223', season);
export const getSingleAStandings = (season = SEASON) => fetchStandings('302,303',     season);
export const getMiLBStandings    = (leagueIds, season = SEASON) => fetchStandings(leagueIds, season);

// ═══════════════════════════════════════════════════════════════════════════
// STAT LEADERS — MLB + MiLB
// leaderCategories: homeRuns | battingAverage | onBasePlusSlugging |
//   earnedRunAverage | strikeouts | wins | saves | runsBattedIn |
//   stolenBases | hits | whip | inningsPitched | onBasePercentage |
//   sluggingPercentage | strikeoutsPer9Inn | walks
// ═══════════════════════════════════════════════════════════════════════════

export async function getStatLeaders(categories, season = SEASON, limit = 10, sportId = 1, playerPool = '') {
  const params = {
    leaderCategories: Array.isArray(categories) ? categories.join(',') : categories,
    season, sportId, limit,
  };
  if (playerPool) params.playerPool = playerPool;
  const data = await mlb('/stats/leaders', params);
  const out  = {};
  for (const cat of data.leagueLeaders || []) {
    out[cat.leaderCategory] = cat.leaders.map(l => ({
      rank:  l.rank,
      id:    l.person?.id,
      name:  l.person?.fullName || '',
      team:  l.team?.abbreviation || l.team?.name || '',
      value: l.value,
    }));
  }
  return out;
}

export async function getAllLeaders(season = SEASON) {
  const [hitting, pitching] = await Promise.all([
    getStatLeaders(['homeRuns','battingAverage','onBasePlusSlugging','runsBattedIn','stolenBases'], season, 10, 1),
    getStatLeaders(['earnedRunAverage','strikeouts','wins','saves','whip'], season, 10, 1, 'Qualified'),
  ]);
  return { ...hitting, ...pitching };
}

export const getMiLBLeaders = (categories, season = SEASON, levelId = 11, limit = 10) =>
  getStatLeaders(categories, season, limit, levelId);

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllTeams(sportId = 1) {
  const data = await mlb('/teams', { sportId, activeStatus: 'Active' }, { ttl: 10 * 60_000 });
  return (data.teams || []).map(t => ({
    id: t.id, name: t.name, abbr: t.abbreviation, short: t.shortName,
    venue: t.venue?.name, league: t.league?.name, division: t.division?.name,
    sport: t.sport?.name, sportId: t.sport?.id,
  }));
}

export async function getTeamAffiliates(mlbTeamId, season = SEASON) {
  const data = await mlb(`/teams/${mlbTeamId}/affiliates`, { season }, { ttl: 10 * 60_000, timeoutMs: 8_000 });
  return (data.teams || []).map(t => ({
    id: t.id, name: t.name, abbr: t.abbreviation,
    level: t.sport?.name || '', levelId: t.sport?.id || 0, league: t.league?.name || '',
  })).sort((a, b) => a.levelId - b.levelId);
}

export async function getTeamStats(teamId, group = 'hitting', season = SEASON) {
  const data   = await mlb(`/teams/${teamId}/stats`, { stats: 'season', group, season, sportIds: 1 }, { ttl: 60_000 });
  const grp    = findStatGroup(data.stats, group);
  return grp?.splits?.[0]?.stat || {};
}

// Current-season player rows for one MLB team. This is intentionally separate
// from getTeamStats: the team endpoint returns one aggregate row, while the
// /stats resource exposes the individual player splits needed for true team
// leaders and does not require a static roster snapshot.
export async function getTeamPlayerStats(teamId, group = 'hitting', season = SEASON) {
  const sortStat = group === 'pitching' ? 'earnedRunAverage' : 'homeRuns';
  const data = await mlb('/stats', {
    stats: 'season', group, season, sportIds: 1, teamId,
    limit: 100, hydrate: 'person', order: 'desc', sortStat,
  }, { ttl: 60_000 });
  const grp = findStatGroup(data.stats, group);
  return (grp?.splits || []).map(split => ({
    id: split.player?.id ?? split.person?.id ?? null,
    name: split.player?.fullName ?? split.person?.fullName ?? '',
    stat: split.stat || {},
    position: split.position?.abbreviation ?? split.player?.primaryPosition?.abbreviation ?? '',
  })).filter(row => row.id && row.name);
}

// Aggregate current-season team statistics. The MLB Stats API returns one
// split per team when no teamId is supplied; keeping this in one helper lets
// every team-facing view use the same authoritative snapshot rather than the
// older static examples in data.js.
export async function getAllTeamStats(group = 'hitting', season = SEASON) {
  const data = await mlb('/teams/stats', { stats: 'season', group, season, sportIds: 1 }, { ttl: 60_000 });
  const grp = findStatGroup(data.stats, group);
  return Object.fromEntries((grp?.splits || []).map(split => [
    split.team?.id,
    {
      ...split.stat,
      teamId: split.team?.id,
      teamAbbr: split.team?.abbreviation || '',
      teamName: split.team?.name || '',
    },
  ]));
}

export async function getTeamRoster(teamId, season = SEASON, rosterType = 'active') {
  const data = await mlb(`/teams/${teamId}/roster`, { rosterType, season, hydrate: 'person(currentTeam)' });
  return (data.roster || []).map(r => ({
    id: r.person?.id, name: r.person?.fullName, pos: r.position?.abbreviation, num: r.jerseyNumber,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVANT
// ═══════════════════════════════════════════════════════════════════════════

export async function getSavantData(year = SEASON) {
  const arr = await fetchLeaderboard(`/api/savant?endpoint=expected_statistics&year=${year}`);
  return Array.isArray(arr) ? arr : null;
}

export async function getTeamExitVelocity(teamAbbr, year = SEASON) {
  if (!teamAbbr) return null;
  const arr = await fetchLeaderboard(`/api/savant?endpoint=team_exit_velocity&year=${year}&team=${encodeURIComponent(teamAbbr)}`, { timeoutMs: 8_000 });
  return Array.isArray(arr) ? arr : null;
}
export async function getTeamBattedBalls(teamAbbr, year = SEASON) {
  if (!teamAbbr) return null;
  const arr = await fetchLeaderboard(`/api/savant?endpoint=team_batted_balls&year=${year}&team=${encodeURIComponent(teamAbbr)}`, { timeoutMs: 12_000 });
  return Array.isArray(arr) ? arr : null;
}
export async function getTeamBattedBallsAgainst(teamAbbr, year = SEASON) {
  if (!teamAbbr) return null;
  const arr = await fetchLeaderboard(`/api/savant?endpoint=team_batted_balls_against&year=${year}&team=${encodeURIComponent(teamAbbr)}`, { timeoutMs: 12_000 });
  return Array.isArray(arr) ? arr : null;
}

export async function getPlayerContactPoints(playerId, year = SEASON) {
  if (!playerId) return null;
  const arr = await fetchLeaderboard(`/api/savant?endpoint=contact_points&year=${year}&playerId=${encodeURIComponent(playerId)}`, { timeoutMs: 20_000 });
  return Array.isArray(arr) ? arr : null;
}

export async function getPitcherPitches(playerId, year = SEASON) {
  if (!playerId) return null;
  const arr = await fetchLeaderboard(`/api/savant?endpoint=pitcher_pitches&year=${year}&playerId=${encodeURIComponent(playerId)}`, { timeoutMs: 20_000 });
  return Array.isArray(arr) ? arr : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP PROSPECT STATS — mirrors mlb.com/prospects/stats/top-prospects
// Pulls hitting + pitching leaders across Triple-A and Double-A simultaneously.
// Returns { hitting: [...], pitching: [...] } each sorted by OPS / ERA.
// ═══════════════════════════════════════════════════════════════════════════
export async function getTopProspectStats(season = SEASON) {
  const HIT_CATS = ['battingAverage','onBasePlusSlugging','homeRuns','stolenBases','runsBattedIn'];
  const PIT_CATS = ['earnedRunAverage','strikeouts','whip','wins'];

  // playerPool must be one of the API's actual values — All | Qualified |
  // Rookies | Qualified_rookies. 'prospects' isn't a real value here (that
  // filter only exists on MLB Pipeline's own site, not this public API), so
  // it was silently being ignored and falling back to the API's default of
  // 'Qualified' — which requires a minimum PA/IP threshold and could drop a
  // recently-promoted prospect out of the leaderboard below before this
  // function's merge step ever gets a chance to match them by mlbId. 'All'
  // gets the complete top-15-by-OPS/ERA at each level; the merge against the
  // curated PROSPECT_BATTERS/PROSPECT_PITCHERS list below is what actually
  // limits results to real prospects, so widening the pool here only adds
  // coverage, it can't let a non-prospect leak into what's displayed.
  const [aaaHit, aaHit, aaaPit, aaPit] = await Promise.allSettled([
    getStatLeaders(HIT_CATS, season, 15, 11, 'All'),
    getStatLeaders(HIT_CATS, season, 15, 12, 'All'),
    getStatLeaders(PIT_CATS, season, 15, 11, 'All'),
    getStatLeaders(PIT_CATS, season, 15, 12, 'All'),
  ]);


  function mergeHitting(a, b) {
    const map = new Map();
    for (const src of [a, b]) {
      if (src.status !== 'fulfilled') continue;
      const res = src.value;
      const opsList = res.onBasePlusSlugging || [];
      const avgList = res.battingAverage    || [];
      const hrList  = res.homeRuns           || [];
      const rbiList = res.runsBattedIn       || [];
      const sbList  = res.stolenBases        || [];
      opsList.forEach(p => {
        const existing = map.get(p.id);
        if (!existing || +p.value > +(existing.ops||0)) {
          map.set(p.id, {
            id: p.id, name: p.name, team: p.team,
            ops: p.value,
            avg: avgList.find(x=>x.id===p.id)?.value  || '—',
            hr:  hrList .find(x=>x.id===p.id)?.value  || '—',
            rbi: rbiList.find(x=>x.id===p.id)?.value  || '—',
            sb:  sbList .find(x=>x.id===p.id)?.value  || '—',
          });
        }
      });
    }
    return [...map.values()].sort((a,b) => +(b.ops||0) - +(a.ops||0)).slice(0, 20);
  }

  function mergePitching(a, b) {
    const map = new Map();
    for (const src of [a, b]) {
      if (src.status !== 'fulfilled') continue;
      const res = src.value;
      const eraList  = res.earnedRunAverage || [];
      const kList    = res.strikeouts       || [];
      const whipList = res.whip             || [];
      const wList    = res.wins             || [];
      eraList.forEach(p => {
        const existing = map.get(p.id);
        if (!existing || +p.value < +(existing.era||99)) {
          map.set(p.id, {
            id: p.id, name: p.name, team: p.team,
            era:  p.value,
            k:    kList  .find(x=>x.id===p.id)?.value || '—',
            whip: whipList.find(x=>x.id===p.id)?.value|| '—',
            w:    wList   .find(x=>x.id===p.id)?.value|| '—',
          });
        }
      });
    }
    return [...map.values()].sort((a,b) => +(a.era||99) - +(b.era||99)).slice(0, 20);
  }

  return {
    hitting:  mergeHitting(aaaHit, aaHit),
    pitching: mergePitching(aaaPit, aaPit),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAFT RESULTS — real, live results from statsapi.mlb.com/api/v1/draft/{year}
// Distinct from the curated pre-draft SKIP Big Board in constants/data.js:
// this is what actually happened on draft day — real drafting team, real
// signing bonus, full bio — once picks start getting made.
// ═══════════════════════════════════════════════════════════════════════════

function normalizeDraftPick(p) {
  const person = p.person || {};
  return {
    round:        p.pickRound,
    pick:         p.pickNumber,
    roundPick:    p.roundPickNumber,
    rank:         p.rank ?? null,
    pickValue:    p.pickValue    ? Number(p.pickValue)    : null,
    signingBonus: p.signingBonus ? Number(p.signingBonus) : null,
    id:           person.id ?? null,
    name:         person.fullName || '',
    firstName:    person.firstName || '',
    lastName:     person.lastName  || '',
    height:       person.height || '',
    weight:       person.weight || null,
    birthDate:    person.birthDate || null,
    age:          person.currentAge ?? null,
    birthCity:    person.birthCity || '',
    birthState:   person.birthStateProvince || '',
    birthCountry: person.birthCountry || '',
    bats:         person.batSide?.code   || '',
    throws:       person.pitchHand?.code || '',
    pos:          person.primaryPosition?.abbreviation || '',
    posType:      person.primaryPosition?.type || '',
    mlbDebutDate: person.mlbDebutDate || null,
    school:       p.school?.name       || 'No School',
    schoolClass:  p.school?.schoolClass|| '',
    schoolState:  p.school?.state      || '',
    homeCity:     p.home?.city  || '',
    homeState:    p.home?.state || '',
    homeCountry:  p.home?.country || '',
    team:         p.team?.name || '',
    teamId:       p.team?.id   ?? null,
    blurb:        p.blurb || '',
    headshotLink: p.headshotLink || '',
    scoutingReport: p.scoutingReport || '',
    isDrafted:    !!p.isDrafted,
    isPass:       !!p.isPass,
  };
}

export async function getDraftResults(year) {
  try {
    const data   = await mlb(`/draft/${year}`, {}, { ttl: 10 * 60_000 }); // 10min — results don't change once picked
    const rounds = data?.drafts?.rounds || [];
    const picks  = rounds.flatMap(r => (r.picks || []).map(normalizeDraftPick));
    return { year, rounds: rounds.map(r => r.round), picks };
  } catch {
    return { year, rounds: [], picks: [] };
  }
}

/** Round 1 only (+ competitive-balance round "1C") — the common case for a Big Board view. */
export async function getFirstRoundResults(year) {
  const { picks, ...rest } = await getDraftResults(year);
  return { ...rest, picks: picks.filter(p => p.round === '1' || p.round === '1C') };
}

export async function getTeamAggregateWar(teamName, season = SEASON) {
  if (!teamName) return null;
  const params = new URLSearchParams({ mode: 'aggregate', season: String(season) });
  try {
    const response = await fetch(`/api/fangraphs-models?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const data = await response.json();
    const selected = (data?.teams || []).find(row => String(row.team).toLowerCase() === String(teamName).toLowerCase());
    return selected?.totalWAR == null ? null : { teamWar: selected.totalWAR, source: 'FanGraphs aggregate Team WAR', freshness: data.freshness || 'live', retrievedAt: data.retrievedAt || data.servedAt, status: data.statuses?.batting === 'live' && data.statuses?.pitching === 'live' ? 'live' : 'partial' };
  } catch {
    return null;
  }
}
export async function getTeamModelSources(teamAbbr, season = SEASON) {
  const params = new URLSearchParams({ team: String(teamAbbr || '').toUpperCase(), season: String(season) });
  try {
    const response = await fetch(`/api/fangraphs-models?${params.toString()}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Model source request failed (${response.status})`);
    return await response.json();
  } catch {
    return {
      found: false,
      retrievedAt: new Date().toISOString(),
      source: 'FanGraphs',
      sourceUrls: {
        playoffOdds: 'https://www.fangraphs.com/standings/playoff-odds/fg/mlb',
        teamWar: 'https://www.fangraphs.com/depthcharts.aspx?position=Team',
      },
      playoffOdds: null,
      teamWar: null,
      statuses: { playoffOdds: 'request-failed', teamWar: 'request-failed' },
    };
  }
}

export const MILB_STANDINGS_LEAGUES = {
  11: '117,112',
  12: '113,110,111',
  13: '214,215,223',
  14: '302,303',
};

export async function getMinorLeagueTeamOverview(teamId, levelId = 11, season = SEASON) {
  const leagueId = MILB_STANDINGS_LEAGUES[levelId];
  if (!teamId || !leagueId) return null;
  try {
    const [teamResult, hittingResult, pitchingResult] = await Promise.allSettled([
      mlb(`/teams/${teamId}`, { hydrate: 'venue,league,division,sport' }, { ttl: 10 * 60_000, timeoutMs: 6_000 }),
      mlb(`/teams/${teamId}/stats`, { stats: 'season', group: 'hitting', season, sportIds: levelId }, { ttl: 5 * 60_000, timeoutMs: 6_000 }),
      mlb(`/teams/${teamId}/stats`, { stats: 'season', group: 'pitching', season, sportIds: levelId }, { ttl: 5 * 60_000, timeoutMs: 6_000 }),
    ]);
    const team = teamResult.status === 'fulfilled' ? teamResult.value?.teams?.[0] : null;
    const hitting = hittingResult.status === 'fulfilled' ? findStatGroup(hittingResult.value?.stats, 'hitting')?.splits?.[0]?.stat || {} : {};
    const pitching = pitchingResult.status === 'fulfilled' ? findStatGroup(pitchingResult.value?.stats, 'pitching')?.splits?.[0]?.stat || {} : {};
    if (!team && !Object.keys(hitting).length && !Object.keys(pitching).length) return null;
    return {
      id: team?.id || teamId,
      name: team?.name || '',
      abbr: team?.abbreviation || '',
      levelId,
      level: team?.sport?.name || '',
      league: team?.league?.name || '',
      division: team?.division?.name || '',
      venue: team?.venue?.name || '',
      hitting,
      pitching,
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getMinorLeagueTeamStandings(teamId, levelId = 11, season = SEASON) {
  const leagueId = MILB_STANDINGS_LEAGUES[levelId];
  if (!teamId || !leagueId) return { rows: [], retrievedAt: new Date().toISOString(), status: 'source-gap' };
  try {
    const data = await fetchStandings(leagueId, season);
    const rows = Object.values(data).flat().map((row, index) => ({ ...row, rank: row.divRank || index + 1 }));
    return { rows, retrievedAt: new Date().toISOString(), status: rows.length ? 'live' : 'source-gap' };
  } catch {
    return { rows: [], retrievedAt: new Date().toISOString(), status: 'upstream-unavailable' };
  }
}

export async function getMinorLeagueTeamSchedule(teamId, levelId = 11, season = SEASON, days = 14) {
  if (!teamId || !MILB_STANDINGS_LEAGUES[levelId]) return { games: [], retrievedAt: new Date().toISOString(), status: 'source-gap' };
  try {
    const start = new Date();
    const end = new Date(start.getTime() + Math.max(1, Number(days)) * 86400000);
    const data = await mlb('/schedule', {
      sportIds: String(levelId),
      teamId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      hydrate: 'linescore,team',
      language: 'en',
    }, { ttl: 60_000 });
    const games = (data.dates || []).flatMap(date => (date.games || []).map(normalizeGame));
    return { games, retrievedAt: new Date().toISOString(), status: games.length ? 'live' : 'source-gap' };
  } catch {
    return { games: [], retrievedAt: new Date().toISOString(), status: 'upstream-unavailable' };
  }
}

export async function getTeamSavantMetrics(teamAbbr, year = SEASON) {
  try {
    const rows = await getSavantData(year);
    const target = String(teamAbbr || '').toUpperCase();
    const teamRows = (Array.isArray(rows) ? rows : []).filter(row => {
      const rowTeam = String(row.team_abbr || row.team || row.team_name || '').toUpperCase();
      return rowTeam === target || rowTeam.includes(target);
    });
    const average = key => {
      const values = teamRows.map(row => Number(row[key])).filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const freshness = teamRows.__providerMeta?.freshness || 'live';
    return {
      status: teamRows.length ? freshness === 'stale-cached' ? 'cached' : 'live' : 'source-gap',
      source: 'Baseball Savant',
      freshness,
      retrievedAt: new Date().toISOString(),
      sampleSize: teamRows.length,
      expectedBA: average('est_ba'),
      expectedSLG: average('est_slg'),
      expectedWOBA: average('est woba') ?? average('est_woba'),
      exitVelocity: average('exit_velocity_avg'),
      hardHitPercent: average('hard_hit_percent'),
      barrelPercent: average('brl_percent'),
      launchAngle: average('launch_angle'),
    };
  } catch {
    return { status: 'upstream-unavailable', source: 'Baseball Savant', retrievedAt: new Date().toISOString(), sampleSize: 0 };
  }
}
