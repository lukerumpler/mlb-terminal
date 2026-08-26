# Daily Morning Refresh — 2026-08-26

## Retained schedule

The project uses the owner-managed Heartbeat job named `daily-savant-morning-refresh`. It runs at `0 0 9 * * *` in UTC every day and posts to `/api/scheduled/refresh-savant`. This is 3:00 AM Mountain Daylight Time during the summer and 2:00 AM Mountain Standard Time during the winter.

The callback accepts only authenticated scheduled calls. It invokes the existing `warmSavantCache("2026")` operation, which is already covered by daily-cache request limits. The refresh therefore does not bypass the once-per-UTC-day provider policy or fabricate any player, team, or Statcast value.

## Verification

The replacement job is enabled and has a future run at 09:00 UTC on 2026-08-27. A direct unauthenticated POST to the deployed callback returned `403` rather than `404`, proving that the deployed route exists and is protected before it can contact a provider. The scheduled callback now also has focused unit coverage for non-cron rejection, a successful one-call warm-up, and a retryable provider failure.

Two older scheduler attempts returned `404` before the current deployment was confirmed. The stale job was paused before a fresh job was created, then deleted after the new job was confirmed enabled, so there is exactly one active daily Savant warm-up. The next scheduled run will use the currently deployed route; its run history is available in the project Schedules management view, where it can be paused, resumed, or inspected.
