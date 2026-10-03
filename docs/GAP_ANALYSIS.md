# SKIP gap analysis: what stands between this repo and "perfect"

Date: 2026-10-03. Scope: `lukerumpler/mlb-terminal` at `main` (`59d6caf`) plus the combined branch (`combined2`).
Method: read the repo, branches, workflows and docs; measured what could be measured locally. Every item
says how it was found. "Unverified" means I could not check it from here.

## What I could not see
- GitHub issues (the unauthenticated API was rate-limited), branch-protection rules, Actions run history, repository secrets.
- The production site, the Manus deployment, its database engine, its Heartbeat schedules, and its proxy headers.
- Live MLB, Savant, FanGraphs, Baseball-Reference and Spotrac responses (blocked from my sandbox).

## P0: visible to users or risky in production

| # | Gap | Evidence | Action |
|---|---|---|---|
| 1 | **About page ships placeholders.** The LinkedIn link is `href="#"` and the "headshot" is an "LR" box. | `client/src/pages/AboutPage.jsx` lines 108-125, two `TODO`s | Needs your real profile URL and photo. Only you can supply these. |
| 2 | **No security headers.** No CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy` anywhere. | `grep` of `server/app.ts`, `server/_core/*`, `vercel.json` finds none | The salary PR notes an unrelated hardening pass (headers, configurable rate limiting, graceful shutdown, rewritten `docs/deployment.md`) was left out of its diff. Land it as its own PR; if you have that snapshot, upload it. |
| 3 | **No graceful shutdown.** No `SIGTERM`/`SIGINT` handler on a host that autoscales. | `server/_core/index.ts` | Scale-in can drop in-flight requests and ingestion batches. Part of the same hardening pass. |
| 4 | **Heartbeat jobs are not confirmed.** `todo-pybhwqcf.md` still has two open items about verifying the 09:00 UTC schedule; the new `POST /api/scheduled/ingest-mlb` has no job at all. | `todo-pybhwqcf.md` lines 79-80 | Create and verify the Heartbeat call, then check one run's JSON report. |
| 5 | **Rate limiting is per instance and trusts `x-forwarded-for`.** In-memory map, keyed on the first forwarded address. | `server/api/_shared.js` `isRateLimited` | Under autoscaling the real limit is N times higher. If the edge appends rather than overwrites that header, a client can spoof it. Unverified: depends on how Manus sets it. |
| 6 | **Vercel previews likely have no database.** An Aug 17 audit note says `DATABASE_URL` was absent on Vercel. | `docs/optimization-baseline-2026-08-17.md` (quoted in the warehouse plan) | The warehouse routes now degrade to a clean 503, but previews will never show warehouse data until it is set. |

## P1: quality gates

| # | Gap | Evidence | Action |
|---|---|---|---|
| 7 | **DB tests never ran in CI.** Three suites are skipped without `MLB_TEST_DATABASE_URL` and no workflow starts a database, so the deadlock and SQL tests are never exercised. | `describe.skip` gate in 3 files; 4 workflows, none with a service | **Done:** `.github/workflows/warehouse-db-tests.yml` (MariaDB 10.11, migrate, drift check, suites). Steps replayed locally: 90 tests, 0 skipped. Not yet run on GitHub. |
| 8 | **"Lint" is Prettier on 10 files.** No ESLint, no a11y lint, no CI step for `pnpm lint` or `release:gate`. | `package.json` scripts; `uptime-validation.yml` runs check/test/build only | Add ESLint (with `jsx-a11y`) scoped to changed files first; run `pnpm lint` in CI. |
| 9 | **Most source is not type-checked.** About 31k lines of JS/JSX versus 13k of TS/TSX (roughly 70% untyped). `tsconfig` has no `allowJs`/`checkJs` and excludes `*.test.ts`. | line counts by extension | Start with `// @ts-check` on `server/api/*.js`, the data-facing layer. |
| 10 | **Coverage is unmeasured.** Locally, `server/api` + `server/mlb-warehouse`: 66.6% lines (store/queries look low only because DB suites skip). Handlers at 0%: `feed.js`, `comparison-summary.js`. Low: `player-advanced.js` 19%, `player-identity.js` 28%, `contract.js` 43%, `uptime-monitor.ts` 44%. | `vitest --coverage` | Add a coverage report to CI and a floor for new code. Write tests for the two 0% handlers first. |
| 11 | **Untested UI.** No test references: `FollowListPage`, `OrganizationRosterDirectory`, `PlayerNewsPanel`, `RequestDiagnosticsPanel`, `TeamBadge`, `TeamNewsPanel`. | name search across `test/` | Smoke-render tests for each. |
| 12 | **One e2e test, not in CI.** `test:e2e` runs one file; the README called it "Playwright tests" (**fixed**). | `test/published-overview.e2e.test.js` | Run it in the Vercel-smoke workflow against the preview. |
| 13 | **No dependency automation; 17 prod vulnerabilities on `main`.** The combined branch clears them. | reviewer's audit log | **Done:** `.github/dependabot.yml` (weekly minor/patch group; majors excluded). Merge the branch for the vulnerability fixes. |
| 14 | **Major versions behind** (each its own migration PR): express 4 to 5, vite 7 to 8, recharts 2 to 3, vitest 2 to 5, TypeScript 5.9 to 7, jsdom 24 to 30, framer-motion 12 to 14, lucide-react 0.x to 1.x. | `pnpm outdated` | Do not batch. Express 5 and recharts 3 have real breaking changes. |

## P2: maintainability (and your visual-control goal)

| # | Gap | Evidence | Action |
|---|---|---|---|
| 15 | **Monolith files.** `OverviewPage.jsx` 3,623 lines, `PlayersPage.jsx` 3,078, `api/mlb.js` 2,972, `OtherPages.jsx` 1,990, `index.css` 1,638. | `wc -l` | This is the biggest blocker for the visual roadmap: you cannot move or swap cards that are 3,600 lines of one file. Split Overview into one component per card plus a small registry, **then** add `react-grid-layout` (not installed; roadmap phase 3 not started). |
| 16 | **Dead scaffold code.** `client/src/main.tsx`, `App.tsx`, `pages/Home.tsx`, `pages/NotFound.tsx` (only reference each other; `index.html` loads `main.jsx`), `pages/ComponentShowcase.tsx` (1,437 lines, not routed), `dev-mock-data.js` (unreferenced), the `TODO` scaffold in `server/routers.ts`. | reference search | Delete after one more look; `NotFound` may be worth keeping as a real 404. |
| 17 | **Template UI kit mostly unused.** 53 files in `components/ui`; 43 are not used outside `ui/` and the showcase. About 25 Radix packages ride along and now get update PRs. | reference search | Remove unused components and their packages. |
| 18 | **Root clutter.** 38 markdown/JSON files at the root; 12 tracked notes/audits (`todo.md` is 11,421 lines; four todo files; `data_audit_*`, `qa-notes*`). | `git ls-files` | Move to `docs/archive/`; keep README, CHANGELOG, `docs/`. |
| 19 | **Stale branches.** 9 remote branches are fully merged (0 commits ahead of `main`); PR #32 is superseded by the salary-war branch. | `git rev-list --count` | Delete the 9 merged branches; close #32 after the combined PR merges. |
| 20 | **Undocumented env vars.** Eight were read in code but absent from the README. | `process.env.*` scan | **Done:** README table updated and `.env.example` added. |
| 21 | **New code had no owner.** `CODEOWNERS` covered only provider-cache files. | `.github/CODEOWNERS` | **Done:** warehouse, schema, new routes and the Vercel catch-all added. |

## P3: product and data (from the work in this thread)

| # | Gap | Notes |
|---|---|---|
| 22 | **No component calls the warehouse.** Pitch-panel adapter not written. | First compare one pitcher's `avgPfxX` with Savant to settle the sign perspective; the warehouse's `breakHorizontal` is a different quantity. |
| 23 | **Warehouse health is invisible.** | `view=status` has it; surface it in the cache-health and source-status views. |
| 24 | **Warehouse layers not built:** plays, teams dimension, batting/pitching/fielding lines, provider ID map, aggregates. | Deliberately deferred; build when a feature needs them. |
| 25 | **Blended defensive WAR is null** when FanGraphs is the only provider. | Needs a real defensive-WAR source. |
| 26 | **Hardcoded seasons.** `DEFAULT_SEASON = 2026` in `team-efficiency.js`, `team-financials.js`, `fangraphs-models.js`; efficiency route rejects seasons outside 2024-2030. | Becomes wrong in 2027. `currentMlbSeason()` already exists in `server/mlb-warehouse/ingest.ts`. |
| 27 | **Deep pagination.** Offset is capped at 50,000 rows; keyset pagination is the real fix if a UI needs deep paging. | |
| 28 | **Scraped sources are fixture-tested only.** Baseball-Reference, FanGraphs and Spotrac parsers have never been exercised against the live sites from CI. | The provider-health smoke script exists (`release:providers`); run it on a schedule. |
| 29 | **Production DB engine unconfirmed.** | Tests ran on MariaDB 10.11; `withLockRetry` only recognises InnoDB codes 1213 and 1205. |

## Suggested order
1. **Merge the combined branch** (security fixes, warehouse, efficiency panels), then delete the 9 merged branches and close #32.
2. **Land the hardening pass** (security headers, graceful shutdown, configurable rate limiting): #2, #3, #5.
3. **Fix the About page** (#1) and **create the Heartbeat jobs** (#4).
4. **Gates:** run `warehouse-db-tests` on GitHub, add `pnpm lint` and coverage to CI, add ESLint (#7-#12).
5. **Cleanup:** dead scaffold, unused UI kit, root clutter (#16-#18). This also makes step 6 possible.
6. **Visual control:** split `OverviewPage.jsx` into card components, then add drag-and-drop (#15).
7. **Product:** pitch-panel adapter, warehouse health, season defaults (#22, #23, #26).
