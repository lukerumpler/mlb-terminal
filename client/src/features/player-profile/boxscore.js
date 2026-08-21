export function formatBoxscoreRate(value, digits = 3) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits);
}

export function filterAndSortBoxscoreGames(games, { date = '', team = '', sort = 'date-desc' } = {}) {
  const normalizedTeam = String(team || '').trim().toLowerCase();
  return (Array.isArray(games) ? games : [])
    .filter(game => {
      const gameDate = String(game?.date || '').slice(0, 10);
      const opponent = String(game?.opponent || '').toLowerCase();
      return (!date || gameDate === date) && (!normalizedTeam || opponent.includes(normalizedTeam));
    })
    .sort((a, b) => {
      const dateA = String(a?.date || '');
      const dateB = String(b?.date || '');
      const teamA = String(a?.opponent || '').toLowerCase();
      const teamB = String(b?.opponent || '').toLowerCase();
      if (sort === 'team-asc') return teamA.localeCompare(teamB);
      if (sort === 'team-desc') return teamB.localeCompare(teamA);
      return sort === 'date-asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
}

export const BOXSCORE_PAGE_SIZE = 5;

export function boxscorePresetStorageKey(playerId) {
  return `skip-boxscore-filter-presets:${playerId || 'unknown'}`;
}

export function readBoxscoreFilterPresets(playerId) {
  if (!playerId || typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(boxscorePresetStorageKey(playerId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(preset => preset && preset.name) : [];
  } catch { return []; }
}

export function saveBoxscoreFilterPresets(playerId, presets) {
  if (!playerId || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(boxscorePresetStorageKey(playerId), JSON.stringify(presets)); } catch { /* best effort */ }
}

export function buildRecentGameSeries(boxscoreSplits, metric = 'ops', limit = 10) {
  const games = Array.isArray(boxscoreSplits?.recentGames) ? boxscoreSplits.recentGames : [];
  return games.slice(0, limit).map(game => {
    const raw = game?.batting?.[metric];
    return raw == null || raw === '' ? null : Number(raw);
  }).filter(Number.isFinite).reverse();
}

export function buildRecentPerformanceSeries(boxscoreSplits, { metric = 'ops', group = 'batting', limit = 10 } = {}) {
  const games = Array.isArray(boxscoreSplits?.recentGames) ? boxscoreSplits.recentGames : [];
  return games.slice(0, limit).map((game, index) => {
    const stat = game?.[group] || {};
    const raw = stat?.[metric];
    const value = raw == null || raw === '' ? null : Number(raw);
    if (!Number.isFinite(value)) return null;
    const date = String(game?.date || '').slice(0, 10);
    return {
      game: index + 1,
      label: date ? date.slice(5) : `G${index + 1}`,
      opponent: game?.opponent || game?.team?.name || 'Opponent unavailable',
      value,
    };
  }).filter(Boolean).reverse().map((point, index) => ({ ...point, game: index + 1 }));
}

export function summarizeRecentPerformance(series = [], { lowerIsBetter = false } = {}) {
  const values = (Array.isArray(series) ? series : []).map(point => Number(point?.value)).filter(Number.isFinite);
  if (values.length < 3) return { status:'unavailable', label:'Not enough verified games', delta:null, average:null };
  const window = Math.max(1, Math.floor(values.length / 3));
  const early = values.slice(0, window).reduce((sum, value) => sum + value, 0) / window;
  const recent = values.slice(-window).reduce((sum, value) => sum + value, 0) / window;
  const delta = recent - early;
  const improving = lowerIsBetter ? delta <= 0 : delta >= 0;
  return { status:'verified', label:improving ? 'Hot streak' : 'Cooling trend', delta, average:values.reduce((sum, value) => sum + value, 0) / values.length };
}
