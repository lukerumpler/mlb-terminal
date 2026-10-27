# Testing & Validation Guide

SKIP maintains a rigorous test suite using Vitest and React Testing Library.

## Running the full suite

```bash
pnpm test
```

All test files reside under `server/` and `test/`. When modifying provider proxies, backend routers, or UI metrics, ensure existing tests pass and add unit or interaction regressions covering failure and recovery states.

## Team roster and logo checks

Run the focused UI regression tests after changing team-logo mapping, image fallbacks, or organization roster rendering:

```bash
pnpm exec vitest run \
  test/team-logo.test.jsx \
  test/team-badge.test.jsx \
  test/organization-roster-directory.test.jsx \
  test/prospects.organization-directory.test.jsx
```

To check current upstream availability for every configured MLB organization, run:

```bash
pnpm audit:organization-rosters
```

This audit calls the live MLB Stats API `fullRoster` endpoint for all 30 organizations and writes `artifacts/organization-roster-api-audit.json`. It checks for a successful, nonempty response; player counts vary over time. Compare each organization’s `rosterRecords` and `uniquePlayerIds` values to spot repeated IDs in the upstream response. The audit verifies API availability and counts, not the client rendering, prospect ranking, or MLB Pipeline Top 30 membership.

The Organization Player Directory is the full-organization roster view; Overview’s Team Leaders panel is a statistics-leader view, not a complete roster. In Settings → Performance & Data Use, Low Data Mode hides remote team logos and shows text fallbacks, so turn it off when visually verifying logo images. Logo-load failures also render accessible text fallbacks.
