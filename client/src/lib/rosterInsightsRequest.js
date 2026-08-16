export function shouldStartRosterInsightsRequest({
  hasLiveData,
  hasInsights,
  inFlightKey,
  requestKey,
  hitterCount,
  pitcherCount,
}) {
  if (!hasLiveData || hasInsights) return false;
  if (inFlightKey === requestKey) return false;
  return hitterCount > 0 || pitcherCount > 0;
}
