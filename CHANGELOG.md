# Changelog

All notable changes to **MLB Terminal** are documented in this file.

## [Unreleased]

### Added

- **MLB warehouse**: resumable game and pitch ingestion from the MLB Stats API into MySQL (`pnpm ingest:mlb`), with migration `0005_mlb_warehouse`, atomic game claims, deadlock-safe writes and a bounded read layer. See `docs/MLB_WAREHOUSE.md`.
- **`GET /api/mlb-warehouse`**: read-only views (`status`, `arsenal`, `pitches`, `game`, `team-games`). Returns a clean 503 `{ available: false }` when the database is not configured or not migrated. No UI calls it yet.
- **`POST /api/scheduled/ingest-mlb`**: cron-only daily warehouse refresh (10-day schedule window, 2-day correction refresh, limit 80). Games that legitimately have zero pitches are reported as known-empty instead of failing the run.
- `/api/mlb-warehouse` rejects impossible dates (`2026-02-30`) and caps pagination depth at a 50,000-row offset, so one request cannot force a huge `OFFSET`.
- Deployment smoke test now checks `/api/mlb-warehouse` and `/api/team-efficiency`; run it against a Vercel preview with `VERCEL_SMOKE_BASE_URL=<preview url> pnpm vitest run server/vercel-deployment-smoke.test.ts`.
- Arsenal responses include `avgPfxX` / `avgPfxZ` so pitch movement can be compared with Savant like for like.
- **Team salary-to-WAR efficiency** panels (Overview and League) backed by `/api/team-efficiency`, a Baseball-Reference fallback for Team WAR, and a Statcast Snapshot panel on Overview.

### Fixed

- Team and division WAR tables no longer come back empty when the aggregate response omits `source`; division rows keep their defensive WAR; a network failure no longer throws `url is not defined`.
- `/api/team-efficiency` is now served on Vercel (it was missing from the catch-all), and a test derives the Vercel route list from `server/api/routes.ts` so the next missed route fails CI.
- README no longer describes `DATABASE_URL` as Postgres; SKIP uses MySQL.

- Team-efficiency requests now accept MLB, FanGraphs and Baseball-Reference spellings (`AZ`, `CHW`, `WSN`, `D-backs`); before, `AZ` and the others matched no WAR row. The aggregate status no longer reports a fully found but cached result as `partial`.

### Security

- `axios` 1.20, `mysql2` 3.23.1, and `dompurify` / `qs` overrides; `pnpm audit --prod` reports no known vulnerabilities (was 17).

### Known gaps

- Blended defensive WAR is `null` when FanGraphs is the only provider.
- The warehouse horizontal break (`breakHorizontal`) differs in sign and magnitude from Savant `pfx_x`; do not plot them together.
- Live provider responses and the production database engine have not been verified.

## [v2026.08.19] — 2026-08-19

This release consolidates the validated SKIP platform update, the canonical synchronization release, and the durable uptime-monitor integration on `main`.

### Added

- A durable **uptime monitor dashboard** with persisted check history, monitored-target configuration, and daily scheduled execution through the managed heartbeat service.
- Database migrations for uptime-monitor schedules and check results, with validation coverage for the protected callback route and monitor logic.
- A GitHub Actions validation workflow that detects uncommitted Drizzle migration drift, runs focused and full tests, type checks, and production builds, and creates or clears a pull-request warning as drift fails or recovers.
- Explicit loading-state handling for Player Profile core data and slower supplemental data, preserving clear provenance when optional sources are still pending.

### Changed

- Integrated the validated SKIP release and canonical synchronization work, including reliability hardening for provider loading, player Savant retries, API routing, accessible analytic-card presentation, and responsive workspace navigation.
- Improved player identity and provider-loading safeguards so the primary profile can render before optional Savant, contract, financial, and boxscore responses settle.
- Strengthened roster-insights fallback behavior for empty, missing, blank, malformed, or non-finite verified team metrics, with transparent limited-context output rather than fabricated analysis.

### Fixed

- Corrected wildcard storage-proxy parameter typing for TypeScript validation.
- Replaced machine-specific test-file paths with repository-relative resolution so local and hosted validation environments exercise the same tests.
- Gated the live production-origin contract test behind an explicit release-time setting, keeping standard pull-request validation deterministic while retaining the production CORS check for configured release runs.

### Verification

- `538` automated tests passed; the separately configured live-production-origin contract test is intentionally skipped in the standard validation path.
- Type checking, the production build, and Drizzle migration-drift generation all completed successfully.

## References

- [Validated release integration](https://github.com/lukerumpler/mlb-terminal/commit/64213f2)
- [Canonical synchronization release](https://github.com/lukerumpler/mlb-terminal/commit/576d127)
- [Uptime monitor integration](https://github.com/lukerumpler/mlb-terminal/commit/767b6a0)
- [Migration-drift validation workflow](https://github.com/lukerumpler/mlb-terminal/commit/bd9f546)
