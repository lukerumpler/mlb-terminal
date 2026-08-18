# Uptime Monitor Feature Branch

This feature branch introduces a durable monitor for the four explicit production targets below. It is isolated from the existing SKIP data-provider and player-identity systems.

| Label | Endpoint |
|---|---|
| MLB API health | `https://mlb-terminal.vercel.app/api/health` |
| MLB Terminal | `https://mlb-terminal.vercel.app/` |
| SKIP platform | `https://skipbasebal-mm6hz9ps.manus.space` |
| lukerumpler.com | `https://lukerumpler.com` |

## Data contract

The `uptime_monitor_checks` table stores every probe’s endpoint, HTTP status code, millisecond latency, explicit pass/fail classification, UTC timestamp, and idempotent run key. Passing means a 2xx or 3xx HTTP response. The `uptime_monitor_schedules` table stores the platform-issued `schedule_cron_task_uid` used to authorize scheduled callbacks.

## Post-merge deployment sequence

Generate and apply the new Drizzle migration after merging this branch. Deploy the application, then create the project-level schedule with the platform CLI:

```bash
manus-heartbeat create \
  --name skip-daily-uptime-monitor \
  --cron "0 0 9 * * *" \
  --path /api/scheduled/daily-uptime-monitor \
  --description "Daily UTC probe of SKIP and MLB Terminal production endpoints"
```

Persist the returned task UID in a durable `uptime_monitor_schedules` row before the first execution. The callback rejects non-cron requests and resolves a schedule only by the trusted task UID. It is idempotent because each endpoint’s daily run key is unique.

## User interface

The `Uptime Monitor` tab is lazy-loaded under the existing **System** section. It provides 7-day and 30-day summaries, current status, a 30-day latency trend, and makes no changes to existing baseball data, telemetry, rate limits, or identity matching.
