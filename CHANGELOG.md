# Changelog

All notable changes to **MLB Terminal** are documented in this file.

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
