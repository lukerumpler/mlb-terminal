const AGGREGATE_KEY = 'skip-team-aggregate-cache-v1';
const PLAYERS_KEY = 'skip-team-player-cache-v1';

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

export const TEAM_DATA_CACHE_KEYS = { AGGREGATE_KEY, PLAYERS_KEY };
