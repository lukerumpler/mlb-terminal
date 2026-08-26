import { selectTopSavantRosterRows } from './rosterSavantSelection.js';

export function buildRosterSavantKey(liveTeamPlayers = {}) {
  const hitterIds = selectTopSavantRosterRows(liveTeamPlayers.hitting, 'plateAppearances', 'pa')
    .map(player => player?.id)
    .filter(Boolean);
  const pitcherIds = selectTopSavantRosterRows(liveTeamPlayers.pitching, 'inningsPitched', 'ip')
    .map(player => player?.id)
    .filter(Boolean);
  return [...hitterIds, ...pitcherIds].join(',');
}
