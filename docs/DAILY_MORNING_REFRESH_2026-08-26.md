# Daily Morning Refresh — 2026-08-26

## Retained schedule

The project retains the existing owner-managed Heartbeat job named `nightly-savant-refresh`. It runs at `0 0 9 * * *` in UTC every day and posts to `/api/scheduled/refresh-savant`. This is 3:00 AM Mountain Daylight Time during the summer and 2:00 AM Mountain Standard Time during the winter.

The callback accepts only authenticated scheduled calls. It invokes the existing `warmSavantCache("2026")` operation, which is already covered by daily-cache request limits. The refresh therefore does not bypass the once-per-UTC-day provider policy or fabricate any player, team, or Statcast value.

## Verification

The job is enabled and has a future run at 09:00 UTC. A direct unauthenticated POST to the deployed callback returned `403` rather than `404`, proving that the deployed route exists and is protected before it can contact a provider. The scheduled callback now also has focused unit coverage for non-cron rejection, a successful one-call warm-up, and a retryable provider failure.

Two older scheduler attempts returned `404` before the current deployment was confirmed. No duplicate job was created. The next scheduled run will use the currently deployed route; its run history is available in the project Schedules management view, where it can be paused, resumed, or inspected.
