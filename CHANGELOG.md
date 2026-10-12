# Changelog

All notable changes to **MLB Terminal** are documented in this file.

## [Unreleased]

### Added

- **Crowd-consensus team WAR** (`server/war-consensus.js`, mirrored in `client/src/lib/warConsensus.js`). Every provider's number is kept as one independent estimate; the headline `war.total` is still their mean, and `war.consensus` now adds each provider's value, the median, min/max, the spread and an agreement grade (`high` within 3 WAR, `moderate` within 6, else `low`; `single-source` and `unavailable` are explicit). `efficiency.range` gives WAR/$100M and $/WAR at the lowest and highest provider WAR, and a `low` grade adds a warning. Pitching WAR is blended across providers; position-player (batting) WAR only when two providers publish a comparable column. The Overview panel and comparison tooltip show agreement, the range and per-component providers. Adding a provider means passing one more source to `buildWarConsensus`.
- **MLB warehouse**: resumable game and pitch ingestion from the MLB Stats API into MySQL (`pnpm ingest:mlb`), with migration `0005_mlb_warehouse`, atomic game claims, deadlock-safe writes and a bounded read layer. See `docs/MLB_WAREHOUSE.md`.
- **`GET /api/mlb-warehouse`**: read-only views (`status`, `arsenal`, `pitches`, `game`, `team-games`). Returns a clean 503 `{ available: false }` when the database is not configured or not migrated. No UI calls it yet.
- **`POST /api/scheduled/ingest-mlb`**: cron-only daily warehouse refresh (10-day schedule window, 2-day correction refresh, limit 80). Games that legitimately have zero pitches are reported as known-empty instead of failing the run.
- `/api/mlb-warehouse` rejects impossible dates (`2026-02-30`) and caps pagination depth at a 50,000-row offset, so one request cannot force a huge `OFFSET`.
- Deployment smoke test now checks `/api/mlb-warehouse` and `/api/team-efficiency`; run it against a Vercel preview with `VERCEL_SMOKE_BASE_URL=<preview url> pnpm vitest run server/vercel-deployment-smoke.test.ts`.
- Arsenal responses include `avgPfxX` / `avgPfxZ` (the feed's `pfx_x` / `pfx_z`, in inches; Savant's per-pitch CSV documents feet, so convert before comparing, and the sign perspective is still unconfirmed).
- **Team salary-to-WAR efficiency** panels (Overview and League) backed by `/api/team-efficiency`, a Baseball-Reference fallback for Team WAR, and a Statcast Snapshot panel on Overview.

### Security and reliability

- Baseline security headers on every response (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS over HTTPS in production) plus a **Report-Only** Content-Security-Policy (`CSP_MODE=enforce` to enforce). Framing is deliberately not restricted until the platform preview is confirmed not to need it. `vercel.json` sends the same static headers.
- Graceful shutdown: SIGTERM/SIGINT now drain in-flight requests before exit (forced after `SHUTDOWN_TIMEOUT_MS`).
- Rate limiting is configurable (`RATE_LIMIT_*`), can trust a known number of proxy hops (`RATE_LIMIT_TRUSTED_PROXY_HOPS`), and the two paid-LLM routes (`/api/comparison-summary`, `/api/natural-search`) are now throttled (8 per minute per client; cache hits are free).

### Security hardening (voice notes and uploads)

- `storage.upload` and `voice.transcribe` were public, unthrottled and unrestricted: anyone could upload any file type up to 50 MB with the platform's storage key, and `voice.transcribe` made the server fetch any URL it was given (a server-side request forgery risk). Upload now accepts only short audio (`webm`, `ogg`, `mp4`, `mpeg`, `wav`, 16 MB decoded) with a safe file name, 10 per minute per client. Transcription accepts only the `/manus-storage/<key>` path the upload returns, resolves it to a signed URL, checks the declared size before downloading, and shares the paid-LLM rate limit.
- Request bodies are capped at 2 MB everywhere except `/api/trpc` (25 MB, for base64 voice notes); it was 50 MB on every route.

### Fixed

- Baseball-Reference `oWAR` (offence only) was mapped to batting WAR, but FanGraphs batting WAR is position-player WAR including defense, so the two were not comparable. `oWAR` is now kept separately as `offensiveWAR` and never averaged with FanGraphs batting WAR; batting WAR is read only from a position-player column.
- With FanGraphs blocked, division and league rows passed the Baseball-Reference row as the FanGraphs side, labelling a bWAR value "fWAR" and claiming a two-source blend. They now report `fWAR: null` and a single-source grade.
- Durable aggregate-WAR cache key bumped to `aggregate-blended-v3` because parsed Baseball-Reference rows gained fields.
- **Baseball-Reference player WAR / wRC+ fallback** (`/api/player-advanced`): negative values no longer break the match (a player with negative career WAR used to come back unavailable); the wRC+ pattern was double-escaped and never matched anything, so that fallback has never returned a value until now; labels match whole words only; and the player-page summary, which only shows the most recent season, is no longer returned under a different requested season (it was labeled with whatever year was asked for). The player id is still returned for any season.
- **Team-efficiency panel**: the headline WAR is labeled "Blended WAR" only when both providers contributed (otherwise `fWAR` / `bWAR`); available WAR (fWAR, bWAR, offensive/pitching) is shown even when payroll is missing and no efficiency ratio can be computed; a missing offensive or pitching consensus reads "unavailable" instead of disappearing; a zero-or-negative total WAR now carries a warning explaining why there is no salary-per-WAR ratio.
- `blendTeamWarRow` (client) returned `NaN` instead of `null` when neither provider's value parsed; callers filter with `!= null`, so a `NaN` row would have reached the division average.
- **Aggregate team WAR loads faster on a cold cache.** The Baseball-Reference request now starts in parallel with the FanGraphs requests instead of after them, so latency is the longer of the two rather than their sum (up to ~10 s saved when a provider is slow). Still exactly one request per provider URL per refresh, and the once-per-UTC-day provider gate is unchanged; an early Baseball-Reference failure can no longer surface as an unhandled rejection.
- **Provider HTML parsers are linear on garbled or truncated pages.** The tag stripper `/<[^>]+>/g` and the `<table|tr|td ...>...</...>` / `<a ...>...</a>` patterns rescanned the rest of the document once per unclosed opener, so e.g. 100,000 `<` characters with no `>` took ~30 s of CPU (200,000 took ~2 min) and 100,000 unclosed `<td` took ~21 s. Openers no longer run across another tag and only text up to the last closing tag is searched. Output for well-formed pages is unchanged; the same inputs now take milliseconds. Applied to the WAR parsers (`fangraphs-models.js`, `player-advanced.js`) and the tag stripper in `contract.js`, `team-financials.js`, `playoffstatus-odds.js`, `player-identity.js`, `feed.js` and `news.js`; a test fails if the old pattern reappears in `server/api`.
- The player-summary parser cleaned the whole page three times (once, then again per label); it now cleans once (about 2.6x faster on a 1.3 MB page).
- **Spotrac contract lookups never returned a match.** `parseSpotracTable` assigned `bestCandidate` without declaring it, so the first matching row threw a `ReferenceError` (module code is strict); the handler's `try/catch` swallowed it, so the documented primary contract source silently fell through to Baseball-Reference / MLB data on every request. Declared; regression test added.
- **Baseball-Reference player WAR/wRC+ fallback was never requested from the UI.** `getBaseballReferenceAdvancedSafe` called an undefined `providerJson` (the helper is `fetchProviderJson`); the error was swallowed and the result was always "unavailable", so the server-side fixes above could not reach users.
- **Standings CSV export threw on click** (`formatWinPct` was passed but never imported; the table uses `fmtWinPct`), and **the Overview PDF export failed at its last line** (`SEASON` is imported there as `CURRENT_SEASON`).
- New guard `test/no-undeclared-identifiers.test.js` scans `client/src`, `server` and `api` with Babel scope analysis and fails on any identifier that is read but never declared, which is how all four of the above shipped. This promotes `@babel/parser`, `@babel/traverse` (7.28.4) and `globals` (15.15.0) from transitive to explicit devDependencies at the versions already locked.
- **All remaining scrapers are linear on garbled or truncated pages**: Spotrac / Baseball-Reference contracts, Spotrac payroll and tax, PlayoffStatus odds and Baseball-Reference identity previously took 0.7-12 s at only 20-60k unclosed tags. The guard now lives in one module, `server/api/html-scan.js`, shared with the WAR parsers (previously a local copy in `fangraphs-models.js`). A differential fuzz against the old implementations (33,000 generated pages across 11 parsers) produced identical output.
- Team and division WAR tables no longer come back empty when the aggregate response omits `source`; division rows keep their defensive WAR; a network failure no longer throws `url is not defined`.
- `/api/team-efficiency` is now served on Vercel (it was missing from the catch-all), and a test derives the Vercel route list from `server/api/routes.ts` so the next missed route fails CI.
- README no longer describes `DATABASE_URL` as Postgres; SKIP uses MySQL.

- **Voice-note transcription was almost certainly broken**: `storage.upload` returns a relative `/manus-storage/<key>` path, and `voice.transcribe` passed it straight to a server-side `fetch`, which rejects relative URLs (`Failed to parse URL`). It now resolves the path to a signed URL first.
- **The voice recorder could trap the user**: a failed upload left the full-screen dialog with both buttons disabled until a page reload, because the error was thrown inside an unawaited callback. Failures are now caught and reported, and the controls come back. Closing the dialog mid-recording releases the microphone, empty recordings are rejected, and Safari's `audio/mp4` is no longer labelled `webm`.
- Oversized or malformed request bodies returned **500** (with a stack trace in the logs) instead of 413 / 400.
- The rate limiter's memory guard cleared every client's counters when it reached 5,000 keys, un-throttling heavy callers; it now evicts expired entries, then the least recently used.
- `/api/feed` no longer returns a 500 for the whole feed when one item has an unparseable date.
- The comparison fallback no longer talks about "bat speed" for pitchers.
- Season defaults (`DEFAULT_SEASON = 2026` in three handlers, a fixed 2024-2030 range) now follow the calendar via `server/season.ts`.
- The About page no longer renders a dead `#` LinkedIn link; set `LINKEDIN_URL` / `HEADSHOT_SRC` at the top of `AboutPage.jsx` to enable the link and photo.
- Team-efficiency requests now accept MLB, FanGraphs and Baseball-Reference spellings (`AZ`, `CHW`, `WSN`, `D-backs`); before, `AZ` and the others matched no WAR row. The aggregate status no longer reports a fully found but cached result as `partial`.
- **WAR display**: a missing WAR value (null or blank) is shown as `—` instead of `0.0`. This affected the team-efficiency overview (defensive blend, the offensive/pitching split) and the comparison table (total WAR and WAR/$100M for source-gap teams). Real zeros and negative values are unchanged, and `-0.0` prints as `0.0`.
- **WAR parsing**: negative WAR printed with a Unicode minus, en/em dash or parentheses keeps its sign (it was read as positive); league/total rows are skipped; Baseball-Reference columns are read by header, including grouped `colspan` headers; the offensive/pitching split comes from one provider (`war.splitProvider`).
- **Seasons**: the client `SEASON` and the `player-advanced` default follow the calendar (January belongs to the prior season). The `warmSavantCache`, `buildCbtHistorySeasons`, `buildHistoricalTaxTrendRows` and Players-page fallback defaults no longer hardcode 2026.

### Security (dependencies)

- `axios` 1.20, `mysql2` 3.23.1, and `dompurify` / `qs` overrides; `pnpm audit --prod` reports no known vulnerabilities (was 17).

### Housekeeping

- Root-level audit notes, source write-ups and task lists moved to `docs/archive/`; design notes to `docs/design/`; roadmap docs to `docs/`. Unused `ComponentShowcase.tsx` and `dev-mock-data.js` removed.
- New CI: `quality.yml` (`pnpm lint` + typecheck on every PR) and `warehouse-db-tests.yml` (MariaDB). `dependabot.yml` added. `pnpm lint` now covers the new code.

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
