# MLB warehouse (game + pitch ingestion)

SKIP ingests completed MLB games from the MLB Stats API live feed
(`/api/v1.1/game/{gamePk}/feed/live`) into its own database, so player and pitch
pages can query stored data instead of assembling it in the browser.
Architecture follows the ideas in `mcbarlowe/mlb` (game-first ingestion, pitch-level
facts, per-game resumable state), reimplemented in SKIP's own stack
(TypeScript + Drizzle + **MySQL**). Nothing is imported from that repo at runtime.

## Tables (`drizzle/0005_mlb_warehouse.sql`)

| Table | Holds |
| --- | --- |
| `mlb_games` | one row per `gamePk`: teams, venue, weather, final score, `parser_version` |
| `mlb_players` | MLB person id, name, position, bats/throws (id is identity, never name) |
| `mlb_pitches` | one row per pitch; PK `(game_pk, at_bat_index, event_index)` |
| `mlb_ingestion_state` | per-game `pending/processing/complete/failed`, attempts, last error |

Rules baked in:

- **Source only.** No SKIP grades live here; derived metrics belong in separate, versioned tables.
- **Missing stays missing.** Absent tracking values are `NULL`, never `0`.
- **Two pitch types kept.** `source_pitch_type_code/name` is what MLB sent;
  `skip_pitch_type` is SKIP's taxonomy (`server/mlb-warehouse/pitchTaxonomy.ts`).
- **Count before/after** each pitch is stored (`balls_before` etc.), enabling "after two strikes" queries.

## Running it

```bash
pnpm db:push                                   # apply migrations (needs DATABASE_URL)
pnpm ingest:mlb --season 2026 --status         # queue status only
pnpm ingest:mlb --season 2026                  # discover + ingest up to 200 games
pnpm ingest:mlb --season 2026 --limit 1000     # bigger batch
pnpm ingest:mlb --season 2026 --refresh-days 3 # also re-ingest last 3 days (MLB corrections)
pnpm ingest:mlb --season 2026 --skip-discovery # only work the existing queue
pnpm ingest:mlb --season 2026 --requeue-failed # give games that exhausted --max-attempts a fresh budget
```

Exit code is `1` if any game failed **or any schedule window could not be read** (see
`discoveryErrors` in the report), `2` on config/DB errors. Re-running is always safe:
completed games are skipped, failed games retry up to `--max-attempts` (default 5), games
stuck in `processing` for 30+ minutes are recovered, and re-ingesting a game *replaces*
its pitches inside one transaction (no duplicates, no stale rows after a correction).

## Failure handling

- **Transient MLB API errors** (network errors, timeouts, 429, 5xx, truncated bodies) are
  retried inside the fetcher with jittered backoff and `Retry-After` support, so a blip does not
  use up one of a game's `--max-attempts`. 4xx other than 429 are not retried.
- **One bad schedule month** is recorded in `discoveryErrors` and skipped; the other months and
  the existing queue are still processed, and the missing month is rediscovered next run.
- **Game claims are atomic.** `markProcessing` is a single conditional `UPDATE` that returns
  whether _this_ worker won the game (pending, failed under `--max-attempts`, or `processing` but
  older than 30 minutes). Workers that lose the race skip the game entirely: no fetch, no write, no
  failure recorded. The run report counts them in `skipped`, separately from `attempted`/`failed`.
- **Player data only fills in, never erases.** A feed that omits `bats`, `throws`, `birthDate`,
  names or position leaves the stored value alone; it is only replaced by a non-null value.
- **The schedule owns season and date.** Discovery updates `season`/`officialDate` on the state row
  (so a rescheduled game follows `--refresh-days` correctly) but never resets status or attempts.
  `saveGame` does not write those two columns, so the feed and the schedule cannot fight.
- **CLI is strict.** Unknown flags, value flags with no value, and seasons outside 1876..next year
  exit 2 instead of silently running with defaults.
- **Read API:** `server/mlb-warehouse/queries.ts` (`createMlbWarehouseQueries(db)`) holds the bounded,
  paginated game/pitch/player/team/ingestion-status queries for API routes and the dashboard.
- **Concurrent writers** lock `mlb_players` rows in ascending id order and retry a transaction
  that InnoDB rolls back as a deadlock or lock-wait timeout (`withLockRetry`). Without the
  ordering, parallel games sharing players deadlock under `--concurrency` > 1.
- **Retry budget** (`attempt_count`) means attempts since the last success; it resets on
  success and on requeue, so frequently refreshed games never run out of retries.

## Testing

```bash
pnpm test server/mlb-warehouse   # unit tests; in-memory store, recorded GUMBO fixture
```

`store.integration.test.ts` runs the real Drizzle store against a real MySQL/MariaDB server
(upserts, transactions, concurrent writes). It is skipped unless `MLB_TEST_DATABASE_URL` is set,
and it **truncates the `mlb_*` tables**, so use a scratch database with migration 0005 applied:

```bash
MLB_TEST_DATABASE_URL=mysql://user:pass@127.0.0.1:3306/scratch pnpm test server/mlb-warehouse/store.integration
```

`server/api/mlb-warehouse.integration.test.ts` exercises the HTTP handler against the real
database (handler -> `getDb` -> queries -> SQL). It does not truncate, but the other
integration files do, so run DB-gated suites with `--no-file-parallelism`.

## Scheduled ingest: `POST /api/scheduled/ingest-mlb`

Cron-only (same `isCron` check as the other `/api/scheduled/*` routes). An authenticated non-cron
caller gets 403; an unauthenticated one gets the same 500 `Invalid session cookie` as
`refresh-savant` and `cleanup-cache-telemetry` (existing convention, checked on all three).
Create an owner-managed Heartbeat job that POSTs to it once a day. It runs a bounded,
windowed pass for the current MLB season (January still counts as the previous season):

| Setting | Value | Why |
|---|---|---|
| `discoverSinceDays` | 10 | ask the schedule for the last 10 days (1-2 requests), not all ten months |
| `refreshRecentDays` | 2 | re-ingest recent finals to absorb late MLB corrections |
| `limit` | 80 | ~15 games/day x 2 refresh days + new games must stay under this or a backlog builds |
| `concurrency` | 2 | polite to the MLB API |

Responses: 200 with a run report; 503 `{ ok: false, reason: "database-not-configured" }`
with no database; 500 only if the run itself throws (so Heartbeat retries). `ok` is `false`
only for failures someone can act on (real feed errors or schedule-window errors). A final game
that has zero pitches usually never will (failed games are retried on up to 5 runs, so a feed that
is merely late can still heal), so it is listed under `knownEmptyGames` and does not flip `ok`. Run `pnpm ingest:mlb --season YYYY` once first to backfill; the heartbeat
timeout is unknown, which is why batches are small and resumable.

## Read API: `GET /api/mlb-warehouse`

Read-only, rate-limited, CORS-enabled. Pick a `view`:

| `view` | Required | Optional | Returns |
|---|---|---|---|
| `status` | `season` | | ingestion counts (pending / processing / complete / failed) |
| `arsenal` | `player`, `season` | | per-pitch-type counts and average velocity, spin, IVB, HB, pfx_x, pfx_z |
| `pitches` | `player`, `season` | `from`, `to` (YYYY-MM-DD), `page`, `pageSize` (max 250) | paged raw pitches, newest first |
| `game` | `game` | `page`, `pageSize` | the game row plus paged pitches (404 if unknown) |
| `team-games` | `team`, `season` | `limit` (max 250) | the team's games, newest first |

Paging is bounded: `page` x `pageSize` may not exceed an offset of 50,000 rows (a pitcher-season
is a few thousand pitches, a game about 300); deeper requests get a 400 telling the caller to narrow
with `from`/`to`. `from`/`to` must be real calendar dates (`2026-02-30` is rejected).

Caching: responses are `public` with `s-maxage` of 60 s (`status`) or 300 s (everything else), so a
CDN may serve them; a game ingested or re-ingested inside that window appears when it expires.
Errors and 404s are `no-store`.

Every response carries `available` and `source`. Bad input is a 400 before any database work.
If `DATABASE_URL` is missing, the driver fails to load, or the tables are absent (migration
0005 not applied) the route answers **503** with `{ "available": false, "reason": ... }`
(`database-not-configured`, `warehouse-init-failed`, `warehouse-query-failed`) rather than a
500, so the UI can hide the panel. `arsenal` and `pitches` include `fieldNotes`: warehouse
`avgHB` (MLB `breakHorizontal`) is **not** Savant's `pfx_x` (different sign and magnitude), so
do not plot them together. If you need a side-by-side, use `avgPfxX` / `avgPfxZ` (the feed's own `pfx_x` / `pfx_z`),
but note the units: the MLB feed reports them in **inches** (the recorded fixture's `pfxX` is
2.83), while Savant's per-pitch CSV documents `pfx_x` / `pfx_z` in **feet**, so multiply Savant
by 12 first. Their sign perspective is still unconfirmed against Savant for a single pitcher.

The route must stay registered in both `server/api/routes.ts` and `api/[...path].ts`; a test
fails if one is missing.

## Validation

Before writing, each game is checked (`validate.ts`). Errors (zero pitches for a final game,
duplicate pitch identity, mismatched game id) mark the game `failed` with the reason.
Warnings (implausible velocity, unknown players, missing score) are returned in the run
report but the data is still stored.

## Not built yet

Player-season / arsenal aggregate tables, UI wiring (the read API above exists but no component calls it), Savant/Statcast
enrichment, provider-id map, scheduled (cron) invocation, and historical seasons
beyond whatever you choose to backfill.

## Measured performance (local MariaDB 10.11, synthetic data - not production)

- Reads at 800k pitches / 25k games: every `queries.ts` call completed in 7 ms or less (game,
  game pitches, player arsenal, player pitches incl. deep pages and date ranges, team games,
  ingestion status), using the existing indexes. No extra indexes were needed.
- Writes: ~320-pitch games stored at 17-19 games/s regardless of `--concurrency` 1/3/6, i.e. a
  2,430-game season is roughly 2.5 minutes of database time. The MLB API, not the warehouse, is
  the bottleneck, so the default `--concurrency 3` is right. Numbers will differ on a hosted
  database with network latency; re-measure there before tuning.
