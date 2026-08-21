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
