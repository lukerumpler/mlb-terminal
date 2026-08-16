export function buildRosterSavantKey(liveTeamPlayers = {}) {
  const hitterIds = (liveTeamPlayers.hitting || [])
    .slice()
    .sort(
      (a, b) =>
        (Number(b?.stat?.plateAppearances || b?.stat?.pa) || 0) -
        (Number(a?.stat?.plateAppearances || a?.stat?.pa) || 0),
    )
    .slice(0, 12)
    .map(player => player?.id)
    .filter(Boolean);
  const pitcherIds = (liveTeamPlayers.pitching || [])
    .slice()
    .sort(
      (a, b) =>
        (Number(b?.stat?.inningsPitched || b?.stat?.ip) || 0) -
        (Number(a?.stat?.inningsPitched || a?.stat?.ip) || 0),
    )
    .slice(0, 12)
    .map(player => player?.id)
    .filter(Boolean);
  return [...hitterIds, ...pitcherIds].join(',');
}
