export function openTab(tab) {
  if (typeof window === 'undefined' || !tab) return;
  window.dispatchEvent(new CustomEvent('skip-navigate', { detail: { tab } }));
}

export function openPlayerProfile(personOrId, name) {
  if (typeof window === 'undefined') return;
  const detail = typeof personOrId === 'object' && personOrId !== null
    ? { id: personOrId.id || personOrId.mlbId, fullName: personOrId.fullName || personOrId.name }
    : { id: personOrId, fullName: name || 'Player' };
  if (!detail.id) return;
  window.dispatchEvent(new CustomEvent('skip-open-player', { detail }));
}

export function openTeamOverview(abbr) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('skip-open-team', { detail: { abbr } }));
}
