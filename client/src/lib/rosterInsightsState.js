export function shouldResetRosterInsightsState(previousTeam, nextTeam) {
  return previousTeam !== nextTeam;
}

export default shouldResetRosterInsightsState;

