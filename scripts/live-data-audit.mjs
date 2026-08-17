import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SKIP_AUDIT_BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('audit-results');
const now = new Date().toISOString();
const season = 2026;
const encodeMlb = (pathValue, params = {}) => {
  const query = new URLSearchParams({ path: pathValue, ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])) });
  return `/api/mlb?${query}`;
};

const probes = [
  { area:'MLB identity', name:'League team directory', url:encodeMlb('/teams', { sportId:1 }), expected:'teams' },
  { area:'MLB identity', name:'Dodgers organization metadata', url:encodeMlb('/teams/119', { hydrate:'venue,league,division,sport' }), expected:'teams' },
  { area:'MLB overview', name:'Dodgers hitting aggregate', url:encodeMlb('/teams/119/stats', { stats:'season', group:'hitting', season }), expected:'stats' },
  { area:'MLB overview', name:'Dodgers pitching aggregate', url:encodeMlb('/teams/119/stats', { stats:'season', group:'pitching', season }), expected:'stats' },
  { area:'MLB roster', name:'Dodgers active roster', url:encodeMlb('/teams/119/roster', { rosterType:'active', season }), expected:'roster' },
  { area:'MLB organization', name:'Dodgers affiliates', url:encodeMlb('/teams/119/affiliates', { season }), expected:'teams' },
  { area:'MLB schedule', name:'League schedule', url:encodeMlb('/schedule', { sportId:1, date:'2026-08-17', hydrate:'linescore,team' }), expected:'dates' },
  { area:'MLB standings', name:'League standings', url:encodeMlb('/standings', { leagueId:'103,104', season, standingsTypes:'regularSeason' }), expected:'records' },
  { area:'MLB player', name:'Shohei Ohtani profile', url:encodeMlb('/people/660271', { hydrate:'currentTeam' }), expected:'people' },
  { area:'MLB player', name:'Shohei Ohtani hitting season', url:encodeMlb('/people/660271/stats', { stats:'season', group:'hitting', season }), expected:'stats' },
  { area:'MLB player', name:'Shohei Ohtani pitching season', url:encodeMlb('/people/660271/stats', { stats:'season', group:'pitching', season }), expected:'stats' },
  { area:'MLB player', name:'Shohei Ohtani career splits', url:encodeMlb('/people/660271/stats', { stats:'yearByYear', group:'hitting' }), expected:'stats' },
  { area:'MLB player', name:'Player search', url:encodeMlb('/people/search', { names:'Shohei Ohtani', limit:5, sportId:'1,11,12,13,14,15,16,17,5442' }), expected:'people' },
  { area:'Baseball Savant', name:'Expected statistics leaderboard', url:`/api/savant?endpoint=expected_statistics&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Statcast leaderboard', url:`/api/savant?endpoint=statcast_leaderboard&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Bat tracking leaderboard', url:`/api/savant?endpoint=bat-tracking&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Sprint speed leaderboard', url:`/api/savant?endpoint=sprint_speed&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Outs above average leaderboard', url:`/api/savant?endpoint=oaa&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Pitch arsenal leaderboard', url:`/api/savant?endpoint=pitch_arsenal&year=${season}`, expected:'array' },
  { area:'Baseball Savant', name:'Ohtani contact-points sample', url:`/api/savant?endpoint=contact_points&year=${season}&playerId=660271`, expected:'array' },
  { area:'FanGraphs', name:'Dodgers model', url:`/api/fangraphs-models?team=LAD&season=${season}`, expected:'object' },
  { area:'FanGraphs', name:'Aggregate team WAR', url:`/api/fangraphs-models?mode=aggregate&season=${season}`, expected:'object' },
  { area:'Financials', name:'Dodgers payroll and CBT', url:`/api/team-financials?team=LAD&season=${season}`, expected:'object' },
  { area:'Contracts', name:'Shohei Ohtani contract', url:'/api/contract?id=660271&name=Shohei%20Ohtani', expected:'object' },
  { area:'Provider identity', name:'Ohtani cross-provider ID', url:'/api/player-identity?mlbId=660271&name=Shohei%20Ohtani', expected:'object' },
  { area:'News', name:'League news feed', url:'/api/news?limit=10', expected:'object' },
  { area:'News', name:'Intel feed', url:'/api/feed?handle=MLB&n=10', expected:'object' },
  { area:'Calculated intelligence', name:'Dodgers decision metrics', url:`/api/intelligence-calculations?teamId=119&season=${season}`, expected:'object' },
];

function contentSummary(payload) {
  if (Array.isArray(payload)) return { kind:'array', rows:payload.length, keys:Object.keys(payload[0] || {}).slice(0, 12) };
  if (!payload || typeof payload !== 'object') return { kind:typeof payload };
  const nestedCounts = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) nestedCounts[key] = value.length;
  }
  return {
    kind:'object',
    keys:Object.keys(payload).slice(0, 20),
    nestedCounts,
    found:payload.found,
    error:payload.error || null,
    providerBlocked:Boolean(payload.providerBlocked),
    freshness:payload.freshness || null,
  };
}

function classify({ status, payload, error }) {
  if (error) return 'transport-error';
  if (status < 200 || status >= 300) return 'http-error';
  if (payload?.found === false) return payload?.providerBlocked ? 'provider-blocked' : 'unavailable';
  if (Array.isArray(payload)) return payload.length ? 'loaded' : 'empty';
  const knownRows = Object.values(payload || {}).filter(Array.isArray).reduce((total, rows) => total + rows.length, 0);
  if (knownRows > 0) return 'loaded';
  if (payload && typeof payload === 'object' && !payload.error) return 'loaded';
  return 'unavailable';
}

async function probe(item) {
  const startedAt = Date.now();
  const url = new URL(item.url, baseUrl).toString();
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(25_000) });
    const body = await response.text();
    let payload = null;
    try { payload = JSON.parse(body); } catch { payload = { nonJsonPreview:body.slice(0, 280) }; }
    const result = {
      ...item,
      status:response.status,
      ok:response.ok,
      durationMs:Date.now() - startedAt,
      cache:response.headers.get('x-provider-cache') || response.headers.get('x-vercel-cache') || null,
      contentType:response.headers.get('content-type') || null,
      summary:contentSummary(payload),
    };
    result.classification = classify({ status:result.status, payload, error:null });
    return result;
  } catch (error) {
    return {
      ...item,
      status:null,
      ok:false,
      durationMs:Date.now() - startedAt,
      cache:null,
      contentType:null,
      summary:{ kind:'error', message:error?.message || String(error) },
      classification:'transport-error',
    };
  }
}

const results = [];
for (const item of probes) {
  const result = await probe(item);
  results.push(result);
  process.stdout.write(`${result.classification.padEnd(18)} ${String(result.status ?? '-').padEnd(4)} ${String(result.durationMs).padStart(5)}ms  ${item.area} · ${item.name}\n`);
  await new Promise(resolve => setTimeout(resolve, 180));
}

const counts = results.reduce((total, result) => {
  total[result.classification] = (total[result.classification] || 0) + 1;
  return total;
}, {});
const report = { auditedAt:now, baseUrl, probeCount:results.length, counts, results };
await fs.mkdir(outputDir, { recursive:true });
await fs.writeFile(path.join(outputDir, 'live-data-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  '# Live Data Audit',
  '',
  `Audited at: ${now}`,
  '',
  '| Area | Probe | Status | State | Duration | Cache | Rows / payload |',
  '| --- | --- | ---: | --- | ---: | --- | --- |',
  ...results.map(result => {
    const rowSummary = result.summary?.rows ?? Object.entries(result.summary?.nestedCounts || {}).map(([key, count]) => `${key}: ${count}`).join(', ');
    const rows = result.summary?.found === false
      ? 'No verified data'
      : rowSummary || result.summary?.error || result.summary?.kind || '—';
    return `| ${result.area} | ${result.name} | ${result.status ?? '—'} | ${result.classification} | ${result.durationMs} ms | ${result.cache || '—'} | ${String(rows).replaceAll('|', '/')} |`;
  }),
  '',
  '## Classification totals',
  '',
  ...Object.entries(counts).map(([name, count]) => `- ${name}: ${count}`),
  '',
];
await fs.writeFile(path.join(outputDir, 'live-data-audit.md'), `${lines.join('\n')}\n`);
