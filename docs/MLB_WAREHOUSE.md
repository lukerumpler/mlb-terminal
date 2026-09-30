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

## Validation

Before writing, each game is checked (`validate.ts`). Errors (zero pitches for a final game,
duplicate pitch identity, mismatched game id) mark the game `failed` with the reason.
Warnings (implausible velocity, unknown players, missing score) are returned in the run
report but the data is still stored.

## Not built yet

Player-season / arsenal aggregate tables, API routes and UI wiring, Savant/Statcast
enrichment, provider-id map, scheduled (cron) invocation, and historical seasons
beyond whatever you choose to backfill.
