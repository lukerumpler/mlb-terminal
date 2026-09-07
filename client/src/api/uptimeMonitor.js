export async function getUptimeMonitorDashboard(days = 7) {
  let response;
  try {
    response = await fetch(`/api/uptime-monitor?days=${days}`, { headers: { Accept: 'application/json' } });
  } catch (transportError) {
    // Same defensive fix as mlb()/ncaa()/fetchProviderJson() (§29 audit): a
    // raw fetch() failure (offline, DNS, CORS) has a browser-authored
    // .message like "Failed to fetch", and UptimeMonitorPage renders
    // error.message directly into its "Monitor unavailable" panel with no
    // fallback text of its own.
    throw new Error('Uptime monitor request failed — could not reach the server', { cause: transportError });
  }
  if (!response.ok) throw new Error(`Uptime monitor request failed (${response.status})`);
  try {
    return await response.json();
  } catch (parseError) {
    throw new Error('Uptime monitor returned an unreadable response', { cause: parseError });
  }
}
