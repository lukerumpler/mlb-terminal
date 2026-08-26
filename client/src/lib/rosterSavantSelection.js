function rosterWorkload(player, primaryKey, fallbackKey) {
  return Number(player?.stat?.[primaryKey] ?? player?.stat?.[fallbackKey]) || 0;
}

export function selectTopSavantRosterRows(rows = [], primaryKey, fallbackKey, limit = 12) {
  return (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((left, right) => rosterWorkload(right, primaryKey, fallbackKey) - rosterWorkload(left, primaryKey, fallbackKey))
    .slice(0, limit);
}

export function selectTopSavantRosterPlayers(liveTeamPlayers = {}, limit = 12) {
  return {
    hitters: selectTopSavantRosterRows(liveTeamPlayers.hitting, 'plateAppearances', 'pa', limit),
    pitchers: selectTopSavantRosterRows(liveTeamPlayers.pitching, 'inningsPitched', 'ip', limit),
  };
}
