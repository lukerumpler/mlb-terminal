const AGGREGATE_KEY = 'skip-team-aggregate-cache-v1';
const PLAYERS_KEY = 'skip-team-player-cache-v1';
const SAVANT_KEY = 'skip-team-savant-cache-v1';
const SAVANT_SUMMARY_KEY = 'skip-team-savant-summary-cache-v1';
const SAVANT_AGAINST_KEY = 'skip-team-savant-against-cache-v1';

export const DAILY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isSameUtcDay(firstTimestamp, secondTimestamp = Date.now()) {
  const first = new Date(Number(firstTimestamp));
  const second = new Date(Number(secondTimestamp));
  return Number.isFinite(first.getTime()) && Number.isFinite(second.getTime())
    && first.toISOString().slice(0, 10) === second.toISOString().slice(0, 10);
}

export function shouldRefreshDailyCache(cached, now = Date.now()) {
  return !cached?.updatedAt || !isSameUtcDay(cached.updatedAt, now);
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort */ }
}

function readTeamCache(key, teamAbbr, season) {
  const all = readJson(key, {});
  const normalized = String(teamAbbr || '').toUpperCase();
  const cached = all?.[`${season}:${normalized}`];
  return cached && cached.data ? cached : null;
}

function saveTeamCache(key, teamAbbr, season, data) {
  const normalized = String(teamAbbr || '').toUpperCase();
  if (!normalized || !Number.isFinite(Number(season)) || !data) return null;
  const all = readJson(key, {});
  const cacheKey = `${season}:${normalized}`;
  const cached = { season:Number(season), teamAbbr:normalized, updatedAt:Date.now(), data };
  writeJson(key, { ...all, [cacheKey]: cached });
  return cached;
}

export function readTeamAggregateCache(season) {
  const cached = readJson(AGGREGATE_KEY, null);
  if (!cached || Number(cached.season) !== Number(season) || !cached.data?.byAbbr) return null;
  return cached;
}

export function saveTeamAggregateCache(data, season) {
  if (!data?.byAbbr || !Number.isFinite(Number(season))) return null;
  const cached = { season:Number(season), updatedAt:Date.now(), data };
  writeJson(AGGREGATE_KEY, cached);
  return cached;
}

export function readTeamPlayersCache(teamId, season) {
  const all = readJson(PLAYERS_KEY, {});
  const cached = all?.[`${season}:${teamId}`];
  return cached && cached.data ? cached : null;
}

export function saveTeamPlayersCache(teamId, season, data) {
  if (!teamId || !Number.isFinite(Number(season)) || !data) return null;
  const all = readJson(PLAYERS_KEY, {});
  const key = `${season}:${teamId}`;
  const cached = { season:Number(season), teamId:Number(teamId), updatedAt:Date.now(), data };
  writeJson(PLAYERS_KEY, { ...all, [key]:cached });
  return cached;
}

export function readTeamSavantCache(teamAbbr, season) {
  return readTeamCache(SAVANT_KEY, teamAbbr, season);
}

export function saveTeamSavantCache(teamAbbr, season, data) {
  return saveTeamCache(SAVANT_KEY, teamAbbr, season, data);
}

export function readTeamSavantSummaryCache(teamAbbr, season) {
  return readTeamCache(SAVANT_SUMMARY_KEY, teamAbbr, season);
}

export function saveTeamSavantSummaryCache(teamAbbr, season, data) {
  return saveTeamCache(SAVANT_SUMMARY_KEY, teamAbbr, season, data);
}

export function readTeamSavantAgainstCache(teamAbbr, season) {
  return readTeamCache(SAVANT_AGAINST_KEY, teamAbbr, season);
}

export function saveTeamSavantAgainstCache(teamAbbr, season, data) {
  return saveTeamCache(SAVANT_AGAINST_KEY, teamAbbr, season, data);
}

export const TEAM_DATA_CACHE_KEYS = { AGGREGATE_KEY, PLAYERS_KEY, SAVANT_KEY, SAVANT_SUMMARY_KEY, SAVANT_AGAINST_KEY };
