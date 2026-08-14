import React, { useState, useMemo, useEffect, useRef, memo, lazy, Suspense } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { TEAMS, SEASON as CURRENT_SEASON, sortTeamsByLeagueDivisionName } from '../constants/data.js';
import { getTodaysGames, getStandings, getAllTeamStats, getTeamPlayerStats, getTeamExitVelocity, getTeamBattedBalls, getTeamBattedBallsAgainst, getPlayerContactPoints, getPitcherPitches, fetchTeamFinancials, getTeamModelSources, getTeamAffiliates, getMinorLeagueTeamOverview, getMinorLeagueTeamStandings, getMinorLeagueTeamSchedule, getTeamScheduleSplits, getTeamSavantMetrics, getTeamAggregateWar, getGameFeedMetadata, getTeamVenueMetadata, getSkipPlayoffOddsEstimate } from '../api/mlb.js';
import { Panel, StatStrip, KVRow, SkeletonBlock } from '../components/atoms.jsx';
import { TeamOverviewSkeleton } from '../components/PageSkeletons.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import SourceProvenanceDrawer, { ProvenanceButton } from '../components/SourceProvenanceDrawer.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MetricInfo from '../components/MetricInfo.jsx';
import { openTab } from '../lib/navigation.js';
import { getTeamAccent } from '../lib/teamVisuals.js';
import { recordRecentView } from '../lib/recentHistory.js';
import { percentile } from '../lib/percentile.js';
import { buildCbtHistorySeasons, readCbtHistoryRange, saveCbtHistoryRange, CBT_HISTORY_OPTIONS } from '../lib/cbtHistory.js';
import { captureVerifiedSnapshot, deriveVerifiedTrends, formatTrendDelta, readVerifiedSnapshot } from '../lib/trendSnapshots.js';
import { readTeamAggregateCache, saveTeamAggregateCache, readTeamPlayersCache, saveTeamPlayersCache, readTeamSavantCache, saveTeamSavantCache } from '../lib/teamDataCache.js';

// Deferred-loading split (2026-08-12): these six charts are the only things
// on this page that need recharts (~85KB gzip, the largest chunk in the
// app). Overview is the default landing tab, so if this page imported
// recharts directly, that chunk would sit on the critical path for the very
// first paint — blocking rankings tables, stat strips, and every other
// non-chart panel from appearing, not just the charts themselves. Each is
// lazy-loaded from the same shared chunk (src/components/OverviewCharts.jsx)
// — six `import()` calls below, but the browser's module cache dedupes them
// to a single network fetch, not six. See that file's header comment for
// the full reasoning.
const OffenseRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.OffenseRadar })));
const StrengthRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.StrengthRadar })));
const RunDiffChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.RunDiffChart })));
const ArsenalPie = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.ArsenalPie })));

export const OVERVIEW_ACCENTS = Object.freeze({
  offense: C.amber,
  pitching: C.teal,
  defense: C.slate,
  context: C.purple,
});
const PositionOaaChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.PositionOaaChart })));
const EvDistributionChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.EvDistributionChart })));
const LuxuryTaxTrendChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.LuxuryTaxTrendChart })));

// Matches the ResponsiveContainer height of the chart it stands in for, so
// there's no layout shift when the real chart pops in.
export function OverviewEmptyState({ message, detail, status = 'Unavailable' }) {
  return <div className="skip-overview-empty-state" role="status">
    <span className="skip-overview-empty-mark" aria-hidden="true">—</span>
    <div className="skip-overview-empty-copy">
      <div className="skip-overview-empty-heading">
        <span className="skip-overview-empty-status">{status}</span>
        <span className="skip-overview-empty-separator" aria-hidden="true">·</span>
        <span className="skip-overview-empty-message">{message}</span>
      </div>
      {detail && <span className="skip-overview-empty-detail">{detail}</span>}
    </div>
  </div>;
}

function OverviewSourceBadge({ status }) {
  return <StatusBadge status={status} compact />;
}

function ChartFallback({ height }) {
  return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 8px' }}>
      <SkeletonBlock width="100%" height={Math.max(28, height - 24)} radius={6}/>
    </div>
  );
}

function pctToGrade(p) {
  if (!Number.isFinite(Number(p))) return '—';
  if (p >= 90) return 'A+'; if (p >= 80) return 'A'; if (p >= 70) return 'A-';
  if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'B-';
  if (p >= 30) return 'C+'; return 'C';
}
function ord(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  const value = Number(n);
  const s=['th','st','nd','rd'], v=value%100;
  return value+(s[(v-20)%10]||s[v]||s[0]);
}
function percentileLabel(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const n = Math.round(Number(value));
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
}
function formatTeamMetric(value, digits = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

export function buildLiveRunDiffData(team, season = CURRENT_SEASON) {
  if (team?.diff == null || team?.diff === '') return [];
  const diff = Number(team.diff);
  if (!Number.isFinite(diff)) return [];
  return [{ game: String(season), diff, cum: diff }];
}
function freshnessLabel(value) {
  if (!value) return 'not retrieved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'timestamp unavailable';
  return `retrieved ${date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}`;
}

export function formatDataAge(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return null;
  const age = Math.max(0, Number(now) - value);
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.max(1, Math.floor(age / 60_000))}m ago`;
  if (age < 86_400_000) return `${Math.max(1, Math.floor(age / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(age / 86_400_000))}d ago`;
}

function MetricValue({ value, loading, width = 42 }) {
  return loading ? <SkeletonBlock width={width} height={18} radius={4} style={{ margin:'0 auto' }} /> : value;
}

function humanizeFeedStatus(status, fallback = 'Unavailable') {
  const labels = {
    'live': 'Live',
    'ready': 'Verified',
    'cached': 'Cached verified data',
    'loading': 'Loading',
    'source-gap': 'Provider unavailable',
    'upstream-unavailable': 'Provider unavailable',
    'request-failed': 'Request failed',
    'unparsed': 'Provider returned unreadable data',
  };
  return labels[status] || (status ? String(status).replaceAll('-', ' ') : fallback);
}

function sumPlayerStat(rows = [], keys = []) {
  const values = rows.map(row => {
    for (const key of keys) {
      const value = Number(row?.stat?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function deriveTeamPlayerRollups(players = { hitting:[], pitching:[] }) {
  const hitters = Array.isArray(players.hitting) ? players.hitting : [];
  const pitchers = Array.isArray(players.pitching) ? players.pitching : [];
  const stolenBases = sumPlayerStat(hitters, ['stolenBases', 'sb']);
  const caughtStealing = sumPlayerStat(hitters, ['caughtStealing', 'cs']);
  const hits = sumPlayerStat(hitters, ['hits', 'h']);
  const extraBaseHits = [
    sumPlayerStat(hitters, ['doubles', '2B']),
    sumPlayerStat(hitters, ['triples', '3B']),
    sumPlayerStat(hitters, ['homeRuns', 'hr']),
  ].every(value => value != null)
    ? [sumPlayerStat(hitters, ['doubles', '2B']), sumPlayerStat(hitters, ['triples', '3B']), sumPlayerStat(hitters, ['homeRuns', 'hr'])].reduce((sum, value) => sum + value, 0)
    : null;
  const byPosition = new Map();
  [...hitters, ...pitchers].forEach(row => {
    const position = row?.position || '—';
    const current = byPosition.get(position) || { position, players:0, pa:0, ip:0 };
    current.players += 1;
    current.pa += Number(row?.stat?.plateAppearances || row?.stat?.pa) || 0;
    current.ip += Number(row?.stat?.inningsPitched || row?.stat?.ip) || 0;
    byPosition.set(position, current);
  });
  return {
    stolenBases,
    caughtStealing,
    stolenBaseAttempts: stolenBases != null && caughtStealing != null ? stolenBases + caughtStealing : null,
    extraBaseHits,
    extraBaseRate: extraBaseHits != null && hits ? extraBaseHits / hits : null,
    activePlayers: hitters.length || pitchers.length ? hitters.length + pitchers.length : null,
    positions: [...byPosition.values()].sort((a, b) => b.players - a.players || a.position.localeCompare(b.position)),
  };
}
function rankAmong(teams, key, asc=false) {
  const vals=Object.values(teams).map(t=>t[key]).sort((a,b)=>asc?a-b:b-a);
  return v=>vals.indexOf(v)+1;
}
function getSplits() {
  // MLB Stats API does not expose home/away, handedness, day/night, and
  // recent-form team splits through the aggregate endpoint used here. Do not
  // turn aggregate season totals into invented split values.
  return [];
}

function formatLeaderValue(value, digits = 0) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : String(value);
}

function formatPanelMetric(value, suffix = '') {
  return value == null || value === '' ? '—' : `${value}${suffix}`;
}

function getLeaders(hittingRows = [], pitchingRows = []) {
  const top = (rows, key, direction = 'desc') => [...rows]
    .filter(row => Number.isFinite(Number(row.stat?.[key])))
    .sort((a, b) => direction === 'asc'
      ? Number(a.stat[key]) - Number(b.stat[key])
      : Number(b.stat[key]) - Number(a.stat[key]))[0] || null;
  const hit = (cat, key, digits = 0, direction = 'desc') => {
    const row = top(hittingRows, key, direction);
    return { cat, player: row?.name || '—', val: row ? formatLeaderValue(row.stat[key], digits) : '—' };
  };
  const pit = (cat, key, digits = 0, direction = 'desc') => {
    const row = top(pitchingRows, key, direction);
    return { cat, player: row?.name || '—', val: row ? formatLeaderValue(row.stat[key], digits) : '—' };
  };
  return {
    batting: [hit('HR', 'homeRuns'), hit('AVG', 'avg', 3), hit('OPS', 'ops', 3), hit('SB', 'stolenBases')],
    pitching: [pit('ERA', 'era', 2, 'asc'), pit('K', 'strikeOuts'), pit('WHIP', 'whip', 2, 'asc')],
  };
}

function getBattedBall() { return null; }
function getPitchArsenal() { return null; }

export function buildBattedBallProfile(rows = []) {
  const speeds = rows.map(row => Number(row?.launch_speed)).filter(Number.isFinite);
  const angles = rows.map(row => Number(row?.launch_angle)).filter(Number.isFinite);
  if (!speeds.length) return null;
  const count = speeds.length;
  const pct = value => Number((value / count * 100).toFixed(1));
  const bbTypes = rows.map(row => String(row?.bb_type || '').toLowerCase()).filter(value => value && value !== 'null' && value !== 'undefined');
  const classifiedBarrels = rows.filter(row => {
    const raw = row?.launch_speed_angle;
    return raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
  });
  const barrels = classifiedBarrels.filter(row => Number(row.launch_speed_angle) === 6).length;
  return {
    barrelPct: classifiedBarrels.length ? pct(barrels) : null,
    hardHitPct: pct(speeds.filter(value => value >= 95).length),
    sweetSpot: pct(angles.filter(value => value >= 8 && value <= 32).length),
    avgEV: (speeds.reduce((sum, value) => sum + value, 0) / count).toFixed(1),
    maxEV: Math.max(...speeds).toFixed(1),
    launchAngle: angles.length ? (angles.reduce((sum, value) => sum + value, 0) / angles.length).toFixed(1) : null,
    pullPct: null,
    centerPct: null,
    oppoPct: null,
    gbPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'ground_ball').length) : null,
    fbPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'fly_ball' || value === 'popup').length) : null,
    ldPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'line_drive').length) : null,
    sampleSize: count,
  };
}

const ARSENAL_COLORS = [C.amber, C.teal, C.rust, C.purple, C.slate, C.navy];
export function buildPitchArsenalRows(rows = []) {
  const typed = rows.filter(row => row?.pitch_type);
  if (!typed.length) return null;
  const groups = new Map();
  typed.forEach(row => {
    const type = String(row.pitch_type);
    const group = groups.get(type) || { type, count: 0, speeds: [] };
    group.count += 1;
    const speed = Number(row.release_speed);
    if (Number.isFinite(speed)) group.speeds.push(speed);
    groups.set(type, group);
  });
  const total = typed.length;
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((group, index) => ({
    type: group.type,
    pct: Number((group.count / total * 100).toFixed(1)),
    stuffPlus: null,
    avgVelocity: group.speeds.length ? Number((group.speeds.reduce((sum, value) => sum + value, 0) / group.speeds.length).toFixed(1)) : null,
    color: ARSENAL_COLORS[index % ARSENAL_COLORS.length],
    count: group.count,
  }));
}

export async function resolveTeamSavantSnapshot({
  teamAbbr,
  season,
  cached,
  hitters = [],
  pitchers = [],
  now = Date.now(),
  cacheTtlMs = 60 * 60 * 1000,
  getTeamExitVelocityFn = getTeamExitVelocity,
  getTeamBattedBallsFn = null,
  getPlayerContactPointsFn = getPlayerContactPoints,
  getPitcherPitchesFn = getPitcherPitches,
  saveCacheFn = () => {},
} = {}) {
  if (cached && now - Number(cached.updatedAt || 0) < cacheTtlMs) {
    return { snapshot: cached.data, source: 'Baseball Savant Statcast Search · cached verified roster rollup', cacheHit: true };
  }
  const [directRows, directBattedRows] = await Promise.all([
    getTeamExitVelocityFn(teamAbbr, season).catch(() => null),
    typeof getTeamBattedBallsFn === 'function' ? getTeamBattedBallsFn(teamAbbr, season).catch(() => null) : Promise.resolve(null),
  ]);
  const contactRows = Array.isArray(directRows) && directRows.length
    ? directRows
    : (await Promise.all(hitters.filter(row => row?.id).map(row => getPlayerContactPointsFn(row.id, season).catch(() => null)))).flatMap(result => Array.isArray(result) ? result : []);
  const pitchRows = (await Promise.all(pitchers.filter(row => row?.id).map(row => getPitcherPitchesFn(row.id, season).catch(() => null)))).flatMap(result => Array.isArray(result) ? result : []);
  const source = Array.isArray(directBattedRows) && directBattedRows.length
    ? 'Baseball Savant Statcast Search · verified team batted-ball query'
    : Array.isArray(directRows) && directRows.length
      ? 'Baseball Savant Statcast Search · team query'
      : (contactRows.length || pitchRows.length ? 'Baseball Savant Statcast Search · verified roster rollup' : '');
  const snapshot = { exitVelocityRows: contactRows, battedBallRows: Array.isArray(directBattedRows) && directBattedRows.length ? directBattedRows : contactRows, pitchRows };
  saveCacheFn(teamAbbr, season, snapshot);
  return { snapshot, source, cacheHit: false };
}

export function buildExitVelocityBins(rows = []) {
  const speeds = rows
    .map(row => row?.launch_speed)
    .filter(value => value != null && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  if (!speeds.length) return [];
  const buckets = new Map();
  speeds.forEach(speed => {
    const mph = Math.max(50, Math.min(115, Math.floor(speed / 5) * 5));
    buckets.set(mph, (buckets.get(mph) || 0) + 1);
  });
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mph, count]) => ({ mph, pct: Number((count / speeds.length * 100).toFixed(1)), count }));
}

// Front office evaluation (seeded per team)
export function buildTeamStrengthData({ offense, power, speed, contact, pitching, command } = {}) {
  return [
    { axis:'Offense', val:offense },
    { axis:'Power', val:power },
    { axis:'Speed', val:speed },
    { axis:'Contact', val:contact },
    { axis:'Pitching', val:pitching },
    { axis:'Command', val:command },
  ].filter(row => row.val != null && Number.isFinite(Number(row.val)))
    .map(row => ({ ...row, val:Number(row.val) }));
}

export function buildLiveRadarData({ team = {}, liveTeamData, runDiff = null } = {}) {
  const records = Object.values(liveTeamData?.byAbbr || {});
  const hittingRecords = records.map(row => row?.hitting).filter(Boolean);
  const pitchingRecords = records.map(row => row?.pitching).filter(Boolean);
  const standingsRecords = records.map(row => row?.standings).filter(Boolean);
  const rankValue = (value, rows, keys, higher = true) => {
    if (value == null || value === '') return null;
    const current = Number(value);
    if (!Number.isFinite(current)) return null;
    const values = rows.map(row => keys.map(key => Number(row?.[key])).find(Number.isFinite)).filter(Number.isFinite);
    return values.length ? percentile(current, values, higher) : null;
  };
  const offense = rankValue(team.ops, hittingRecords, ['ops']);
  const power = rankValue(team.hr, hittingRecords, ['homeRuns']);
  const speed = rankValue(team.sb, hittingRecords, ['stolenBases']);
  const contact = rankValue(team.avg, hittingRecords, ['avg']);
  const pitching = rankValue(team.era, pitchingRecords, ['era'], false);
  const command = rankValue(team.whip, pitchingRecords, ['whip'], false);
  const offenseData = [
    { axis:'OPS', val:offense },
    { axis:'SLG', val:rankValue(team.slg, hittingRecords, ['slg']) },
    { axis:'OBP', val:rankValue(team.obp, hittingRecords, ['obp']) },
    { axis:'HR', val:power },
    { axis:'SB', val:speed },
    { axis:'Run Diff', val:rankValue(runDiff, standingsRecords, ['diff']) },
  ].filter(row => row.val != null);
  return {
    offenseData,
    strengthData: buildTeamStrengthData({ offense, power, speed, contact, pitching, command }),
    source: offenseData.length || records.length ? 'MLB Stats API team aggregates' : 'MLB Stats API unavailable',
  };
}

function getFrontOffice(t) {
  const has = key => t[key] != null && Number.isFinite(Number(t[key]));
  const strengths = [
    ['Positive run differential', has('rs') && has('ra') && t.rs > t.ra],
    ['Above-average offense', has('ops') && t.ops >= .750],
    ['Strong run prevention', has('era') && t.era <= 3.50],
    ['High strikeout volume', has('k') && t.k >= 600],
    ['Home-run power', has('hr') && t.hr >= 100],
    ['Stolen-base volume', has('sb') && t.sb >= 70],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  const weaknesses = [
    ['Negative run differential', has('rs') && has('ra') && t.rs < t.ra],
    ['Below-average offense', has('ops') && t.ops < .720],
    ['Run-prevention risk', has('era') && t.era > 4.00],
    ['Low strikeout volume', has('k') && t.k < 520],
    ['Limited home-run power', has('hr') && t.hr < 75],
    ['Limited stolen-base volume', has('sb') && t.sb < 40],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  return { strengths, weaknesses };
}

function buildRosterInsights(team, players) {
  const hitters = (players?.hitting || []).filter(row => row?.stat);
  const pitchers = (players?.pitching || []).filter(row => row?.stat);
  const numeric = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const topHitter = [...hitters].sort((a, b) => (numeric(b.stat?.ops) ?? -Infinity) - (numeric(a.stat?.ops) ?? -Infinity))[0];
  const topPitcher = [...pitchers].sort((a, b) => (numeric(a.stat?.era) ?? Infinity) - (numeric(b.stat?.era) ?? Infinity))[0];
  const strengths = [];
  const weaknesses = [];
  const add = (list, title, detail, evidence) => list.push({ title, detail, evidence });

  if (numeric(team.ops) != null && team.ops >= .750) add(strengths, 'Lineup creates leverage', `${topHitter?.name || 'The lineup'} leads the roster by OPS`, `Team OPS ${formatTeamMetric(team.ops, 3)}`);
  if (numeric(team.hr) != null && team.hr >= 100) add(strengths, 'Power is a carrying tool', 'Home-run production gives the roster a reliable extra-base path', `${formatTeamMetric(team.hr)} HR`);
  if (numeric(team.era) != null && team.era <= 3.70) add(strengths, 'Run prevention is stable', `${topPitcher?.name || 'The staff'} anchors the current pitching group`, `Team ERA ${formatTeamMetric(team.era, 2)}`);
  if (numeric(team.k) != null && team.k >= 700) add(strengths, 'Strikeout volume travels', 'The staff can miss bats and limit balls in play', `${formatTeamMetric(team.k)} strikeouts`);
  if (numeric(rdForInsights(team)) != null && rdForInsights(team) > 0) add(strengths, 'Results support the profile', 'The roster is converting its run-creation and run-prevention balance into wins', `${rdForInsights(team) > 0 ? '+' : ''}${rdForInsights(team)} run differential`);

  if (numeric(team.ops) != null && team.ops < .720) add(weaknesses, 'Offensive margin is thin', 'The lineup may need more on-base traffic or impact contact', `Team OPS ${formatTeamMetric(team.ops, 3)}`);
  if (numeric(team.era) != null && team.era > 4.00) add(weaknesses, 'Run prevention needs support', 'The staff is allowing too much damage for a stable team baseline', `Team ERA ${formatTeamMetric(team.era, 2)}`);
  if (numeric(team.whip) != null && team.whip > 1.30) add(weaknesses, 'Traffic is accumulating', 'Base runners allowed per inning are creating avoidable leverage swings', `WHIP ${formatTeamMetric(team.whip, 3)}`);
  if (numeric(rdForInsights(team)) != null && rdForInsights(team) < 0) add(weaknesses, 'Results lag the roster signals', 'The negative run differential points to a current execution gap', `${rdForInsights(team)} run differential`);

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    source: hitters.length || pitchers.length ? 'Current roster leaders + live team aggregates' : 'Current team aggregates; roster leaders are still loading',
  };
}

function rdForInsights(team) {
  const rs = Number(team?.rs), ra = Number(team?.ra);
  return Number.isFinite(rs) && Number.isFinite(ra) ? rs - ra : null;
}

export const ROSTER_PRESETS = [
  { id:'qualified-hitters', label:'Qualified hitters', positions:[], sort:'ops', minBattingPa:150, minPitchingIp:0 },
  { id:'rotation-candidates', label:'Rotation candidates', positions:['SP'], sort:'era', minBattingPa:0, minPitchingIp:30 },
  { id:'high-leverage-arms', label:'High-leverage arms', positions:['RP'], sort:'era', minBattingPa:0, minPitchingIp:10 },
];

const ROSTER_SORT_OPTIONS = [
  { key:'ops', label:'OPS', group:'hitting', digits:3, direction:'desc' },
  { key:'homeRuns', label:'Home Runs', group:'hitting', digits:0, direction:'desc' },
  { key:'avg', label:'AVG', group:'hitting', digits:3, direction:'desc' },
  { key:'rbi', label:'RBI', group:'hitting', digits:0, direction:'desc' },
  { key:'stolenBases', label:'Stolen Bases', group:'hitting', digits:0, direction:'desc' },
  { key:'era', label:'ERA', group:'pitching', digits:2, direction:'asc' },
  { key:'whip', label:'WHIP', group:'pitching', digits:3, direction:'asc' },
  { key:'strikeOuts', label:'Strikeouts', group:'pitching', digits:0, direction:'desc' },
];

export function rosterStatValue(row, key) {
  const stat = row?.stat || {};
  const aliases = { avg:['avg','battingAverage'], homeRuns:['homeRuns','hr'], rbi:['rbi','runsBattedIn'], stolenBases:['stolenBases','sb'], strikeOuts:['strikeOuts','strikeouts','so'], pa:['plateAppearances','pa'], ip:['inningsPitched','ip'] };
  for (const candidate of (aliases[key] || [key])) {
    const value = Number(stat[candidate]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function formatRosterStat(row, option) {
  const value = rosterStatValue(row, option.key);
  return value == null ? '—' : value.toFixed(option.digits);
}

export function formatRosterSampleLabel(group, minimum) {
  const unit = group === 'hitting' ? 'PA' : 'IP';
  return minimum > 0 ? `${minimum} ${unit}+` : `Any ${unit}`;
}

export function buildRosterRows(players, positions, sortKey, minBattingPa = 0, minPitchingIp = 0) {
  const option = ROSTER_SORT_OPTIONS.find(item => item.key === sortKey) || ROSTER_SORT_OPTIONS[0];
  const selectedPositions = positions === 'all' || !Array.isArray(positions) ? (positions === 'all' ? [] : [positions]) : positions;
  return [
    ...(players?.hitting || []).map(row => ({ ...row, group:'hitting' })),
    ...(players?.pitching || []).map(row => ({ ...row, group:'pitching' })),
  ].filter(row => {
    if (!row?.stat || row.group !== option.group) return false;
    if (selectedPositions.length && !selectedPositions.includes(row.position)) return false;
    const sample = rosterStatValue(row, row.group === 'hitting' ? 'pa' : 'ip');
    const minimum = row.group === 'hitting' ? Number(minBattingPa) : Number(minPitchingIp);
    return minimum === 0 || (sample != null && sample >= minimum);
  })
    .sort((a, b) => {
      const av = rosterStatValue(a, option.key), bv = rosterStatValue(b, option.key);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return option.direction === 'asc' ? av - bv : bv - av;
    });
}

export function buildHistoricalTaxTrendRows(results, seasons = [2024, 2025, 2026]) {
  const numericOrNull = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  return seasons.map((season, index) => {
    const record = Array.isArray(results) ? results[index] : null;
    return {
      season,
      taxPayroll: numericOrNull(record?.tax?.taxPayroll),
      estimatedTaxBill: numericOrNull(record?.tax?.estimatedTaxBill),
      taxThreshold: numericOrNull(record?.tax?.taxThreshold),
      sourceUrl: record?.sourceUrls?.tax || record?.tax?.sourceUrl || null,
    };
  });
}

function OverviewPage({ rosterDefaults = { battingPa:0, pitchingIp:0 } }) {
  const [selTeam,setSelTeam]=useState('lad');
  const [affiliateLevel, setAffiliateLevel] = useState('11');
  const [affiliateId, setAffiliateId] = useState('');
  const [affiliates, setAffiliates] = useState([]);
  const [affiliatesState, setAffiliatesState] = useState('idle');
  const [affiliateOverview, setAffiliateOverview] = useState(null);
  const [affiliateOverviewState, setAffiliateOverviewState] = useState('idle');
  const [affiliateTab, setAffiliateTab] = useState('overview');
  const [affiliateStandings, setAffiliateStandings] = useState(null);
  const [affiliateSchedule, setAffiliateSchedule] = useState(null);
  const [affiliateSavant, setAffiliateSavant] = useState(null);
  const [teamSavantData, setTeamSavantData] = useState(null);
  const [pendingAffiliate, setPendingAffiliate] = useState(null);
  const overviewRef = useRef(null);
  const [pdfExportState, setPdfExportState] = useState('idle');
  const [splitTab,setSplitTab]=useState('home');
  const [teamSplitRows, setTeamSplitRows] = useState([]);
  const [arsenalTab,setArsenalTab]=useState('usage');
  const [todayGames,setTodayGames]=useState([]);
  const [todayGameMetadata, setTodayGameMetadata] = useState({});
  const [liveTeamData,setLiveTeamData]=useState(() => readTeamAggregateCache(CURRENT_SEASON)?.data || null);
  const [liveTeamDataUpdatedAt,setLiveTeamDataUpdatedAt]=useState(() => readTeamAggregateCache(CURRENT_SEASON)?.updatedAt || null);
  const [liveTeamDataMode,setLiveTeamDataMode]=useState(() => readTeamAggregateCache(CURRENT_SEASON) ? 'cached' : 'loading');
  const [liveTeamPlayers,setLiveTeamPlayers]=useState(() => readTeamPlayersCache(TEAMS.lad?.id, CURRENT_SEASON)?.data || { hitting:[], pitching:[] });
  const [teamPlayersUpdatedAt,setTeamPlayersUpdatedAt]=useState(() => readTeamPlayersCache(TEAMS.lad?.id, CURRENT_SEASON)?.updatedAt || null);
  const [teamPlayersDataMode,setTeamPlayersDataMode]=useState(() => readTeamPlayersCache(TEAMS.lad?.id, CURRENT_SEASON) ? 'cached' : 'loading');
  const [teamExitVelocityRows, setTeamExitVelocityRows] = useState([]);
  const [teamExitVelocitySource, setTeamExitVelocitySource] = useState('');
  const [teamExitVelocityState, setTeamExitVelocityState] = useState('idle');
  const [teamBattedBallData, setTeamBattedBallData] = useState(null);
  const [teamBattedBallRows, setTeamBattedBallRows] = useState([]);
  const [teamBattedBallAgainstRows, setTeamBattedBallAgainstRows] = useState([]);
  const [teamPitchArsenalData, setTeamPitchArsenalData] = useState(null);
  const [teamSavantSource, setTeamSavantSource] = useState('');
  const [teamSavantState, setTeamSavantState] = useState('idle');
  const [teamVenueMetadata, setTeamVenueMetadata] = useState(null);
  const [teamVenueState, setTeamVenueState] = useState('idle');
  const [liveTeamError,setLiveTeamError]=useState(false);
  const [feedRetryToken, setFeedRetryToken] = useState(0);
  const [teamModelData, setTeamModelData] = useState(null);
  const [teamModelState, setTeamModelState] = useState('idle');
  const [skipPlayoffEstimate, setSkipPlayoffEstimate] = useState(null);
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(true);
  const [teamPlayersError, setTeamPlayersError] = useState(false);
  const [selectedRosterPositions, setSelectedRosterPositions] = useState([]);
  const [rosterSort, setRosterSort] = useState('ops');
  const [minBattingPa, setMinBattingPa] = useState(() => Number(rosterDefaults.battingPa) || 0);
  const [minPitchingIp, setMinPitchingIp] = useState(() => Number(rosterDefaults.pitchingIp) || 0);
  const [activeRosterPreset, setActiveRosterPreset] = useState(null);
  const [taxTrendRows, setTaxTrendRows] = useState([]);
  const [taxTrendState, setTaxTrendState] = useState('loading');
  const [taxHistoryRange, setTaxHistoryRange] = useState(() => readCbtHistoryRange());
  const taxHistorySeasons = useMemo(() => buildCbtHistorySeasons(taxHistoryRange, CURRENT_SEASON), [taxHistoryRange]);
  useEffect(() => {
    setMinBattingPa(Number(rosterDefaults.battingPa) || 0);
    setMinPitchingIp(Number(rosterDefaults.pitchingIp) || 0);
  }, [rosterDefaults.battingPa, rosterDefaults.pitchingIp]);

  useEffect(() => {
    const onSelectAffiliate = e => {
      const detail = e.detail || {};
      const parentAbbr = String(detail.parentAbbr || '').toLowerCase();
      const foundKey = Object.keys(TEAMS).find(key => key === parentAbbr || TEAMS[key].abbr.toLowerCase() === parentAbbr);
      if (foundKey) {
        setSelTeam(foundKey);
        setPendingAffiliate({ id: String(detail.affiliateId || ''), levelId: String(detail.levelId || '11') });
      }
    };
    const onSelectTeam = e => {
      const abbr = e.detail?.abbr?.toLowerCase();
      if (abbr) {
        const foundKey = Object.keys(TEAMS).find(key => key.toLowerCase() === abbr || TEAMS[key].abbr.toLowerCase() === abbr);
        if (foundKey) setSelTeam(foundKey);
      }
    };
    window.addEventListener('skip-select-team', onSelectTeam);
    window.addEventListener('skip-select-affiliate', onSelectAffiliate);
    return () => {
      window.removeEventListener('skip-select-team', onSelectTeam);
      window.removeEventListener('skip-select-affiliate', onSelectAffiliate);
    };
  }, []);
  const teamBase=TEAMS[selTeam];
  useEffect(() => {
    let alive = true;
    setAffiliatesState('loading');
    setAffiliates([]);
    setAffiliateId('');
    setAffiliateOverview(null);
    getTeamAffiliates(teamBase?.id).then(rows => {
      if (!alive) return;
      setAffiliates(rows);
      const preferred = rows.find(row => pendingAffiliate?.id && String(row.id) === String(pendingAffiliate.id)) || rows.find(row => String(row.levelId) === affiliateLevel) || rows[0];
      if (preferred) {
        setAffiliateLevel(String(preferred.levelId));
        setAffiliateId(String(preferred.id));
        setAffiliateTab('overview');
      }
      setPendingAffiliate(null);
      setAffiliatesState('ready');
    }).catch(() => { if (alive) setAffiliatesState('error'); });
    return () => { alive = false; };
  }, [teamBase?.id, pendingAffiliate?.id]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId) { setAffiliateOverview(null); setAffiliateOverviewState('idle'); return () => { alive = false; }; }
    setAffiliateOverviewState('loading');
    getMinorLeagueTeamOverview(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON).then(data => {
      if (!alive) return;
      setAffiliateOverview(data);
      setAffiliateOverviewState(data ? 'ready' : 'error');
    }).catch(() => { if (alive) setAffiliateOverviewState('error'); });
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId) { setAffiliateStandings(null); setAffiliateSchedule(null); setAffiliateSavant(null); return () => { alive = false; }; }
    setAffiliateStandings({ status:'loading', rows:[] });
    setAffiliateSchedule({ status:'loading', games:[] });
    setAffiliateSavant({ status:'loading' });
    Promise.all([
      getMinorLeagueTeamStandings(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON),
      getMinorLeagueTeamSchedule(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON, 14),
      getTeamSavantMetrics(teamBase?.abbr, CURRENT_SEASON),
    ]).then(([standings, schedule, savant]) => {
      if (!alive) return;
      setAffiliateStandings(standings);
      setAffiliateSchedule(schedule);
      setAffiliateSavant(savant);
    }).catch(() => {
      if (!alive) return;
      setAffiliateStandings({ status:'upstream-unavailable', rows:[] });
      setAffiliateSchedule({ status:'upstream-unavailable', games:[] });
      setAffiliateSavant({ status:'upstream-unavailable' });
    });
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel, teamBase?.abbr]);

  const team=useMemo(() => {
    const live = liveTeamData?.byId?.[teamBase?.id] || liveTeamData?.byAbbr?.[teamBase?.abbr];
    const hitting = live?.hitting || {};
    const pitching = live?.pitching || {};
    const stat = (source, key) => source?.[key] == null || source?.[key] === '' ? null : (Number.isFinite(Number(source[key])) ? Number(source[key]) : null);
    return {
      ...teamBase,
      ...(live?.standings || {}),
      w: stat(live?.standings, 'w'), l: stat(live?.standings, 'l'), pct: stat(live?.standings, 'pct'),
      rs: stat(live?.standings, 'rs'), ra: stat(live?.standings, 'ra'), diff: stat(live?.standings, 'diff'),
      ops: stat(hitting, 'ops'), obp: stat(hitting, 'obp'), slg: stat(hitting, 'slg'), avg: stat(hitting, 'avg'),
      hr: stat(hitting, 'homeRuns'), sb: stat(hitting, 'stolenBases'),
      era: stat(pitching, 'era'), whip: stat(pitching, 'whip'), k: stat(pitching, 'strikeOuts'),
      war: null, wrcPlus: null, fip: null, drs: null, bsr: null,
    };
  }, [liveTeamData, teamBase]);
  // Team-brand accent used for decorative/structural elements (panel accent
  // strips, chart lines/bars, badges) throughout this page. Deliberately not
  // used for small body text — some team colors (e.g. the Padres' near-black
  // brown) would fail contrast as text against a themed background, but read
  // fine as a bar fill or a 3px accent strip.
  const teamAccent = getTeamAccent(team);
  const teamRollups = useMemo(() => deriveTeamPlayerRollups(liveTeamPlayers), [liveTeamPlayers]);
  const rosterInsights = useMemo(() => buildRosterInsights(team, liveTeamPlayers), [team, liveTeamPlayers]);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const provenanceTriggerRef = useRef(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightsState, setAiInsightsState] = useState('idle');
  const [verifiedTrends, setVerifiedTrends] = useState({});
  const trendSnapshotScope = `${selTeam}:${CURRENT_SEASON}`;
  const verifiedTrendMetrics = useMemo(() => {
    const verified = liveTeamDataMode === 'live' || liveTeamDataMode === 'cached';
    const source = liveTeamDataMode === 'live' ? 'MLB Stats API · live verified aggregate' : 'MLB Stats API · cached verified aggregate';
    return {
      ops: { label:'Team OPS', value:team.ops, status:verified ? 'verified' : 'unavailable', source },
      era: { label:'Team ERA', value:team.era, status:verified ? 'verified' : 'unavailable', source },
      whip: { label:'WHIP', value:team.whip, status:verified ? 'verified' : 'unavailable', source },
      runDiff: { label:'Run differential', value:team.rs != null && team.ra != null ? team.rs - team.ra : null, status:verified ? 'verified' : 'unavailable', source },
    };
  }, [team, liveTeamDataMode]);
  useEffect(() => {
    if (liveTeamDataMode !== 'live' && liveTeamDataMode !== 'cached') {
      setVerifiedTrends({});
      return;
    }
    const previous = readVerifiedSnapshot(trendSnapshotScope);
    const derived = deriveVerifiedTrends(verifiedTrendMetrics, previous);
    setVerifiedTrends(Object.fromEntries(Object.entries(derived).map(([key, value]) => [key, { ...value, displayDelta: formatTrendDelta(value.delta, key === 'ops' ? 3 : 2) }])));
    captureVerifiedSnapshot(trendSnapshotScope, verifiedTrendMetrics, liveTeamDataUpdatedAt || Date.now());
  }, [trendSnapshotScope, verifiedTrendMetrics, liveTeamDataMode, liveTeamDataUpdatedAt]);

  useEffect(() => {
    let alive = true;
    setTodayGameMetadata({});
    const games = todayGames.slice(0, 6).filter(game => /final|progress|live/i.test(String(game.status || '')) || game.inning);
    if (games.length) {
      Promise.all(games.map(game => getGameFeedMetadata(game.gamePk).then(metadata => [game.gamePk, metadata]).catch(() => [game.gamePk, null]))).then(entries => {
        if (alive) setTodayGameMetadata(Object.fromEntries(entries));
      });
    }
    return () => { alive = false; };
  }, [todayGames]);
  useEffect(() => {
    let alive = true;
    setTeamVenueState('loading');
    setTeamVenueMetadata(null);
    getTeamVenueMetadata(teamBase?.id).then(data => {
      if (!alive) return;
      setTeamVenueMetadata(data);
      setTeamVenueState(data?.status === 'live' || data?.status === 'cached' ? 'ready' : data?.status === 'source-gap' ? 'source-gap' : 'unavailable');
    }).catch(() => {
      if (!alive) return;
      setTeamVenueMetadata({ status: 'upstream-unavailable', source: 'MLB Stats API', venue: null });
      setTeamVenueState('unavailable');
    });
    return () => { alive = false; };
  }, [teamBase?.id, feedRetryToken]);
  useEffect(() => {
    let alive = true;
    setTeamSplitRows([]);
    getTeamScheduleSplits(teamBase?.id, CURRENT_SEASON).then(rows => { if (alive) setTeamSplitRows(Array.isArray(rows) ? rows : []); }).catch(() => { if (alive) setTeamSplitRows([]); });
    return () => { alive = false; };
  }, [teamBase?.id, feedRetryToken]);
  useEffect(() => {
    let alive = true;
    const cached = readTeamSavantCache(teamBase?.abbr, CURRENT_SEASON);
    const applySnapshot = (snapshot, source) => {
      const exitRows = snapshot?.exitVelocityRows || [];
      const batted = snapshot?.battedBallRows || [];
      const pitches = snapshot?.pitchRows || [];
      setTeamExitVelocityRows(exitRows);
      setTeamExitVelocitySource(source);
      setTeamExitVelocityState(exitRows.length ? 'ready' : 'unavailable');
      setTeamBattedBallRows(batted);
      setTeamBattedBallData(buildBattedBallProfile(batted));
      setTeamPitchArsenalData(buildPitchArsenalRows(pitches));
      setTeamSavantSource(source);
      setTeamSavantState(exitRows.length || batted.length || pitches.length ? 'ready' : 'unavailable');
    };
    if (cached && Date.now() - Number(cached.updatedAt || 0) < 60 * 60 * 1000) {
      applySnapshot(cached.data, 'Baseball Savant Statcast Search · cached verified roster rollup');
      return () => { alive = false; };
    }
    setTeamExitVelocityRows([]);
    setTeamExitVelocitySource('');
    setTeamExitVelocityState('loading');
    setTeamBattedBallData(null);
    setTeamBattedBallRows([]);
    setTeamBattedBallAgainstRows([]);
    setTeamPitchArsenalData(null);
    setTeamSavantSource('');
    setTeamSavantState('loading');
    const hitters = (liveTeamPlayers.hitting || [])
      .sort((a, b) => (Number(b?.stat?.plateAppearances || b?.stat?.pa) || 0) - (Number(a?.stat?.plateAppearances || a?.stat?.pa) || 0))
      .slice(0, 12);
    const pitchers = (liveTeamPlayers.pitching || [])
      .sort((a, b) => (Number(b?.stat?.inningsPitched || b?.stat?.ip) || 0) - (Number(a?.stat?.inningsPitched || a?.stat?.ip) || 0))
      .slice(0, 12);
    resolveTeamSavantSnapshot({
      teamAbbr: teamBase?.abbr,
      season: CURRENT_SEASON,
      cached,
      hitters,
      pitchers,
      getTeamBattedBallsFn: getTeamBattedBalls,
      saveCacheFn: saveTeamSavantCache,
    }).then(({ snapshot, source }) => {
      if (!alive) return;
      applySnapshot(snapshot, source);
    }).catch(() => {
      if (!alive) return;
      applySnapshot({ exitVelocityRows: [], battedBallRows: [], pitchRows: [] }, '');
    });
    return () => { alive = false; };
    }, [teamBase?.abbr, feedRetryToken, liveTeamPlayers]);
  useEffect(() => {
    let alive = true;
    setTeamBattedBallAgainstRows([]);
    getTeamBattedBallsAgainst(teamBase?.abbr, CURRENT_SEASON).then(rows => {
      if (alive) setTeamBattedBallAgainstRows(Array.isArray(rows) ? rows : []);
    }).catch(() => { if (alive) setTeamBattedBallAgainstRows([]); });
    return () => { alive = false; };
  }, [teamBase?.abbr, feedRetryToken]);
  useEffect(() => {
    let alive = true;
    setTeamModelState('loading');
    setSkipPlayoffEstimate(null);
    getTeamModelSources(teamBase?.abbr, CURRENT_SEASON).then(async data => {
      if (!alive) return;
      if (data?.teamWar == null) {
        const aggregate = await getTeamAggregateWar(teamBase?.name, CURRENT_SEASON);
        if (aggregate && alive) {
          data = { ...data, found: true, teamWar: aggregate.teamWar, source: `${data.source || 'FanGraphs'} + ${aggregate.source}`, retrievedAt: aggregate.retrievedAt || data.retrievedAt, freshness: aggregate.freshness, statuses: { ...(data.statuses || {}), teamWar: aggregate.status } };
        }
      }
      if (!alive) return;
      setTeamModelData(data);
      setTeamModelState(data?.found ? 'ready' : 'source-gap');
    }).catch(() => { if (alive) setTeamModelState('error'); });
    getSkipPlayoffOddsEstimate(teamBase?.id, CURRENT_SEASON).then(estimate => {
      if (alive) setSkipPlayoffEstimate(estimate);
    }).catch(() => {
      if (alive) setSkipPlayoffEstimate({ status: 'unavailable', source: 'SKIP estimate', estimate: null, retrievedAt: new Date().toISOString() });
    });
    return () => { alive = false; };
  }, [teamBase?.abbr, teamBase?.id, feedRetryToken]);

  useEffect(() => {
    let alive = true;
    getTeamSavantMetrics(teamBase?.abbr, CURRENT_SEASON).then(data => { if (alive) setTeamSavantData(data); }).catch(() => { if (alive) setTeamSavantData({ status:'upstream-unavailable', source:'Baseball Savant', retrievedAt:new Date().toISOString() }); });
    return () => { alive = false; };
  }, [teamBase?.abbr]);

  useEffect(() => {
    if (!liveTeamData) return;
    let alive = true;
    const input = {
      team: {
        name: team.name, abbr: team.abbr, w: team.w, l: team.l, pct: team.pct,
        rs: team.rs, ra: team.ra, ops: team.ops, hr: team.hr, era: team.era,
        whip: team.whip, k: team.k, sb: team.sb,
      },
      roster: {
        hitting: liveTeamPlayers.hitting.slice(0, 12),
        pitching: liveTeamPlayers.pitching.slice(0, 12),
      },
    };
    setAiInsightsState('loading');
    fetch('/api/trpc/ai.rosterInsights?batch=1', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({0:{json:input}}),
    }).then(response => response.json().then(payload => ({ ok:response.ok, payload })))
      .then(({ ok, payload }) => {
        const data = payload?.[0]?.result?.data?.json;
        if (!ok || !data) throw new Error('AI insights unavailable');
        if (alive) { setAiInsights(data); setAiInsightsState('ready'); }
      }).catch(() => { if (alive) setAiInsightsState('error'); });
    return () => { alive = false; };
  }, [liveTeamData, team, liveTeamPlayers]);
  const displayedInsights = aiInsights || rosterInsights;
  const playoffOddsValue = teamModelData?.playoffOdds != null
    ? `${Number(teamModelData.playoffOdds).toFixed(1)}%`
    : skipPlayoffEstimate?.estimate != null
      ? `${Number(skipPlayoffEstimate.estimate).toFixed(1)}%`
      : 'Unavailable';
  const playoffOddsSource = teamModelData?.playoffOdds != null ? 'FanGraphs' : skipPlayoffEstimate?.estimate != null ? 'SKIP estimate' : 'Provider unavailable';
  const teamWarValue = teamModelData?.teamWar == null ? 'Unavailable' : Number(teamModelData.teamWar).toFixed(1);
  const modelFreshness = freshnessLabel(teamModelData?.retrievedAt);
  const rosterPositions = useMemo(() => [...new Set([
    ...(liveTeamPlayers.hitting || []).map(row => row.position),
    ...(liveTeamPlayers.pitching || []).map(row => row.position),
  ].filter(Boolean))].sort(), [liveTeamPlayers]);
  const rosterSortOption = ROSTER_SORT_OPTIONS.find(item => item.key === rosterSort) || ROSTER_SORT_OPTIONS[0];
  const activeMinimum = rosterSortOption.group === 'hitting' ? minBattingPa : minPitchingIp;
  const filteredRosterRows = useMemo(() => buildRosterRows(liveTeamPlayers, selectedRosterPositions, rosterSort, minBattingPa, minPitchingIp), [liveTeamPlayers, selectedRosterPositions, rosterSort, minBattingPa, minPitchingIp]);
  const applyRosterPreset = preset => {
    setSelectedRosterPositions(preset.positions);
    setRosterSort(preset.sort);
    setMinBattingPa(preset.minBattingPa);
    setMinPitchingIp(preset.minPitchingIp);
    setActiveRosterPreset(preset.id);
  };

  useEffect(()=>{
    let alive=true;
    const cachedAggregate = readTeamAggregateCache(CURRENT_SEASON);
    setLiveTeamData(cachedAggregate?.data || null);
    setLiveTeamDataUpdatedAt(cachedAggregate?.updatedAt || null);
    setLiveTeamDataMode(cachedAggregate ? 'cached' : 'loading');
    const cachedPlayers = readTeamPlayersCache(teamBase.id, CURRENT_SEASON);
    setLiveTeamPlayers(cachedPlayers?.data || { hitting:[], pitching:[] });
    setTeamPlayersUpdatedAt(cachedPlayers?.updatedAt || null);
    setTeamPlayersDataMode(cachedPlayers ? 'cached' : 'loading');
    setLiveTeamError(false);
    setTeamPlayersLoading(true);
    setTeamPlayersError(false);
    getTodaysGames().then(g=>{ if(alive) setTodayGames(g.slice(0,8)); }).catch(()=>{});

    // Aggregate standings and team totals are the critical Overview path. They
    // must render independently of the slower per-player leaderboard calls,
    // otherwise one delayed pitching request leaves every visible team card on
    // an em dash even when the authoritative aggregate responses succeeded.
    const feedTimeout = window.setTimeout(() => {
      if (alive && !liveTeamData) setLiveTeamError(true);
    }, 12000);
    Promise.allSettled([
      getStandings(),
      getAllTeamStats('hitting'),
      getAllTeamStats('pitching'),
    ]).then(([std, hitting, pitching]) => {
      if (!alive) return;
      const byAbbr = {};
      const byId = {};
      if (std.status === 'fulfilled') {
        Object.values(std.value).flat().forEach(row => {
          const record = { standings: row };
          if (row.abbr) byAbbr[row.abbr] = record;
          if (row.id != null) byId[row.id] = record;
        });
      }
      if (hitting.status === 'fulfilled') {
        Object.values(hitting.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.hitting = stat;
          if (stat.teamId != null) byId[stat.teamId] = row;
        });
      }
      if (pitching.status === 'fulfilled') {
        Object.values(pitching.value).forEach(stat => {
          const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
          row.pitching = stat;
          if (stat.teamId != null) byId[stat.teamId] = row;
        });
      }
      window.clearTimeout(feedTimeout);
      if ([std, hitting, pitching].some(result => result.status === 'fulfilled')) {
        const snapshot = saveTeamAggregateCache({ byAbbr, byId }, CURRENT_SEASON);
        setLiveTeamData(snapshot?.data || { byAbbr, byId });
        setLiveTeamDataUpdatedAt(snapshot?.updatedAt || Date.now());
        setLiveTeamDataMode('live');
        setLiveTeamError(false);
      } else {
        const cached = readTeamAggregateCache(CURRENT_SEASON);
        setLiveTeamDataMode(cached ? 'cached' : 'error');
        setLiveTeamError(!cached);
      }
    });

    // Team leaders are useful but non-critical. A timeout or upstream failure
    // should only make the leader rows unavailable, not block the aggregates.
    Promise.allSettled([
      getTeamPlayerStats(teamBase.id, 'hitting'),
      getTeamPlayerStats(teamBase.id, 'pitching'),
    ]).then(([teamHitters, teamPitchers]) => {
      if (!alive) return;
      const cachedPlayers = readTeamPlayersCache(teamBase.id, CURRENT_SEASON);
      const bothFailed = teamHitters.status === 'rejected' && teamPitchers.status === 'rejected';
      const nextPlayers = {
        hitting: teamHitters.status === 'fulfilled' ? teamHitters.value : (cachedPlayers?.data?.hitting || []),
        pitching: teamPitchers.status === 'fulfilled' ? teamPitchers.value : (cachedPlayers?.data?.pitching || []),
      };
      const snapshot = teamHitters.status === 'fulfilled' || teamPitchers.status === 'fulfilled'
        ? saveTeamPlayersCache(teamBase.id, CURRENT_SEASON, nextPlayers)
        : cachedPlayers;
      setLiveTeamPlayers(nextPlayers);
      setTeamPlayersUpdatedAt(snapshot?.updatedAt || null);
      setTeamPlayersDataMode(snapshot ? (teamHitters.status === 'fulfilled' || teamPitchers.status === 'fulfilled' ? 'live' : 'cached') : 'error');
      setTeamPlayersError(bothFailed && !cachedPlayers);
      setTeamPlayersLoading(false);
    });

    return ()=>{ alive=false; window.clearTimeout(feedTimeout); };
  },[teamBase?.id, feedRetryToken]);

  useEffect(() => {
    let alive = true;
    const teamAbbr = teamBase?.abbr;
    if (!teamAbbr) return () => { alive = false; };
    const seasons = taxHistorySeasons;
    setTaxTrendRows([]);
    setTaxTrendState('loading');
    Promise.all(seasons.map(season => fetchTeamFinancials(teamAbbr, season)))
      .then(results => {
        if (!alive) return;
        const rows = buildHistoricalTaxTrendRows(results, seasons);
        setTaxTrendRows(rows);
        setTaxTrendState(rows.some(row => row.taxPayroll != null || row.estimatedTaxBill != null) ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (alive) {
          setTaxTrendRows([]);
          setTaxTrendState('unavailable');
        }
      });
    return () => { alive = false; };
  }, [teamBase?.abbr, taxHistorySeasons]);

  const exportTeamOverviewPdf = async () => {
    if (!overviewRef.current || pdfExportState === 'loading') return;
    setPdfExportState('loading');
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      await document.fonts?.ready;
      const canvas = await html2canvas(overviewRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f4ed',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false,
        ignoreElements: element => element.hasAttribute?.('data-export-ignore'),
      });
      const pdf = new jsPDF({ orientation:'portrait', unit:'pt', format:'letter', compress:true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = canvas.height * pageWidth / canvas.width;
      const image = canvas.toDataURL('image/png');
      let remaining = imageHeight;
      let offset = 0;
      pdf.setProperties({ title:`${team.name || 'Team'} Overview`, subject:'SKIP Baseball Intelligence Terminal team overview report', author:'SKIP Baseball Intelligence Terminal' });
      while (remaining > 0) {
        if (offset > 0) pdf.addPage();
        pdf.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight, undefined, 'FAST');
        remaining -= pageHeight;
        offset += pageHeight;
      }
      const safeTeamName = String(team.name || selTeam || 'team').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      pdf.save(`skip-${safeTeamName}-overview-${SEASON}.pdf`);
      setPdfExportState('ready');
      window.setTimeout(() => setPdfExportState(current => current === 'ready' ? 'idle' : current), 2200);
    } catch (error) {
      console.error('[overview-pdf] export failed', error);
      setPdfExportState('error');
      window.setTimeout(() => setPdfExportState(current => current === 'error' ? 'idle' : current), 3200);
    }
  };

  const rd = team.rs == null || team.ra == null || !Number.isFinite(Number(team.rs)) || !Number.isFinite(Number(team.ra))
    ? null
    : Number(team.rs) - Number(team.ra);
  const liveRunDiffData = useMemo(() => buildLiveRunDiffData({ ...team, diff: rd }, CURRENT_SEASON), [team, rd]);

  const D=useMemo(()=>{
    const liveRadar = buildLiveRadarData({ team, liveTeamData, runDiff: rd });
    const records = Object.values(liveTeamData?.byAbbr || {});
    const hittingRecords = records.map(row => row?.hitting).filter(Boolean);
    const pitchingRecords = records.map(row => row?.pitching).filter(Boolean);
    const standingsRecords = records.map(row => row?.standings).filter(Boolean);
    const rankValue = (value, rows, keys, higher = true) => {
      if (value == null || value === '') return null;
      const current = Number(value);
      if (!Number.isFinite(current)) return null;
      const values = rows.map(row => keys.map(key => Number(row?.[key])).find(Number.isFinite)).filter(Number.isFinite);
      return values.length ? percentile(current, values, higher) : null;
    };
    const offPct = rankValue(team.ops, hittingRecords, ['ops']);
    const speedPct = rankValue(team.sb, hittingRecords, ['stolenBases']);
    const pitchingPct = rankValue(team.era, pitchingRecords, ['era'], false);
    const divName = team.div || 'League';
    const standings=Object.values(TEAMS).filter(t=>t.div===team.div).map(t=>{
      const live = liveTeamData?.byAbbr?.[t.abbr]?.standings;
      return { ...t, w: live?.w ?? null, l: live?.l ?? null, pct: live?.pct == null ? '—' : Number(live.pct).toFixed(3), cur:t.abbr===team.abbr };
    }).sort((a,b)=>(b.w ?? -1)-(a.w ?? -1));
    const leagueRanks=[
      {label:'Runs Scored',  rank:rankValue(team.rs, standingsRecords, ['rs']), val:team.rs},
      {label:'Home Runs',    rank:rankValue(team.hr, hittingRecords, ['homeRuns']), val:team.hr},
      {label:'Team OPS',     rank:rankValue(team.ops, hittingRecords, ['ops']), val:formatTeamMetric(team.ops,3)},
      {label:'Team ERA',     rank:rankValue(team.era, pitchingRecords, ['era'], false), val:formatTeamMetric(team.era,2)},
      {label:'WHIP',         rank:rankValue(team.whip, pitchingRecords, ['whip'], false), val:formatTeamMetric(team.whip,3)},
      {label:'Strikeouts',   rank:rankValue(team.k, pitchingRecords, ['strikeOuts']), val:team.k},
      {label:'Defense (OAA)',rank:null,val:'—'},
      {label:'Baserunning (BsR)',rank:null,val:'—'},
    ];
    const pctBars=[
      {lbl:'Offense', pct:offPct, color:C.amber},
      {lbl:'Pitching', pct:pitchingPct, color:C.rust},
      {lbl:'Defense', pct:null, color:C.teal},
      {lbl:'Baserunning', pct:speedPct, color:C.navy},
    ];
    const available = [offPct, pitchingPct, speedPct].filter(v => v != null);
    const overallPct = available.length ? Math.round(available.reduce((sum, value) => sum + value, 0) / available.length) : null;
    return {
      offenseData:liveRadar.offenseData,strengthData:liveRadar.strengthData,radarSource:liveRadar.source,standings,leagueRanks,pctBars,divName,
      og:pctToGrade(offPct),pg:pctToGrade(pitchingPct),dg:'—',bg:pctToGrade(speedPct),
      overall:pctToGrade(overallPct),
    };
  },[team, liveTeamData, rd]);

  // These only depend on `team`, but were previously called directly in the
  // render body — every unrelated state change on this page (e.g. clicking
  // a split/arsenal tab) was silently recomputing all five for the same
  // team. Memoized on selTeam to match the `D` useMemo above.
  const { splits, leaders, bb, arsenal, fo } = useMemo(() => ({
    splits:  teamSplitRows,
    leaders: getLeaders(liveTeamPlayers.hitting, liveTeamPlayers.pitching),
    bb:      teamBattedBallData,
    arsenal: teamPitchArsenalData,
    fo:      getFrontOffice(team),
  }), [team, liveTeamPlayers, teamBattedBallData, teamPitchArsenalData, teamSplitRows]);
  const evBins = useMemo(() => buildExitVelocityBins(teamExitVelocityRows), [teamExitVelocityRows]);
  const contactAllowed = useMemo(() => {
    const rows = teamBattedBallAgainstRows;
    const numeric = key => rows.map(row => Number(row?.[key])).filter(Number.isFinite);
    const average = key => { const values = numeric(key); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
    return { sampleSize: rows.length, xwoba: average('xwoba'), exitVelocity: average('launch_speed'), hardHitPct: rows.length ? rows.filter(row => Number(row?.launch_speed) >= 95).length / rows.length * 100 : null };
  }, [teamBattedBallAgainstRows]);
  const sprayRows = useMemo(() => teamBattedBallRows.filter(row => Number.isFinite(Number(row?.hc_x)) && Number.isFinite(Number(row?.hc_y))).slice(0, 600), [teamBattedBallRows]);
  const teamSavantDisplayData = useMemo(() => {
    if (!teamBattedBallRows.length) return teamSavantData;
    const xwobaValues = teamBattedBallRows.map(row => Number(row?.xwoba)).filter(Number.isFinite);
    const evValues = teamBattedBallRows.map(row => Number(row?.launch_speed)).filter(Number.isFinite);
    return {
      ...teamSavantData,
      status: 'live',
      source: 'Baseball Savant · verified team batted-ball query',
      expectedWOBA: xwobaValues.length ? xwobaValues.reduce((sum, value) => sum + value, 0) / xwobaValues.length : teamSavantData?.expectedWOBA ?? null,
      exitVelocity: evValues.length ? evValues.reduce((sum, value) => sum + value, 0) / evValues.length : teamSavantData?.exitVelocity ?? null,
      sampleSize: teamBattedBallRows.length,
    };
  }, [teamBattedBallRows, teamSavantData]);
  const splitRows=splitTab==='home'?splits.slice(0,2):splitTab==='hand'?splits.slice(2,4):splits.slice(4,6);
  const offRows=[['OPS',formatTeamMetric(team.ops,3)],['OBP',formatTeamMetric(team.obp,3)],['SLG',formatTeamMetric(team.slg,3)],['AVG',formatTeamMetric(team.avg,3)],['HR',formatTeamMetric(team.hr)],['SB',formatTeamMetric(team.sb)]];
  const pitRows=[['ERA',formatTeamMetric(team.era,2)],['WHIP',formatTeamMetric(team.whip,3)],['K',formatTeamMetric(team.k)],['FIP','—'],['OAA','—'],['BsR','—'] ];

  // Team-level OAA still requires a dedicated Statcast query. Exit-velocity
  // bins are built above from the verified team-scoped Savant feed.
  const oaaPositions = [];
  const aggregateAge = formatDataAge(liveTeamDataUpdatedAt);
  const aggregateStatus = liveTeamDataMode === 'live' ? 'LIVE MLB DATA' : liveTeamDataMode === 'cached' ? `CACHED MLB DATA${aggregateAge ? ` · ${aggregateAge}` : ''}` : liveTeamDataMode === 'error' ? 'LIVE FEED ERROR' : 'CONNECTING TO MLB DATA';
  const aggregateTone = liveTeamDataMode === 'live' ? C.teal : liveTeamDataMode === 'cached' ? C.amberDark : liveTeamDataMode === 'error' ? C.rust : C.amberDark;
  const aggregateSurface = liveTeamDataMode === 'live' ? C.tealSoft : liveTeamDataMode === 'cached' ? C.amberSoft : liveTeamDataMode === 'error' ? C.rustSoft : C.amberSoft;
  const aggregateBorder = liveTeamDataMode === 'live' ? C.tealMid : liveTeamDataMode === 'cached' ? C.amberMid : liveTeamDataMode === 'error' ? C.rustMid : C.amberMid;
  const teamPlayersBadge = teamPlayersDataMode === 'live' ? 'VERIFIED ROSTER ROWS' : teamPlayersDataMode === 'cached' ? `CACHED${teamPlayersUpdatedAt && formatDataAge(teamPlayersUpdatedAt) ? ` · ${formatDataAge(teamPlayersUpdatedAt)}` : ''}` : teamPlayersDataMode === 'error' ? 'UNAVAILABLE' : 'LOADING';
  const overviewProvenance = useMemo(() => [
    { label:'Team aggregate metrics', status: liveTeamData ? 'verified' : 'unavailable', available: Boolean(liveTeamData), provider:'MLB Stats API', retrieved: liveTeamDataUpdatedAt ? new Date(liveTeamDataUpdatedAt).toLocaleString() : null, sampleSize: liveTeamData ? 'Current-season team aggregate' : null, method:'Direct team standings and aggregate-stat fields.' },
    { label:'Roster insights', status: ((liveTeamPlayers.hitting?.length || 0) + (liveTeamPlayers.pitching?.length || 0)) ? 'verified' : 'unavailable', available: Boolean((liveTeamPlayers.hitting?.length || 0) + (liveTeamPlayers.pitching?.length || 0)), provider:'MLB Stats API', retrieved: teamPlayersUpdatedAt ? new Date(teamPlayersUpdatedAt).toLocaleString() : null, sampleSize: `${(liveTeamPlayers.hitting?.length || 0) + (liveTeamPlayers.pitching?.length || 0)} roster rows`, method:'Position-aware filters and minimum PA/IP thresholds applied in the browser.' },
    { label:'Batted ball and exit velocity', status: (teamBattedBallData || teamExitVelocityRows.length) ? (teamSavantSource?.includes('rollup') ? 'estimated' : 'verified') : 'unavailable', available: Boolean(teamBattedBallData || teamExitVelocityRows.length), provider: teamSavantSource || 'Baseball Savant Statcast Search', retrieved: null, sampleSize: teamBattedBallData?.sampleSize ? `${teamBattedBallData.sampleSize.toLocaleString()} batted balls` : teamExitVelocityRows.length ? `${teamExitVelocityRows.length.toLocaleString()} rows` : null, method: teamSavantSource?.includes('rollup') ? 'Roster-player Statcast rows aggregated into team bins from verified inputs.' : 'Direct team Statcast rows transformed into launch-speed and batted-ball metrics.' },
    { label:'Pitch arsenal', status: teamPitchArsenalData ? (teamSavantSource?.includes('rollup') ? 'estimated' : 'verified') : 'unavailable', available: Boolean(teamPitchArsenalData), provider: teamSavantSource || 'Baseball Savant Statcast Search', retrieved: null, sampleSize: teamPitchArsenalData?.sampleSize ? `${teamPitchArsenalData.sampleSize.toLocaleString()} pitches` : null, method: teamSavantSource?.includes('rollup') ? 'Verified pitch rows grouped by pitch type and usage from roster inputs.' : 'Verified pitch rows grouped by pitch type and usage.' },
    { label:'Model context', status: teamModelData?.found ? 'verified' : 'unavailable', available: Boolean(teamModelData?.found), provider: teamModelData?.source || 'FanGraphs', retrieved: teamModelData?.retrievedAt ? new Date(teamModelData.retrievedAt).toLocaleString() : null, sampleSize:'Not supplied by source', method:'Provider-supplied projection and valuation fields; no local estimation.' },
  ], [liveTeamData, liveTeamDataUpdatedAt, liveTeamPlayers, teamPlayersUpdatedAt, teamBattedBallData, teamExitVelocityRows, teamPitchArsenalData, teamSavantSource, teamModelData]);
  const showInitialSkeleton = liveTeamDataMode === 'loading' && !liveTeamData && !liveTeamError;

  return (
    <div ref={overviewRef} className="page-enter skip-overview-page" style={{display:'flex',flexDirection:'column',gap:14,borderTop:`3px solid ${teamAccent}`,paddingTop:9}}>

      {showInitialSkeleton && <TeamOverviewSkeleton />}
      <Breadcrumbs items={[{ label:'Overview', onClick:() => openTab('overview') }, { label:team.name || 'Team overview' }]} accent={teamAccent} />
      <SourceProvenanceDrawer open={provenanceOpen} onClose={() => setProvenanceOpen(false)} returnFocusRef={provenanceTriggerRef} context={`${team.name || 'Team'} · ${CURRENT_SEASON} season`} entries={overviewProvenance} />

      {/* ── Selector + headline ── */}
      <div className="overview-command-header" style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20,flexWrap:'wrap',paddingBottom:2}}>
          <div>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:5}}>
            <TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={30} />
            <div style={px({fontSize:10,fontWeight:700,color:teamAccent,letterSpacing:'.14em',textTransform:'uppercase'})}>TEAM COMMAND CENTER</div>
          </div>
          <h1 style={{ ...sans({fontSize:24,fontWeight:800,color:C.text,letterSpacing:'-.04em',lineHeight:1.1}), borderLeft:`3px solid ${teamAccent}`, paddingLeft:9 }}>Season overview</h1>
          <div style={sans({fontSize:11,color:C.text3,marginTop:5})}>A live snapshot of performance, leverage, and roster context.</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <ProvenanceButton ref={provenanceTriggerRef} onClick={() => setProvenanceOpen(true)} label="SOURCES" />
          <button type="button" data-export-ignore onClick={exportTeamOverviewPdf} disabled={pdfExportState === 'loading'}
            aria-label="Download the current team overview as a PDF"
            style={{height:30,padding:'0 10px',border:`1px solid ${C.amberMid}`,borderRadius:7,background:pdfExportState==='ready'?C.tealSoft:pdfExportState==='error'?C.rustSoft:C.amberSoft,color:pdfExportState==='ready'?C.teal:pdfExportState==='error'?C.rust:C.amberDark,cursor:pdfExportState==='loading'?'wait':'pointer',opacity:pdfExportState==='loading'?.7:1,...px({fontSize:9.5,fontWeight:800,letterSpacing:'.05em'})}}>
            {pdfExportState === 'loading' ? 'BUILDING PDF…' : pdfExportState === 'ready' ? 'PDF DOWNLOADED' : pdfExportState === 'error' ? 'PDF FAILED — RETRY' : 'DOWNLOAD PDF'}
          </button>
          <div role="status" aria-live="polite" style={{display:'flex',alignItems:'center',gap:7,padding:'6px 9px',borderRadius:7,background:aggregateSurface,border:`1px solid ${aggregateBorder}`}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:aggregateTone,animation:liveTeamDataMode === 'loading' ? 'pulse 1.2s ease-in-out infinite' : 'none'}} />
            <span style={px({fontSize:10,color:aggregateTone,fontWeight:700,letterSpacing:'.06em'})}>{aggregateStatus}</span>
            {liveTeamError && <button type="button" onClick={()=>{setLiveTeamError(false);setLiveTeamDataMode('loading');setFeedRetryToken(token=>token+1);}} style={{border:0,background:'transparent',color:C.rust,fontSize:10,fontWeight:800,cursor:'pointer',padding:0}}>RETRY</button>}
          </div>
          </div>
        </div>
      <div className="overview-team-context" style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:8}}>
          <TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={22} />
          <span className="sr-only">Select team</span>
          <select aria-label="Select team" value={selTeam} onChange={e=>{ const key=e.target.value; const selected=TEAMS[key]; setSelTeam(key); if (selected) recordRecentView({ type:'team', abbr:selected.abbr, label:selected.name, secondary:selected.div || 'Team overview' }); }}
          style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:'pointer'}}>
            {sortTeamsByLeagueDivisionName().map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </select>
          <select aria-label="Select minor league affiliate" value={affiliateId} onChange={e=>{const next=affiliates.find(row=>String(row.id)===e.target.value); setAffiliateId(e.target.value); if(next) { setAffiliateLevel(String(next.levelId)); recordRecentView({ type:'affiliate', affiliateId:next.id, parentAbbr:team.abbr, levelId:next.levelId, label:next.name, secondary:`${next.level} · ${team.name}` }); }}} disabled={!affiliates.length || affiliatesState==='loading'}
           style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:affiliates.length?'pointer':'not-allowed',opacity:affiliates.length?1:.65}}>
             <option value="">{affiliatesState==='loading'?'Loading affiliates…':affiliatesState==='error'?'Affiliates unavailable':'Select MiLB affiliate'}</option>
             {affiliates.map(row=><option key={row.id} value={row.id}>{row.level} · {row.name}</option>)}
           </select>
        </label>
        <div style={{display:'flex',gap:22,flexWrap:'wrap'}}>
          {[['W–L',team.w == null || team.l == null ? '—' : `${team.w}–${team.l}`],['Win%',formatTeamMetric(team.pct,3)],['RS',formatTeamMetric(team.rs)],['RA',formatTeamMetric(team.ra)],['Run Diff',rd == null ? '—' : `${rd>0?'+':''}${rd}`],['Playoff Odds',playoffOddsValue],['Team WAR',teamWarValue]].map(([l,v],i)=>(
            <div key={i} title={v === 'Unavailable' ? `${l} unavailable: no verified provider response or safe derived rollup` : undefined} style={{textAlign:'center'}}>
              <div style={px({fontSize:20,fontWeight:800,lineHeight:1,color:i===4?(rd==null?C.text3:rd>0?C.teal:C.rust):(i===5||i===6)?(v === 'Unavailable' ? C.text4 : C.teal):C.text})}><MetricValue value={v} loading={liveTeamDataMode === 'loading'} width={i === 0 ? 54 : 38} /></div>
              <div style={sans({fontSize:10,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginTop:3})}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {affiliateId && <Panel title="Minor-League Affiliate Overview" accent={C.teal} badge={affiliateOverviewState==='loading'?'Loading…':affiliateOverviewState==='ready'?'Live MLB Stats API':'Source unavailable'}>
        <div style={{display:'flex',gap:6,padding:'8px 12px',borderBottom:`1px solid ${C.borderLight}`,flexWrap:'wrap'}}>
          {[['overview','Overview'],['standings','Standings'],['schedule','Schedule']].map(([key,label])=><button key={key} type="button" onClick={()=>setAffiliateTab(key)} style={{border:0,borderBottom:`2px solid ${affiliateTab===key?C.teal:'transparent'}`,background:'transparent',color:affiliateTab===key?C.teal:C.text3,padding:'6px 8px',cursor:'pointer',...px({fontSize:9,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase'})}}>{label}</button>)}
        </div>
        {affiliateTab==='overview' && <>
          <div className="skip-affiliate-overview-grid" style={{padding:'12px 14px',display:'grid',gridTemplateColumns:'minmax(0,1.3fr) repeat(4,minmax(90px,1fr))',gap:12,alignItems:'center'}}>
            <div><div style={sans({fontSize:15,fontWeight:800,color:C.text})}>{affiliateOverview?.name || affiliates.find(row=>String(row.id)===String(affiliateId))?.name || 'Minor-league affiliate'}</div><div style={sans({fontSize:10,color:C.text3,marginTop:3})}>{affiliateOverview?.level || affiliates.find(row=>String(row.id)===String(affiliateId))?.level || 'MiLB'} · {affiliateOverview?.league || affiliates.find(row=>String(row.id)===String(affiliateId))?.league || 'Affiliate feed'}{affiliateOverview?.venue ? ` · ${affiliateOverview.venue}` : ''}</div><div style={sans({fontSize:9,color:C.text3,marginTop:5})}>Affiliated with {team.name} · {affiliateOverview?.retrievedAt ? `retrieved ${new Date(affiliateOverview.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : affiliateOverviewState}</div></div>
            {[[affiliateOverview?.hitting?.ops,'OPS'],[affiliateOverview?.hitting?.homeRuns,'HR'],[affiliateOverview?.pitching?.era,'ERA'],[affiliateOverview?.pitching?.strikeOuts,'K']].map(([value,label])=><div key={label} style={{textAlign:'center'}}><div style={px({fontSize:18,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(label==='ERA'?2:label==='OPS'?3:0)}</div><div style={sans({fontSize:9,textTransform:'uppercase',letterSpacing:'.06em',color:C.text3})}>{label}</div></div>)}
          </div>
          <div className="skip-affiliate-savant-grid" style={{padding:'0 14px 12px',display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
            {[['xBA',affiliateSavant?.expectedBA,3],['xSLG',affiliateSavant?.expectedSLG,3],['Hard-hit %',affiliateSavant?.hardHitPercent,1],['Barrel %',affiliateSavant?.barrelPercent,1]].map(([label,value,digits])=><div key={label} style={{padding:'8px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2}}><div style={px({fontSize:14,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(digits)}{value!=null && label.includes('%')?'%':''}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em'})}><MetricInfo label={label} /></div></div>)}
          </div>
          <div style={{padding:'0 14px 10px',...sans({fontSize:9,color:C.text3})}}>Baseball Savant · {affiliateSavant?.retrievedAt ? `retrieved ${new Date(affiliateSavant.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeFeedStatus(affiliateSavant?.status, 'Not retrieved')}</div>
          {affiliateOverviewState==='error' && <div style={{padding:'0 14px 12px',...sans({fontSize:10,color:C.rust})}}>The selected affiliate’s live overview is unavailable right now. The MLB parent overview remains available above.</div>}
        </>}
        {affiliateTab==='standings' && <div style={{padding:'10px 14px'}}><div style={sans({fontSize:9,color:C.text3,marginBottom:8})}>Triple-A standings · {affiliateStandings?.retrievedAt ? `retrieved ${new Date(affiliateStandings.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeFeedStatus(affiliateStandings?.status, 'Loading')}</div>{affiliateStandings?.rows?.length ? affiliateStandings.rows.slice(0,12).map((row,index)=><div key={row.id || row.name} style={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) 48px 48px 52px',gap:8,padding:'6px 0',borderBottom:`1px solid ${C.borderLight}`,...sans({fontSize:10,color:row.id===Number(affiliateId)?C.teal:C.text})}}><span>{row.rank || index+1}</span><span>{row.name}</span><span>{row.w}–{row.l}</span><span>{row.pct?.toFixed?.(3) || '—'}</span><span>{row.gb || '—'}</span></div>) : <div style={sans({padding:'14px 0',fontSize:10,color:C.text3})}>Standings are unavailable from the current minor-league feed.</div>}</div>}
        {affiliateTab==='schedule' && <div style={{padding:'10px 14px'}}><div style={sans({fontSize:9,color:C.text3,marginBottom:8})}>Next 14 days · {affiliateSchedule?.retrievedAt ? `retrieved ${new Date(affiliateSchedule.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeFeedStatus(affiliateSchedule?.status, 'Loading')}</div>{affiliateSchedule?.games?.length ? affiliateSchedule.games.map(game=><div key={game.gamePk} style={{display:'grid',gridTemplateColumns:'76px minmax(0,1fr) 74px',gap:8,alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${C.borderLight}`,...sans({fontSize:10,color:C.text})}}><span>{game.time ? new Date(game.time).toLocaleDateString([], {month:'short',day:'numeric'}) : 'TBD'}</span><span>{game.away.name} @ {game.home.name}</span><span style={{color:C.text3}}>{game.status || 'Scheduled'}</span></div>) : <div style={sans({padding:'14px 0',fontSize:10,color:C.text3})}>The affiliate schedule is unavailable or has no games in the next 14 days.</div>}</div>}
      </Panel>}

      <StatStrip items={[
        {val:<MetricValue value={formatTeamMetric(team.ops,3)} loading={liveTeamDataMode === 'loading'} />,lbl:'Team OPS',   sub:'Offense', trend:verifiedTrends.ops},
        {val:<MetricValue value={formatTeamMetric(team.hr)} loading={liveTeamDataMode === 'loading'} />,    lbl:'Home Runs',  sub:'Power'},
        {val:<MetricValue value={formatTeamMetric(team.era,2)} loading={liveTeamDataMode === 'loading'} />,lbl:'Team ERA',   sub:'Pitching', trend:verifiedTrends.era},
        {val:<MetricValue value={formatTeamMetric(team.whip,3)} loading={liveTeamDataMode === 'loading'} />,lbl:'WHIP',      sub:'Command', trend:verifiedTrends.whip},
        {val:<MetricValue value={formatTeamMetric(team.avg,3)} loading={liveTeamDataMode === 'loading'} />,lbl:'Batting Avg',sub:'Contact'},
        {val:<MetricValue value={formatTeamMetric(team.k)} loading={liveTeamDataMode === 'loading'} />,     lbl:'Strikeouts', sub:'K'},
        {val:<MetricValue value={formatTeamMetric(team.sb)} loading={liveTeamDataMode === 'loading'} />,    lbl:'Stolen Bases',sub:'Speed'},
        {val:<MetricValue value={teamWarValue} loading={liveTeamDataMode === 'loading'} />,lbl:'Team WAR',   sub:`FanGraphs · ${modelFreshness}`, color:teamWarValue === 'Unavailable' ? C.text4 : C.purple},
      ]}/>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'7px 10px',border:`1px solid ${C.borderLight}`,borderRadius:7,background:C.surface2,...sans({fontSize:9.5,color:C.text3})}}>
        <span>Model source: <strong style={{color:C.text2}}>FanGraphs</strong> · {modelFreshness}</span>
        <span>Playoff odds: {playoffOddsSource}{skipPlayoffEstimate?.estimate != null && teamModelData?.playoffOdds == null ? ` · ${skipPlayoffEstimate.simulationCount || 1200} simulations` : ''} · Team WAR: {humanizeFeedStatus(teamModelData?.statuses?.teamWar || teamModelState)}</span>
      </div>
      <Panel title="Advanced Models & Savant" accent={C.purple} badge={teamSavantDisplayData?.status === 'live' ? 'Baseball Savant' : humanizeFeedStatus(teamSavantDisplayData?.status, 'Loading…')}>
        <div style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'repeat(6,minmax(80px,1fr))',gap:8}}>
          {[["Projected W",teamModelData?.advancedMetrics?.projectedWins,1],["Projected L",teamModelData?.advancedMetrics?.projectedLosses,1],["Off WAR",teamModelData?.advancedMetrics?.offenseWar,1],["Def WAR",teamModelData?.advancedMetrics?.defenseWar,1],["xwOBA",teamSavantDisplayData?.expectedWOBA,3],["Exit velo",teamSavantDisplayData?.exitVelocity,1]].map(([label,value,digits])=><div key={label} style={{padding:'8px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2}}><div style={px({fontSize:14,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(digits)}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em'})}>{label}</div></div>)}
        </div>
        <div style={{padding:'0 14px 10px',...sans({fontSize:9,color:C.text3})}}>FanGraphs projections · {modelFreshness} · {teamSavantDisplayData?.source || 'Baseball Savant'} · {teamSavantDisplayData?.retrievedAt ? `retrieved ${new Date(teamSavantDisplayData.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : 'not retrieved'}</div>
      </Panel>
      <Panel title="Ballpark Environment" accent={OVERVIEW_ACCENTS.context} badge={teamVenueState === 'loading' ? 'Loading…' : teamVenueState === 'ready' ? (teamVenueMetadata?.freshness === 'stale-cached' ? 'Cached MLB Stats API' : 'MLB Stats API') : 'Unavailable'}>
        {teamVenueMetadata?.venue ? <>
          <div style={{padding:'10px 14px 8px',display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'baseline'}}>
            <div style={px({fontSize:15,fontWeight:800,color:C.text})}>{teamVenueMetadata.venue.name || team.name}</div>
            <div style={sans({fontSize:9,color:C.text3})}>{teamVenueMetadata.freshness === 'stale-cached' ? 'Verified cached snapshot' : 'Verified venue metadata'}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',borderTop:`0.5px solid ${C.borderLight}`}}>
            {[
              ['Capacity', teamVenueMetadata.venue.capacity == null ? '—' : teamVenueMetadata.venue.capacity.toLocaleString()],
              ['Surface', teamVenueMetadata.venue.surface || '—'],
              ['Roof', teamVenueMetadata.venue.roof || '—'],
              ['Coordinates', teamVenueMetadata.venue.latitude == null || teamVenueMetadata.venue.longitude == null ? '—' : `${teamVenueMetadata.venue.latitude.toFixed(2)}, ${teamVenueMetadata.venue.longitude.toFixed(2)}`],
            ].map(([label,value], index) => <div key={label} style={{padding:'9px 10px',borderRight:index < 3 ? `0.5px solid ${C.borderLight}` : 'none'}}><div style={px({fontSize:13,fontWeight:800,color:value === '—' ? C.text3 : C.text})}>{value}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginTop:3})}>{label}</div></div>)}
          </div>
          <div style={sans({padding:'8px 14px 10px',fontSize:9,color:C.text4,lineHeight:1.4})}>Wall distances: LF {teamVenueMetadata.venue.dimensions?.leftLine ?? '—'} · LCF {teamVenueMetadata.venue.dimensions?.leftCenter ?? '—'} · CF {teamVenueMetadata.venue.dimensions?.center ?? '—'} · RCF {teamVenueMetadata.venue.dimensions?.rightCenter ?? '—'} · RF {teamVenueMetadata.venue.dimensions?.rightLine ?? '—'} ft. Altitude, wall height, orientation, and park factors are not shown without a verified source.</div>
        </> : <OverviewEmptyState status={teamVenueState === 'loading' ? 'Loading' : teamVenueState === 'source-gap' ? 'Source gap' : 'Unavailable'} message="Ballpark metadata" detail="Official MLB venue metadata is not available for this team right now. No static park values are substituted." />}
      </Panel>

      <div className="overview-responsive-grid overview-decision-row" style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(280px,1.15fr) minmax(250px,1fr)',gap:14,alignItems:'start'}}>
        <Panel title="Team Leaders" accent={OVERVIEW_ACCENTS.offense} badge={teamPlayersBadge}>
          <div style={{padding:'8px 14px 6px',borderBottom:`0.5px solid ${C.borderLight}`}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.amber,marginBottom:8})}>Batting</div>
            {leaders.batting.map((row,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:i<leaders.batting.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span style={{...px({fontSize:10,fontWeight:700,color:C.amber}),background:C.amberSoft,padding:'1px 6px',borderRadius:4,minWidth:30,textAlign:'center'}}>{row.cat}</span>
                  <span style={sans({fontSize:11,color:C.text2})}>{row.player}</span>
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px 6px'}}>
            <div style={sans({fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.rust,marginBottom:8})}>Pitching</div>
            {leaders.pitching.map((row,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:i<leaders.pitching.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span style={{...px({fontSize:10,fontWeight:700,color:C.rust}),background:C.rustSoft,padding:'1px 6px',borderRadius:4,minWidth:30,textAlign:'center'}}>{row.cat}</span>
                  <span style={sans({fontSize:11,color:C.text2})}>{row.player}</span>
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Front Office Evaluation" accent={OVERVIEW_ACCENTS.context} badge="Decision Lens">
          <div style={{padding:'10px 14px 0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Strengths</div>
                {fo.strengths.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:5}}>
                    <span style={{color:C.teal,fontSize:11,flexShrink:0,marginTop:1}}>✓</span>
                    <span style={sans({fontSize:10.5,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.rust,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Weaknesses</div>
                {fo.weaknesses.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:5}}>
                    <span style={{color:C.rust,fontSize:11,flexShrink:0,marginTop:1}}>✕</span>
                    <span style={sans({fontSize:10.5,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginTop:6,paddingTop:10,borderTop:`0.5px solid ${C.borderLight}`}}>
              <div style={sans({fontSize:9.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.text3,marginBottom:8})}>Overall Team Rating</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:6}}>
                {[['Offense',D.og,C.amber],['Pitching',D.pg,C.rust],['Defense',D.dg,C.teal],['Baserunning',D.bg,C.teal],['Depth','—',C.slate],['Future Value','—',C.purple]].map(([lbl,val,color])=>(
                  <div key={lbl} style={{textAlign:'center',background:C.surface2,borderRadius:7,padding:'7px 3px'}}>
                    <div style={px({fontSize:17,fontWeight:800,color,lineHeight:1})}>{val}</div>
                    <div style={sans({fontSize:8.5,color:C.text3,marginTop:3,lineHeight:1.2})}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Team Strength Radar" accent={OVERVIEW_ACCENTS.context} badge="Percentiles">
          <div style={{padding:'3px 8px 0'}}>
            <Suspense fallback={<ChartFallback height={196}/> }>
              <StrengthRadar data={D.strengthData} accent={teamAccent}/>
            </Suspense>
          </div>
          <div style={{padding:'0 14px 10px',...sans({fontSize:9.5,color:C.text4,lineHeight:1.4})}}>
            Live league-relative scores. Offense and Pitching mirror the rating tiles; the remaining axes show the specific strengths behind the evaluation.
          </div>
        </Panel>
      </div>

      <Panel title="Franchise CBT Trend" accent={teamAccent} badge={`${taxHistorySeasons[0]}–${taxHistorySeasons.at(-1)}`}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 14px 4px',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={24} />
            <div>
              <div style={sans({fontSize:11,fontWeight:800,color:C.text})}>{team.name || 'Selected franchise'}</div>
              <div style={sans({fontSize:9.5,color:C.text3,marginTop:2})}>Historical tax payroll and estimated CBT bill</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginLeft:'auto'}}>
            <label style={{display:'inline-flex',alignItems:'center',gap:6,...sans({fontSize:9.5,color:C.text3,fontWeight:700})}}>
              <span>History</span>
              <select aria-label="Franchise CBT history range" value={taxHistoryRange} onChange={event => setTaxHistoryRange(saveCbtHistoryRange(event.target.value))}
                style={{padding:'5px 7px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface3,color:C.text,...px({fontSize:9.5,fontWeight:800})}}>
                {CBT_HISTORY_OPTIONS.map(option => <option key={option} value={option}>{option} seasons</option>)}
              </select>
            </label>
            <div style={px({fontSize:9,color:taxTrendState==='ready'?C.teal:taxTrendState==='loading'?C.amber:C.text3,fontWeight:800,letterSpacing:'.06em'})}>
              {taxTrendState === 'loading' ? 'LOADING SOURCE HISTORY' : taxTrendState === 'ready' ? 'SPOTRAC HISTORY' : 'HISTORY UNAVAILABLE'}
            </div>
          </div>
        </div>
        <div style={{padding:'2px 8px 0'}}>
          <Suspense fallback={<ChartFallback height={178}/> }>
            <LuxuryTaxTrendChart data={taxTrendRows} accent={teamAccent}/>
          </Suspense>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'0 14px 8px',...sans({fontSize:9.5,color:C.text3})}}>
          <span><i style={{display:'inline-block',width:16,height:2,background:teamAccent,verticalAlign:'middle',marginRight:5}} />CBT payroll</span>
          <span><i style={{display:'inline-block',width:16,height:2,background:C.rust,verticalAlign:'middle',marginRight:5}} />Estimated tax bill</span>
        </div>
        <div style={{padding:'0 14px 10px',...sans({fontSize:9.5,color:C.text4,lineHeight:1.4})}}>
                        {taxHistoryRange}-season rows are requested from season-specific Spotrac MLB Tax Trackers. Missing rows remain unavailable; SKIP does not interpolate historical tax values. Threshold rules follow the <a href="https://www.mlb.com/glossary/transactions/competitive-balance-tax" target="_blank" rel="noreferrer" style={{color:C.amber}}>MLB CBT glossary</a>.

        </div>
      </Panel>

      <Panel title="Front Office Read" accent={teamAccent} badge="Decision Lens">
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
          {[
            {label:'Current posture', value:rd == null ? 'Data pending' : rd > 0 ? 'Contending profile' : 'Needs run support', detail:rd == null ? 'Run differential unavailable' : `${rd > 0 ? '+' : ''}${rd} run differential`, color:rd == null ? C.text3 : rd > 0 ? C.teal : C.rust},
            {label:'Best signal', value:team.ops == null ? 'Data pending' : team.ops >= .750 ? 'Offensive leverage' : team.era != null && team.era <= 3.50 ? 'Run prevention' : 'Balanced evaluation', detail:team.ops == null ? 'Waiting on team aggregates' : `OPS ${formatTeamMetric(team.ops,3)} · ERA ${formatTeamMetric(team.era,2)}`, color:team.ops >= .750 ? C.amber : C.navy},
            {label:'Next question', value:'Prospect depth', detail:'Review future value and ETA', color:C.purple, action:() => window.dispatchEvent(new CustomEvent('skip-navigate', { detail:{ tab:'prospects' } }))},
          ].map((item, i) => (
            <div key={item.label} style={{padding:'12px 14px',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
              <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6})}>{item.label}</div>
              <div style={sans({fontSize:13,fontWeight:800,color:item.color,lineHeight:1.2})}>{item.value}</div>
              {item.action ? (
                <button onClick={item.action} style={{marginTop:5,padding:0,border:'none',background:'transparent',fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:10,color:C.purple,cursor:'pointer',textAlign:'left',textDecoration:'underline',textUnderlineOffset:2}}>{item.detail} →</button>
              ) : <div style={sans({fontSize:10,color:C.text3,marginTop:5,lineHeight:1.4})}>{item.detail}</div>}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="AI Scout Insights" accent={C.teal} badge={aiInsightsState === 'loading' ? 'Analyzing roster…' : aiInsightsState === 'ready' ? 'AI-assisted' : 'Local fallback'}>
        <div style={{padding:'8px 14px 0',...sans({fontSize:10,color:C.text3,lineHeight:1.45})}}>
          Automated read of the selected team using current aggregate stats and roster leaders. It updates when the team or live feed changes.
        </div>
        <div className="roster-insight-presets" style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',padding:'10px 14px 0'}}>
          <span style={sans({fontSize:9.5,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em'})}>Presets</span>
          {ROSTER_PRESETS.map(preset => <button key={preset.id} type="button" aria-pressed={activeRosterPreset === preset.id} onClick={()=>applyRosterPreset(preset)} style={{height:28,padding:'0 9px',border:`1px solid ${activeRosterPreset === preset.id ? C.teal : C.border}`,borderRadius:6,background:activeRosterPreset === preset.id ? C.tealSoft : C.surface,color:activeRosterPreset === preset.id ? C.teal : C.text2,fontSize:10,fontWeight:700,cursor:'pointer'}}>{preset.label}</button>)}
        </div>
        <div className="roster-insight-controls" style={{display:'flex',alignItems:'flex-start',gap:8,flexWrap:'wrap',padding:'8px 14px 2px'}}>
          <fieldset style={{border:0,padding:0,margin:0,minWidth:190}}>
            <legend style={sans({fontSize:10,color:C.text2,fontWeight:700,marginBottom:5})}>Positions</legend>
            <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
              <button type="button" aria-label="Show all roster positions" onClick={()=>{setSelectedRosterPositions([]);setActiveRosterPreset(null)}} style={{height:28,padding:'0 8px',border:`1px solid ${selectedRosterPositions.length===0?C.amber:C.border}`,borderRadius:6,background:selectedRosterPositions.length===0?C.amberSoft:C.surface,color:selectedRosterPositions.length===0?C.amberDark:C.text2,fontSize:10,cursor:'pointer'}}>All</button>
              {rosterPositions.map(position => {
                const checked = selectedRosterPositions.includes(position);
                return <label key={position} style={{display:'inline-flex',alignItems:'center',gap:4,height:28,padding:'0 7px',border:`1px solid ${checked?C.amber:C.border}`,borderRadius:6,background:checked?C.amberSoft:C.surface,cursor:'pointer',...sans({fontSize:10,color:checked?C.amberDark:C.text2,fontWeight:700})}}>
                  <input type="checkbox" aria-label={`Filter roster insights by ${position}`} checked={checked} onChange={e=>{setActiveRosterPreset(null);setSelectedRosterPositions(prev=>e.target.checked?[...prev,position]:prev.filter(item=>item!==position))}} style={{accentColor:C.amber}} />
                  {position}
                </label>;
              })}
              {!rosterPositions.length && <span style={sans({fontSize:10,color:C.text4,fontStyle:'italic'})}>Loading positions…</span>}
            </div>
          </fieldset>
          <label style={{display:'flex',alignItems:'center',gap:6,...sans({fontSize:10,color:C.text2,fontWeight:700})}}>
            <span>Sort by</span>
            <select aria-label="Sort roster insights by player statistic" value={rosterSort} onChange={e=>{setActiveRosterPreset(null);setRosterSort(e.target.value)}} style={{height:30,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,fontSize:10,cursor:'pointer'}}>
              {ROSTER_SORT_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}{option.direction === 'asc' ? ' ↑' : ' ↓'}</option>)}
            </select>
          </label>
          <label style={{display:'flex',alignItems:'center',gap:6,...sans({fontSize:10,color:C.text2,fontWeight:700})}}>
            <span>Min {rosterSortOption.group === 'hitting' ? 'PA' : 'IP'}</span>
            <select aria-label={`Minimum ${rosterSortOption.group === 'hitting' ? 'plate appearances' : 'innings pitched'}`} value={activeMinimum} onChange={e=>{setActiveRosterPreset(null);rosterSortOption.group === 'hitting' ? setMinBattingPa(Number(e.target.value)) : setMinPitchingIp(Number(e.target.value))}} style={{height:30,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,fontSize:10,cursor:'pointer'}}>
              {(rosterSortOption.group === 'hitting' ? [[0,'Any PA'],[50,'50+ PA'],[150,'150+ PA'],[300,'300+ PA']] : [[0,'Any IP'],[10,'10+ IP'],[30,'30+ IP'],[60,'60+ IP']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <span style={{marginLeft:'auto',...px({fontSize:9.5,color:C.text4})}}>{filteredRosterRows.length} {filteredRosterRows.length === 1 ? 'player' : 'players'} · {rosterSortOption.label}</span>
        </div>
        <div className="roster-insight-leaders" style={{padding:'6px 14px 2px',display:'flex',gap:6,flexWrap:'wrap'}}>
          {filteredRosterRows.slice(0,6).map(row => (
            <div key={`${row.group}-${row.id}`} style={{minWidth:150,flex:'1 1 150px',padding:'7px 9px',borderRadius:6,background:C.surface2,border:`0.5px solid ${C.borderLight}`}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={sans({fontSize:10.5,fontWeight:800,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})}>{row.name}</span>
                <span style={{marginLeft:'auto',...px({fontSize:8.5,color:C.text3})}}>{row.position || '—'}</span>
              </div>
              <div style={{marginTop:3,...px({fontSize:10,color:C.teal,fontWeight:700})}}>{formatRosterStat(row, rosterSortOption)} {rosterSortOption.label}</div>
              <div style={{marginTop:2,...px({fontSize:8.5,color:C.text4})}}>Sample: {formatRosterSampleLabel(rosterSortOption.group, activeMinimum)}</div>
            </div>
          ))}
          {teamPlayersLoading && <div role="status" style={sans({fontSize:10,color:C.text3,fontStyle:'italic',padding:'5px 0'})}>Loading roster leaders…</div>}
          {!teamPlayersLoading && teamPlayersError && <OverviewEmptyState status="Unavailable" message="Roster leader data" detail="The current MLB roster leader feed did not return verified rows." />}
          {!teamPlayersLoading && !teamPlayersError && !filteredRosterRows.length && <OverviewEmptyState status="No matching rows" message="Roster leaders" detail="No roster players match the selected positions, stat, and sample threshold." />}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,marginTop:8}}>
          {[
            {label:'Strengths', items:displayedInsights.strengths, color:C.teal, soft:C.tealSoft, empty:'No qualifying strength signal yet.'},
            {label:'Weaknesses', items:displayedInsights.weaknesses, color:C.rust, soft:C.rustSoft, empty:'No qualifying weakness signal yet.'},
          ].map((group, groupIndex) => (
            <div key={group.label} style={{padding:'8px 14px 12px',borderRight:groupIndex===0?`0.5px solid ${C.borderLight}`:'none'}}>
              <div style={sans({fontSize:9.5,fontWeight:800,color:group.color,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:7})}>{group.label}</div>
              {group.items.length ? group.items.map(item => (
                <div key={item.title} style={{padding:'8px 9px',marginBottom:6,borderRadius:6,background:group.soft,border:`0.5px solid ${group.color}33`}}>
                  <div style={sans({fontSize:11.5,fontWeight:800,color:C.text})}>{item.title}</div>
                  <div style={sans({fontSize:10,color:C.text2,lineHeight:1.4,marginTop:3})}>{item.detail}</div>
                  <div style={px({fontSize:9.5,color:group.color,fontWeight:700,marginTop:5})}>{item.evidence}</div>
                </div>
              )) : <div style={sans({fontSize:10,color:C.text3,fontStyle:'italic'})}>{group.empty}</div>}
            </div>
          ))}
        </div>
        <div style={{padding:'8px 14px',borderTop:`0.5px solid ${C.borderLight}`,...sans({fontSize:9.5,color:C.text4})}}>
          Source: {displayedInsights.source}. {aiInsightsState === 'error' ? 'AI service unavailable; showing local roster analysis. ' : ''}This is decision support, not a replacement for staff scouting review.
        </div>
      </Panel>

      {/* ── ROW 1: Tables | Radars + Run Diff | Standings + Grade ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(160px,190px) 1fr minmax(168px,210px)',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Offense" accent={teamAccent} badge="2026">
            {offRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===offRows.length-1}/>)}
          </Panel>
          <Panel title="Pitching" accent={teamAccent}>
            {pitRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===pitRows.length-1}/>)}
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14,minWidth:0}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Panel title="Offensive Profile" accent={teamAccent} badge={D.offenseData.length ? 'MLB Stats API' : 'Unavailable'}>
              {D.offenseData.length ? <Suspense fallback={<ChartFallback height={196}/> }>
                <OffenseRadar data={D.offenseData} accent={teamAccent}/>
              </Suspense> : <OverviewEmptyState message="Offensive profile unavailable" detail="No verified current-season hitting aggregates were returned by the MLB Stats API." />}
              <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4})}>Source: {D.radarSource}.</div>
            </Panel>
            <Panel title="Team Strengths" accent={teamAccent} badge={D.strengthData.length ? 'MLB Stats API' : 'Unavailable'}>
              {D.strengthData.length ? <Suspense fallback={<ChartFallback height={196}/> }>
                <StrengthRadar data={D.strengthData} accent={teamAccent}/>
              </Suspense> : <OverviewEmptyState message="Team strengths unavailable" detail="No verified current-season team aggregates were returned by the MLB Stats API." />}
              <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4})}>Source: {D.radarSource}.</div>
            </Panel>
          </div>
          <Panel title={`Run Differential — ${CURRENT_SEASON}`} accent={teamAccent} badge={liveRunDiffData.length ? 'MLB Stats API' : 'Unavailable'}>
            <div style={{padding:'8px 2px 4px'}}>
              {liveRunDiffData.length ? <Suspense fallback={<ChartFallback height={144}/> }>
                <RunDiffChart data={liveRunDiffData} accent={teamAccent}/>
              </Suspense> : <OverviewEmptyState message="Run differential unavailable" detail="No verified current-season MLB Stats API rollup was returned." />}
            </div>
            <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4})}>Source: MLB Stats API standings · current-season cumulative snapshot.</div>
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title={`${D.divName} Standings`} accent={teamAccent}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:C.surface2}}>
                  {['Team','W','L','PCT'].map(h=>(
                    <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.text2,textAlign:h==='Team'?'left':'right',borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {D.standings.map((r,i)=>(
                  <tr key={i} style={{background:r.cur?`color-mix(in srgb, ${teamAccent} 14%, transparent)`:'transparent'}}>
                    <td style={{padding:'6px 10px',fontWeight:r.cur?700:500,color:C.text,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12}}>{r.abbr}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.w}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.l}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="SKIP Grade" accent={OVERVIEW_ACCENTS.context}>
            <div style={{padding:'14px 14px 10px',textAlign:'center'}}>
              <div style={px({fontSize:52,fontWeight:900,color:C.amber,lineHeight:1})}>{D.overall}</div>
              <div style={sans({fontSize:11,color:C.text2,marginTop:4,letterSpacing:'.04em'})}>Overall Team Rating</div>
              <div style={{marginTop:12,borderTop:`0.5px solid ${C.borderLight}`,paddingTop:10,display:'flex',flexDirection:'column',gap:4}}>
                {[['Offense',D.og,D.pctBars.find(x=>x.lbl==='Offense')?.pct],['Pitching',D.pg,D.pctBars.find(x=>x.lbl==='Pitching')?.pct],['Defense',D.dg,null],['Baserunning',D.bg,D.pctBars.find(x=>x.lbl==='Baserunning')?.pct],['Depth','—',null],['Future Value','—',null]].map(([l,g,n])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 4px'}}>
                    <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <span style={px({fontSize:11,color:C.text3})}>{percentileLabel(n)}</span>
                      <span style={px({fontSize:12,fontWeight:700,color:C.amber,minWidth:24,textAlign:'right'})}>{g}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2: Batted Ball Profile | Pitch Arsenal | Contact Quality ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Batted Ball Profile — same honesty treatment as PlayersPage's
             SprayChart/PlateDisciplineZone: seeded from real team stats,
             not real tracked batted-ball data. Was flagged in this doc's
             notes twice before as lower-priority than the player-level
             fix (decorative, not sitting beside real per-player Statcast
             panels) — fixing it now that a debug pass finally had room
             for it, since "lower priority" isn't the same as "not a real
             gap", and half this page turned out to share the pattern. */}
        <Panel title="Batted Ball Profile" accent={OVERVIEW_ACCENTS.offense} badge={bb ? <OverviewSourceBadge status={teamSavantSource?.includes('rollup') ? 'estimated' : 'verified'} /> : teamSavantState === 'loading' ? 'Loading' : <OverviewSourceBadge status="coverage-gap" />}>
          {bb ? (
          <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:0}}>
            {[
              ['Barrel %',     formatPanelMetric(bb.barrelPct, '%'), C.text],
              ['Hard Hit %',   formatPanelMetric(bb.hardHitPct, '%'), C.text],
              ['Sweet Spot %', formatPanelMetric(bb.sweetSpot, '%'), C.text],
              ['Avg EV',       formatPanelMetric(bb.avgEV, ' mph'), C.text],
              ['Max EV',       formatPanelMetric(bb.maxEV, ' mph'), C.text],
              ['Launch Angle', formatPanelMetric(bb.launchAngle, '°'), C.text],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{padding:'8px 14px',borderBottom:i<3?`0.5px solid ${C.borderLight}`:'none',borderRight:i%3!==2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2})}>{l}</div>
                <div style={px({fontSize:16,fontWeight:800,color:c})}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{borderTop:`0.5px solid ${C.border}`,padding:'10px 14px'}}>
            <div style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8})}>Spray Direction</div>
            <div style={{display:'flex',gap:10,marginBottom:8}}>
              {[['Pull %',formatPanelMetric(bb.pullPct, '%')],['Center %',formatPanelMetric(bb.centerPct, '%')],['Oppo %',formatPanelMetric(bb.oppoPct, '%')]].map(([l,v])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:C.text})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10}}>
              {[['GB %',formatPanelMetric(bb.gbPct, '%'),C.text],['FB %',formatPanelMetric(bb.fbPct, '%'),C.text],['LD %',formatPanelMetric(bb.ldPct, '%'),C.text]].map(([l,v,c])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:c})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={sans({fontSize:9,color:C.text4,marginTop:8,lineHeight:1.4})}>
              Source: {teamSavantSource || 'Baseball Savant Statcast Search'} · {bb.sampleSize?.toLocaleString() || '—'} batted balls.
            </div>
          </div>
          </div>
          ) : (
              <OverviewEmptyState status={teamSavantState === 'loading' ? 'Loading' : 'Unavailable'} message="Team batted-ball rows" detail={teamSavantState === 'loading' ? 'Checking the verified Baseball Savant team and roster feed.' : 'No verified Baseball Savant batted-ball rows were returned for this season.'} />
          )}
        </Panel>

        {/* Pitch Arsenal */}
        <Panel title="Pitch Arsenal" accent={OVERVIEW_ACCENTS.pitching}
          badge={arsenal ? <div style={{display:'flex',gap:6}}>

            {[['Usage','usage'],['Grades','grades']].map(([l,k])=>(
              <button key={k} onClick={()=>setArsenalTab(k)} aria-pressed={arsenalTab===k}
                style={{padding:'2px 8px',fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:700,
                  background:arsenalTab===k?`color-mix(in srgb, ${teamAccent} 14%, transparent)`:C.surface3,color:arsenalTab===k?teamAccent:C.text3,
                  border:'none',borderRadius:4,cursor:'pointer'}}>
                {l}
              </button>
            ))}
          </div> : <OverviewSourceBadge status="coverage-gap" />}>
          {arsenal ? (arsenalTab === 'usage' ? (
            <div style={{display:'flex',gap:0,alignItems:'stretch'}}>
              {/* Donut */}
              <div style={{width:140,flexShrink:0,padding:'8px 0'}}>
                <Suspense fallback={<ChartFallback height={130}/>}>
                  <ArsenalPie data={arsenal}/>
                </Suspense>
              </div>
              {/* Legend */}
              <div style={{flex:1,padding:'12px 14px',display:'flex',flexDirection:'column',gap:6,justifyContent:'center'}}>
                {arsenal.map(p=>(
                  <div key={p.type} style={{display:'flex',alignItems:'center',gap:7}}>
                    <div style={{width:9,height:9,borderRadius:2,background:p.color,flexShrink:0}}/>
                    <span style={sans({fontSize:11,color:C.text2,flex:1})}>{p.type}</span>
                    <span aria-label={`${p.type} usage ${p.pct == null ? 'unavailable' : `${p.pct.toFixed(1)} percent`}`} style={px({fontSize:12,fontWeight:700,color:p.color})}>{p.pct == null ? '—' : `${p.pct.toFixed(1)}%`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{padding:'4px 0'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'6px 14px',borderBottom:`0.5px solid ${C.border}`,gap:8}}>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Pitch</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Stuff+</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>MLB Rank</span>
              </div>
              {arsenal.map((p,i,arr)=>{
                const rank = p.stuffPlus == null ? null : Math.round(3 + (1 - p.stuffPlus/120) * 25);
                const col = p.stuffPlus == null ? C.text3 : p.stuffPlus >= 110 ? C.teal : p.stuffPlus >= 100 ? C.amber : C.slate;
                return (
                  <div key={p.type} style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'7px 14px',gap:8,borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                      <span style={sans({fontSize:11,color:C.text})}>{p.type}</span>
                    </div>
                    <span style={px({fontSize:12,fontWeight:700,color:col})}>{formatPanelMetric(p.stuffPlus)}</span>
                    <span style={{...px({fontSize:10,fontWeight:700,color:col}),background:`color-mix(in srgb, ${col} 9%, transparent)`,padding:'1px 7px',borderRadius:10,textAlign:'center'}}>{rank == null ? '—' : ord(rank)}</span>
                  </div>
                );
              })}
            </div>
          )) : (
              <OverviewEmptyState status={teamSavantState === 'loading' ? 'Loading' : 'Unavailable'} message="Team pitch arsenal rows" detail={teamSavantState === 'loading' ? 'Checking the verified Baseball Savant roster pitch rollup.' : 'No verified Baseball Savant pitch rows were returned for this season.'} />
          )}
          <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
            Source: {teamSavantSource || 'Baseball Savant Statcast Search'} · usage is based on verified pitch rows; Stuff+ remains unavailable in this rollup.
          </div>
        </Panel>

        {/* Contact Quality Allowed + Position OAA */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Contact Quality Allowed" accent={OVERVIEW_ACCENTS.pitching} badge={contactAllowed.sampleSize ? <OverviewSourceBadge status="verified" /> : <OverviewSourceBadge status="coverage-gap" />}>
            {contactAllowed.sampleSize ? (
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
                {[['xwOBA', contactAllowed.xwoba == null ? '—' : contactAllowed.xwoba.toFixed(3)], ['Avg EV', contactAllowed.exitVelocity == null ? '—' : `${contactAllowed.exitVelocity.toFixed(1)} mph`], ['Hard-hit', contactAllowed.hardHitPct == null ? '—' : `${contactAllowed.hardHitPct.toFixed(1)}%`]].map(([label,value]) => <div key={label} style={{padding:'18px 10px',textAlign:'center',borderRight:`0.5px solid ${C.borderLight}`}}><div style={px({fontSize:17,fontWeight:800,color:C.text})}>{value}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginTop:4})}>{label}</div></div>)}
                <div style={sans({gridColumn:'1 / -1',padding:'7px 14px 10px',fontSize:9,color:C.text4})}>Source: Baseball Savant · {contactAllowed.sampleSize.toLocaleString()} verified opponent batted-ball rows.</div>
              </div>
            ) : <OverviewEmptyState message="Opponent contact quality" detail="Baseball Savant did not return verified opponent batted-ball rows for this season." />}
          </Panel>

          {/* Position depth is derived from the verified current-season player rows. */}
          <Panel title="Position Breakdown" accent={OVERVIEW_ACCENTS.defense} badge={<OverviewSourceBadge status="verified" />}>
            {teamRollups.positions.length ? teamRollups.positions.slice(0, 8).map((row, index) => (
              <div key={row.position} style={{display:'flex',justifyContent:'space-between',padding:'7px 14px',borderBottom:index<Math.min(teamRollups.positions.length,8)-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{row.position}</span>
                <span style={px({fontSize:11,fontWeight:700,color:teamAccent})}>{row.players} player{row.players === 1 ? '' : 's'}</span>
              </div>
            )) : <div style={sans({padding:'20px 14px',fontSize:10,color:C.text3})}>Roster rows are still loading.</div>}
            <div style={sans({padding:'8px 14px',fontSize:9,color:C.text4,lineHeight:1.4})}>Verified player-count depth from the current MLB season feed. OAA remains a separate Statcast coverage gap.</div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2b: Baserunning | EV Distribution | Spray Chart ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Baserunning */}
        <Panel title="Baserunning" accent={OVERVIEW_ACCENTS.defense} badge={<OverviewSourceBadge status="verified" />}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,borderBottom:`0.5px solid ${C.border}`}}>
            {[
              ['SB', teamRollups.stolenBases ?? team.sb, C.teal],
              ['Attempts', teamRollups.stolenBaseAttempts ?? 'Unavailable', teamRollups.stolenBaseAttempts == null ? C.text4 : C.teal],
              ['XB Hits', teamRollups.extraBaseHits ?? 'Unavailable', teamRollups.extraBaseHits == null ? C.text4 : C.teal],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{padding:'12px 10px',textAlign:'center',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={px({fontSize:22,fontWeight:800,color:c,lineHeight:1})}>{v}</div>
                <div style={sans({fontSize:9.5,color:C.text3,marginTop:4,textTransform:'uppercase',letterSpacing:'.05em'})}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
            {[
              ['Sprint Speed','Unavailable', C.text4],
              ['Stolen Base Attempts',teamRollups.stolenBaseAttempts ?? 'Unavailable', teamRollups.stolenBaseAttempts == null ? C.text4 : C.teal],
              ['Caught Stealing', teamRollups.caughtStealing ?? 'Unavailable', teamRollups.caughtStealing == null ? C.text4 : C.teal],
              ['MLB Rank (BsR)',  'Unavailable', C.text4],
              ['Extra Base Rate', teamRollups.extraBaseRate == null ? 'Unavailable' : `${(teamRollups.extraBaseRate * 100).toFixed(1)}%`, teamRollups.extraBaseRate == null ? C.text4 : C.teal],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0', borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                <span style={px({fontSize:11,fontWeight:700,color:c})}>{v}</span>
              </div>
            ))}
            <div style={sans({fontSize:9,color:C.text4,paddingTop:2,lineHeight:1.4})}>
              Stolen bases, attempts, caught stealing, and extra-base hits are rolled up from verified player rows. Sprint speed, BsR, and league rank still require dedicated Statcast or play-by-play feeds.
            </div>
          </div>
        </Panel>

        <Panel title="Exit Velocity Distribution" accent={OVERVIEW_ACCENTS.offense} badge={teamExitVelocityState === 'ready' ? 'Savant' : 'Coverage gap'}>
          {teamExitVelocityState === 'ready' ? (
            <div>
              <Suspense fallback={<ChartFallback height={130} />}>
                <EvDistributionChart data={evBins} accent={teamAccent} />
              </Suspense>
              <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
                Source: {teamExitVelocitySource} · {teamExitVelocityRows.length.toLocaleString()} batted balls · 5 mph bins.
              </div>
            </div>
          ) : (
              <OverviewEmptyState message="Team exit velocity" detail="Baseball Savant did not return verified team batted-ball rows for this season. Individual player panels remain available." />
          )}
        </Panel>

        <Panel title="Spray Chart" accent={OVERVIEW_ACCENTS.offense} badge={sprayRows.length ? 'Savant' : 'Unavailable'}>
          {sprayRows.length ? <div style={{padding:'10px 14px 8px'}}><svg viewBox="0 0 260 150" role="img" aria-label="Verified Baseball Savant batted-ball spray coordinates" style={{width:'100%',height:150,background:'linear-gradient(180deg, rgba(21,112,112,.06), transparent)',borderRadius:6}}><path d="M130 142 L28 22 M130 142 L232 22" stroke={C.border} strokeWidth="1" fill="none"/><path d="M130 142 L130 18" stroke={C.border} strokeWidth="1" fill="none"/>{sprayRows.map((row,index) => { const x = Math.max(20, Math.min(240, 130 + ((Number(row.hc_x) - 125) * 0.85))); const y = Math.max(18, Math.min(138, 142 - ((Number(row.hc_y) - 30) * 0.55))); const color = row.bb_type === 'ground_ball' ? C.teal : row.bb_type === 'fly_ball' ? C.amber : row.bb_type === 'line_drive' ? C.rust : C.slate; return <circle key={`${row.hc_x}-${row.hc_y}-${index}`} cx={x} cy={y} r="2.2" fill={color} opacity=".72"/>; })}</svg><div style={sans({fontSize:9,color:C.text4,lineHeight:1.4,marginTop:5})}>Source: Baseball Savant · {sprayRows.length.toLocaleString()} verified batted-ball coordinates. Raw Savant coordinate view; points are not estimated.</div></div> : <OverviewEmptyState message="Team spray coordinates" detail="Baseball Savant did not return verified team batted-ball coordinates for this season." />}
        </Panel>
      </div>

      {/* ── ROW 3: League Rankings + Pct Bars | Splits Dashboard ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(190px,220px) 1fr',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="League Rankings" accent={teamAccent} badge="MLB">
            {D.leagueRanks.map(({label,rank,val},i)=>{
              const color=rank<=3?C.teal:rank<=7?C.amber:rank<=12?C.slate:C.rust;
              return (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 14px',borderBottom:i<D.leagueRanks.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                  <span style={sans({fontSize:11,color:C.text2})}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={px({fontSize:10,color:C.text4})}>{val}</span>
                    <span style={{...px({fontSize:11,fontWeight:700,color}),background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'1px 7px',borderRadius:10,minWidth:42,textAlign:'center'}}>{percentileLabel(rank)}</span>
                  </div>
                </div>
              );
            })}
          </Panel>
          <Panel title="Team Percentile Rankings" accent={teamAccent} badge="vs MLB">
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
              {D.pctBars.map(({lbl,pct,color})=>(
                <div key={lbl}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                    <span style={sans({fontSize:10.5,fontWeight:600,color:C.text2})}>{lbl}</span>
                    <span style={px({fontSize:10.5,fontWeight:700,color})}>{percentileLabel(pct)}</span>
                  </div>
                  <div role="img" aria-label={pct == null ? `${lbl} percentile unavailable` : `${lbl} percentile ${percentileLabel(pct)}`} style={{height:6,background:`linear-gradient(to right, ${C.rust} 0%, ${C.amber} 50%, ${C.teal} 100%)`,borderRadius:3,position:'relative',opacity:pct == null ? .45 : 1}}>
                    <div style={{position:'absolute',top:'50%',left:'50%',height:10,width:1,background:`color-mix(in srgb, ${C.border} 70%, transparent)`,transform:'translateY(-50%)'}}/>
                    {pct != null && <div aria-hidden="true" style={{position:'absolute',top:'50%',left:`${Math.max(0,Math.min(100,pct))}%`,width:10,height:10,borderRadius:'50%',background:C.surface,border:`2px solid ${color}`,boxShadow:`0 0 0 1px ${C.surface}`,transform:'translate(-50%,-50%)'}}/>}
                  </div>
                </div>
              ))}
              <div style={px({fontSize:9,color:C.text4,textAlign:'center',marginTop:2})}>50th = MLB Average</div>
            </div>
          </Panel>
        </div>

        <Panel title="Splits Dashboard" accent={teamAccent}>
          <div style={{display:'flex',borderBottom:`0.5px solid ${C.border}`}}>
            {[['home','Home / Away'],['hand','vs LHP / RHP'],['time','Day / Night']].map(([k,l])=>(
              <button key={k} onClick={()=>setSplitTab(k)} aria-pressed={splitTab===k}
                style={{padding:'8px 16px',fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,color:splitTab===k?teamAccent:C.text3,borderBottom:splitTab===k?`2px solid ${teamAccent}`:'2px solid transparent',borderTop:'none',borderLeft:'none',borderRight:'none',background:'transparent',cursor:'pointer',transition:'all .12s',whiteSpace:'nowrap'}}>
                {l}
              </button>
            ))}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:C.surface2}}>
                {['Split','W–L','OPS','ERA'].map(h=>(
                  <th key={h} style={{padding:'7px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:h==='Split'?'left':'right',borderBottom:`0.5px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {splitRows.length ? splitRows.map((row,i)=>(
                <tr key={i} style={{borderBottom:i<splitRows.length-1?`0.5px solid ${C.borderLight}`:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.amberSoft}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={sans({padding:'9px 14px',fontSize:12,fontWeight:700,color:C.text})}>{row.split}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.navy})}>{row.w}–{row.l}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.amber,fontWeight:700})}>{row.ops}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.rust})}>{row.era}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={sans({padding:'28px 14px',fontSize:10.5,color:C.text3,textAlign:'center',lineHeight:1.5})}>Split statistics unavailable in the current MLB team aggregate feed. No estimated rows are shown.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{padding:'16px 14px',borderTop:`0.5px solid ${C.border}`}}>
            <div style={sans({fontSize:10.5,color:C.text3,lineHeight:1.5})}>{splitRows.length ? 'W–L is derived from completed MLB schedule games. OPS and ERA require per-game boxscore aggregation and remain unavailable in this view.' : 'No verified completed schedule rows were returned for the selected team. No estimated split rows are shown.'}</div>
          </div>
        </Panel>

      </div>

      {/* ── Live Schedule ── */}
      {todayGames.length > 0 && (
        <Panel title="Today's Schedule" accent={C.rust} badge={
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.teal,animation:'pulse 1.6s ease-in-out infinite'}}/>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.teal}}>LIVE</span>
          </div>
        }>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:0}}>
            {todayGames.map((g,i)=>{
              const live=g.inning&&g.status!=='Final'&&g.statusCode!=='F';
              const status=g.status==='Final'?'Final':g.inning?`${g.inningHalf==='top'?'▲':'▼'}${g.inning}`:g.status||'Pre';
              const awayW=g.away.runs!=null&&g.home.runs!=null&&g.away.runs>g.home.runs;
              const homeW=g.away.runs!=null&&g.home.runs!=null&&g.home.runs>g.away.runs;
              return (
                <div key={g.gamePk} style={{padding:'10px 14px',borderBottom:`0.5px solid ${C.borderLight}`,
                  borderRight:(i+1)%4!==0?`0.5px solid ${C.borderLight}`:'none',
                  background:live?`color-mix(in srgb, ${C.teal} 2%, transparent)`:'transparent'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                    <span style={{...px({fontSize:9.5,fontWeight:700}),color:live?C.teal:C.text3,
                      background:live?C.tealSoft:C.surface2,padding:'1px 6px',borderRadius:3}}>
                      {live&&'● '}{status}
                    </span>
                  </div>
                  {[{t:g.away,w:awayW},{t:g.home,w:homeW}].map(({t:tm,w},j)=>(
                    <div key={j} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                      <span style={sans({fontSize:11,fontWeight:w?800:500,color:w?C.text:C.text2})}>{tm.abbr||tm.name}</span>
                      <span style={{...px({fontSize:15,fontWeight:800,lineHeight:1}),color:w?C.amber:C.text}}>{tm.runs??'–'}</span>
                    </div>
                  ))}
                  <div style={sans({fontSize:9,color:C.text3,marginTop:6,display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'})}>
                    <span>{g.venue || 'Venue unavailable'}{todayGameMetadata[g.gamePk]?.weather?.temp ? ` · ${todayGameMetadata[g.gamePk].weather.temp}` : todayGameMetadata[g.gamePk]?.status === 'unavailable' ? ' · Weather unavailable' : ''}</span>
                    <a href={todayGameMetadata[g.gamePk]?.mediaUrl || `https://www.mlb.com/gameday/${g.gamePk}`} target="_blank" rel="noreferrer" style={{color:C.navy,fontWeight:700,textDecoration:'none'}}>MLB Gameday ↗</a>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(OverviewPage);
