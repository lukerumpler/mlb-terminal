export async function getUptimeMonitorDashboard(days = 7) {
  const response = await fetch(`/api/uptime-monitor?days=${days}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Uptime monitor request failed (${response.status})`);
  return response.json();
}
