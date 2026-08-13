// SKIP — NCAA College Baseball API Client
// Proxies through /api/ncaa (Vercel serverless) → ncaa-api.henrygd.me → ncaa.com
//
// Public API: https://ncaa-api.henrygd.me (5 req/sec per IP)
// Self-host for production: docker run --rm -p 3000:3000 henrygd/ncaa-api
//
// URL pattern mirrors ncaa.com exactly:
//   ncaa.com/scoreboard/baseball/d1/2026/05/all-conf
//   → GET /scoreboard/baseball/d1/2026/05/all-conf
//
// BASEBALL D1 SPORT KEY: "baseball/d1"
// DATE FORMAT:
//   - Scoreboard uses YYYY/WW (week number) or YYYY/MM for baseball
//   - Schedule uses YYYY/MM
//
// STAT CATEGORIES (individual, category IDs):
//   Hitting:  750=BA, 751=OBP, 752=SLG, 753=OPS, 754=HR, 755=RBI, 756=SB,
//             757=Runs, 758=H, 759=2B, 760=3B, 761=BB, 762=SO, 763=HBP
//   Pitching: 148=ERA, 149=W, 150=SV, 151=IP, 152=K, 153=WHIP, 154=K/9,
//             155=BB/9, 156=H/9
//   Team:     28=Offense, 29=Pitching

const BASE = '/api/ncaa';
const SPORT = 'baseball/d1';

// Same rationale as the cache in src/api/mlb.js: LeaguePage's NcaaWatchPanel
// re-fetches on every mount, and switching tabs away and back remounts it —
// college baseball scoreboards/rankings/standings don't change fast enough
// for that to need a fresh network round-trip every single time.
const CACHE_TTL_MS = 60_000;
const cache    = new Map();
const inFlight = new Map();

// ─── Core fetcher ─────────────────────────────────────────────────────────
async function ncaa(path, params = {}, { cache: useCache = true, ttl = CACHE_TTL_MS } = {}) {
  const qs  = new URLSearchParams(params).toString();
  const url = `${BASE}?path=${encodeURIComponent(path)}${qs ? '&' + qs : ''}`;

  if (useCache) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.data;
    if (hit) cache.delete(url);
    const pending = inFlight.get(url);
    if (pending) return pending;
  }

  const request = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `NCAA API ${res.status} for ${path}`);
    }
    // Same defensive fix as src/api/mlb.js's mlb()/fetchLeaderboard() — a
    // 200 with a non-JSON body used to throw a raw SyntaxError straight
    // out of res.json(), and that error's .message is shown to the user
    // verbatim (OtherPages.jsx: `setError(err.message || '...')`).
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`NCAA API returned an unreadable response — ${path}`);
    }
    if (useCache) cache.set(url, { data, expires: Date.now() + ttl });
    return data;
  })();

  if (useCache) {
    inFlight.set(url, request);
    // See the matching fix in src/api/mlb.js's mlb() — .finally() returns a
    // new derived promise that also rejects when `request` does, and since
    // nothing else references that specific derived promise, it surfaces
    // as its own unhandled rejection independent of the caller's handling
    // of the actual `request` reference returned below.
    request.finally(() => inFlight.delete(url)).catch(() => {});
  }
  return request;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOREBOARD — Live + Recent Scores
// ═══════════════════════════════════════════════════════════════════════════

// Get D1 baseball scoreboard for a given date
// date: 'YYYY/MM' (e.g. '2026/05') or 'YYYY/WW' week format
// conf: 'all-conf' | conference seo slug (e.g. 'acc', 'sec', 'pac-12')
export async function getScoreboard(date, conf = 'all-conf') {
  const d    = date || getYearMonth();
  const data = await ncaa(`/scoreboard/${SPORT}/${d}/${conf}`);
  return (data.games || []).map(g => normalizeGame(g.game));
}

// Today's D1 baseball games (uses current month)
export async function getTodaysCollegeGames(conf = 'all-conf') {
  return getScoreboard(getYearMonth(), conf);
}

// Get scoreboard for a specific date (YYYY-MM-DD → YYYY/MM for baseball)
export async function getScoreboardForDate(isoDate, conf = 'all-conf') {
  const d = isoDate.slice(0, 7).replace('-', '/');
  return getScoreboard(d, conf);
}

function getYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeGame(g) {
  if (!g) return null;
  return {
    gameId:   g.gameID,
    url:      g.url,        // '/game/6305900' — use for box score / PBP
    title:    g.title,
    status:   g.gameState,  // 'final' | 'live' | 'pre'
    network:  g.network,
    startTime:g.startTime,
    startDate:g.startDate,
    location: g.location,
    finalMsg: g.finalMessage,
    away: {
      name:        g.away?.names?.full   || '',
      short:       g.away?.names?.short  || '',
      seo:         g.away?.names?.seo    || '',
      score:       g.away?.score != null ? parseInt(g.away.score) : null,
      winner:      g.away?.winner || false,
      rank:        g.away?.rank   || '',
      seed:        g.away?.seed   || '',
      description: g.away?.description || '',
      conferences: (g.away?.conferences || []).map(c => c.conferenceSeo),
    },
    home: {
      name:        g.home?.names?.full   || '',
      short:       g.home?.names?.short  || '',
      seo:         g.home?.names?.seo    || '',
      score:       g.home?.score != null ? parseInt(g.home.score) : null,
      winner:      g.home?.winner || false,
      rank:        g.home?.rank   || '',
      seed:        g.home?.seed   || '',
      description: g.home?.description || '',
      conferences: (g.home?.conferences || []).map(c => c.conferenceSeo),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME DETAILS — Box Score, PBP, Team Stats
// ═══════════════════════════════════════════════════════════════════════════

// Extract gameId from URL like '/game/6305900' → '6305900'
export function parseGameId(urlOrId) {
  return String(urlOrId).replace(/.*\/game\//, '').replace(/\?.*/, '');
}

// General game info
export async function getGame(gameId) {
  return ncaa(`/game/${parseGameId(gameId)}`);
}

// Full box score: batting lines, pitching lines per team
export async function getBoxScore(gameId) {
  const data = await ncaa(`/game/${parseGameId(gameId)}/boxscore`);
  return normalizeBoxScore(data);
}

function normalizeBoxScore(data) {
  if (!data) return null;
  const teams = data.teams || [];
  return teams.map(team => ({
    name:    team.name || team.teamName || '',
    seo:     team.seo  || '',
    score:   team.score,
    hitting: (team.playerStats || team.hitters || []).map(p => ({
      name:   p.name || p.fullName || '',
      pos:    p.pos  || p.position || '',
      ab:     parseInt(p.ab  || p.atBats       || 0),
      r:      parseInt(p.r   || p.runs         || 0),
      h:      parseInt(p.h   || p.hits         || 0),
      rbi:    parseInt(p.rbi || p.rbiTotal      || 0),
      bb:     parseInt(p.bb  || p.walks         || 0),
      so:     parseInt(p.so  || p.strikeouts    || 0),
      avg:    p.avg  || p.battingAverage       || '',
    })),
    pitching: (team.pitcherStats || team.pitchers || []).map(p => ({
      name:   p.name || p.fullName || '',
      ip:     p.ip   || p.inningsPitched || '',
      h:      parseInt(p.h  || p.hitsAllowed    || 0),
      r:      parseInt(p.r  || p.runsAllowed     || 0),
      er:     parseInt(p.er || p.earnedRuns      || 0),
      bb:     parseInt(p.bb || p.walks           || 0),
      so:     parseInt(p.so || p.strikeouts      || 0),
      era:    p.era  || p.earnedRunAverage || '',
      result: p.result || '',  // W/L/S
    })),
    linescore: team.linescore || [],
  }));
}

// Play-by-play
export async function getPlayByPlay(gameId) {
  return ncaa(`/game/${parseGameId(gameId)}/play-by-play`);
}

// Scoring summary only
export async function getScoringSummary(gameId) {
  return ncaa(`/game/${parseGameId(gameId)}/scoring-summary`);
}

// Team stats for a game
export async function getGameTeamStats(gameId) {
  return ncaa(`/game/${parseGameId(gameId)}/team-stats`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS — Individual + Team Leaders
// ═══════════════════════════════════════════════════════════════════════════

// Individual stat leaderboard
// categoryId: see stat category IDs in header comments above
// 'current' = current season, or use specific year
export async function getIndividualStats(categoryId, year = 'current', page = 1) {
  const data = await ncaa(`/stats/${SPORT}/${year}/individual/${categoryId}`, { page });
  return normalizeStatLeaders(data);
}

// Team stat leaderboard (categoryId: 28=Offense, 29=Pitching)
export async function getTeamStats(categoryId = 28, year = 'current', page = 1) {
  const data = await ncaa(`/stats/${SPORT}/${year}/team/${categoryId}`, { page });
  return normalizeStatLeaders(data);
}

function normalizeStatLeaders(data) {
  if (!data) return [];
  const rows = data.data?.players || data.data || data.players || [];
  return rows.map((p, i) => ({
    rank:       p.Rank || p.rank || i + 1,
    name:       p['Player Name'] || p.player?.name || p.name || '',
    team:       p.Team          || p.team?.name    || p.team || '',
    teamSeo:    p.team?.seo     || '',
    conf:       p.Conf          || p.conference    || '',
    year:       p.Yr            || p.class         || '',
    value:      p.Val           || p.stat          || Object.values(p).find(v => typeof v === 'number' && v > 0) || '',
    // Raw row for additional columns
    raw: p,
  }));
}

// Convenience: get the main hitting leaders in parallel
export async function getHittingLeaders(year = 'current') {
  const [ba, hr, rbi, obp, slg, sb] = await Promise.all([
    getIndividualStats(750, year),  // BA
    getIndividualStats(754, year),  // HR
    getIndividualStats(755, year),  // RBI
    getIndividualStats(751, year),  // OBP
    getIndividualStats(752, year),  // SLG
    getIndividualStats(756, year),  // SB
  ]);
  return { ba, hr, rbi, obp, slg, sb };
}

// Convenience: get the main pitching leaders in parallel
export async function getPitchingLeaders(year = 'current') {
  const [era, k, wins, whip, sv, ip] = await Promise.all([
    getIndividualStats(148, year),  // ERA
    getIndividualStats(152, year),  // K
    getIndividualStats(149, year),  // W
    getIndividualStats(153, year),  // WHIP
    getIndividualStats(150, year),  // SV
    getIndividualStats(151, year),  // IP
  ]);
  return { era, k, wins, whip, sv, ip };
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDINGS
// ═══════════════════════════════════════════════════════════════════════════

export async function getStandings() {
  const data = await ncaa(`/standings/${SPORT}`);
  return normalizeStandings(data);
}

// Get standings for a specific conference (use conference seo slug)
// conf slug examples: 'acc', 'sec', 'big-12', 'pac-12', 'big-ten', 'american'
export async function getConferenceStandings(confSeo) {
  const all = await getStandings();
  return all.find(c => c.confSeo === confSeo || c.confName.toLowerCase().includes(confSeo.toLowerCase())) || null;
}

function normalizeStandings(data) {
  if (!data) return [];
  const divs = data.standings?.conferences || data.conferences || [];
  return divs.map(conf => ({
    confName: conf.conferenceName || conf.name || '',
    confSeo:  conf.conferenceSeo  || conf.seo  || '',
    teams: (conf.teams || conf.standings || []).map(t => ({
      name:     t.team?.names?.full  || t.name || '',
      short:    t.team?.names?.short || t.short || '',
      seo:      t.team?.names?.seo   || t.seo  || '',
      confW:    parseInt(t.confW  || t.conferenceWins   || 0),
      confL:    parseInt(t.confL  || t.conferenceLosses || 0),
      ovW:      parseInt(t.ovW    || t.overallWins      || 0),
      ovL:      parseInt(t.ovL    || t.overallLosses    || 0),
      confPct:  parseFloat(t.confPct  || 0),
      ovPct:    parseFloat(t.ovPct    || 0),
      streak:   t.streak || '',
      gb:       t.gb     || '',
      rank:     t.rank   || '',
    })),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// RANKINGS
// ═══════════════════════════════════════════════════════════════════════════

// Available ranking sources for baseball: 'baseball-america', 'd1baseball',
//   'collegiate-baseball', 'usa-today', 'ncaa-rpi'
export async function getRankings(source = 'd1baseball') {
  const data = await ncaa(`/rankings/${SPORT}/${source}`);
  return normalizeRankings(data);
}

// Get all major baseball polls in one call
export async function getAllRankings() {
  const sources = ['d1baseball', 'baseball-america', 'collegiate-baseball'];
  const results = await Promise.allSettled(sources.map(s => getRankings(s)));
  const out = {};
  sources.forEach((s, i) => {
    if (results[i].status === 'fulfilled') out[s] = results[i].value;
  });
  return out;
}

function normalizeRankings(data) {
  if (!data) return [];
  const rows = data.rankings || data.data?.rankings || [];
  return rows.map(r => ({
    rank:   r.rank    || r.Rank || '',
    prev:   r.prevRank|| r.Prev || '',
    name:   r.team?.names?.full  || r.team || r.name || '',
    short:  r.team?.names?.short || r.short || '',
    seo:    r.team?.names?.seo   || r.seo   || '',
    record: r.record || '',
    conf:   r.conference || '',
    points: r.points || '',
    firstPlaceVotes: r.firstPlaceVotes || '',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════

// Get schedule for a year/month range
// month: 'YYYY/MM' format — baseball season runs Feb–Jun
export async function getSchedule(yearMonth) {
  const ym   = yearMonth || getYearMonth();
  const data = await ncaa(`/schedule/${SPORT}/${ym}`);
  return data;
}

// Get the full current season schedule (Feb → Jun)
export async function getSeasonSchedule(year = 2026) {
  const months = ['02','03','04','05','06'];
  const results = await Promise.allSettled(
    months.map(m => getSchedule(`${year}/${m}`))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .flat();
}

// ═══════════════════════════════════════════════════════════════════════════
// NEWS
// ═══════════════════════════════════════════════════════════════════════════

export async function getNews(page = 1) {
  const data = await ncaa(`/news/${SPORT}`, { page });
  const items = data.items || data.articles || data.news || [];
  return items.map(a => ({
    title:       a.title || '',
    date:        a.pubDate || a.date || '',
    description: a.description || a.summary || '',
    link:        a.link || a.url || '',
    image:       a.thumbnail || a.image || '',
    source:      a.source || 'NCAA',
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// COLLEGE PLAYER SEARCH (via scoreboard data)
// ═══════════════════════════════════════════════════════════════════════════

// Search stat leaderboard for a player name (no dedicated search endpoint in NCAA API)
// Searches the hitting leaderboard by name — returns matching rows
export async function searchCollegePlayers(name, year = 'current') {
  const query = name.toLowerCase().trim();
  try {
    const data  = await ncaa(`/stats/${SPORT}/${year}/individual/750`, { page: 1 }); // BA leaders
    const rows  = normalizeStatLeaders(data);
    return rows.filter(r => r.name.toLowerCase().includes(query));
  } catch (_) { return []; }
}

// Get a player's stat line by looking them up across multiple categories
// Returns a compiled stat object for a named player
export async function getPlayerStatLine(name, year = 'current') {
  const [hitting, pitching] = await Promise.allSettled([
    searchAcrossCategories(name, [750,751,752,753,754,755,756,757,758], year),
    searchAcrossCategories(name, [148,149,150,151,152,153], year),
  ]);

  return {
    name,
    hitting:  hitting.status  === 'fulfilled' ? hitting.value  : null,
    pitching: pitching.status === 'fulfilled' ? pitching.value : null,
  };
}

async function searchAcrossCategories(name, categoryIds, year) {
  const query = name.toLowerCase().trim();
  const results = await Promise.allSettled(
    categoryIds.map(id => getIndividualStats(id, year, 1))
  );
  const found = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const match = r.value.find(p => p.name.toLowerCase().includes(query));
      if (match) found[categoryIds[i]] = match;
    }
  });
  return Object.keys(found).length > 0 ? found : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHOOLS
// ═══════════════════════════════════════════════════════════════════════════

export async function getSchoolsIndex() {
  const data = await ncaa('/schools-index');
  return data.schools || data || [];
}

// School logo URL helper
export function getSchoolLogoUrl(slug, dark = false) {
  return `https://ncaa-api.henrygd.me/logo/${slug}.svg${dark ? '?dark=true' : ''}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFERENCES — Common D1 Baseball conference seo slugs
// ═══════════════════════════════════════════════════════════════════════════

export const D1_BASEBALL_CONFERENCES = {
  acc:       { seo:'acc',             name:'ACC'              },
  sec:       { seo:'sec',             name:'SEC'              },
  big12:     { seo:'big-12',          name:'Big 12'           },
  bigten:    { seo:'big-ten',         name:'Big Ten'          },
  american:  { seo:'american',        name:'American Athletic' },
  sunbelt:   { seo:'sun-belt',        name:'Sun Belt'         },
  cusa:      { seo:'c-usa',           name:'Conference USA'   },
  maac:      { seo:'maac',            name:'MAAC'             },
  mvc:       { seo:'mo-valley',       name:'Missouri Valley'  },
  wcc:       { seo:'west-coast',      name:'West Coast'       },
  southland: { seo:'southland',       name:'Southland'        },
  horizon:   { seo:'horizon-league',  name:'Horizon League'   },
  colonial:  { seo:'colonial',        name:'CAA'              },
  southern:  { seo:'southern',        name:'Southern'         },
  bigwest:   { seo:'big-west',        name:'Big West'         },
  mountainwest:{ seo:'mwc',           name:'Mountain West'    },
};
