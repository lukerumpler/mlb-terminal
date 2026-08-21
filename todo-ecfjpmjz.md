# Project TODO

- [x] Confirm the current editable project is the Baseball intelligence terminal and identify the target GitHub repository `lukerumpler/mlb-terminal`.
- [x] Run the project’s type check, lint check, test suite, and production build.
- [x] Resolve only delivery-blocking validation issues discovered during verification; none were found.
- [x] Commit the current project to GitHub repository `lukerumpler/mlb-terminal` and push the intended branch.
- [x] Fix and verify the Vercel deployment so the live root serves the expected React HTML shell; added `vercel.json`, triggered a new Git-connected deployment from `main`, and confirmed `https://mlb-terminal.vercel.app/` returns HTTP 200 with `text/html`.
- [x] Record final delivery details: GitHub `https://github.com/lukerumpler/mlb-terminal`, Vercel `https://mlb-terminal.vercel.app`, deployment alias `https://mlb-terminal-l3e7gx351-rumpler.vercel.app`, and managed preview `https://skipbasebal-mm6hz9ps.manus.space/`; Vercel deployment `Hbd7qGiCX` is Ready from commit `7c1d943`.

## History

- This checklist was created for the current upload-and-deploy request after identifying `mlb-terminal` as the intended repository.

## Status

- Do not mark an item complete until it has been verified in this session.
- [x] Replace the existing `lukerumpler/mlb-terminal` GitHub `main` branch with the current project by explicit force push, as approved by the user.
- [x] Rerun type check, lint, tests, and production build on the exact pushed commit state before final checkpoint and delivery; the bounded rerun completed successfully.

## Vercel API and production configuration

- [x] Inspect existing MLB, legacy API, and tRPC route registration and map them to a Vercel serverless handler; shared `createApp()` and `api/index.ts` provide the Vercel-compatible dispatch.
- [x] Implement a Vercel-compatible serverless API entrypoint for MLB, legacy API, OAuth, storage proxy, and tRPC routes without breaking the managed Express runtime; `api/index.ts`, `server/app.ts`, and `vercel.json` are present.
- [x] Add or update Vitest coverage for the Vercel handler and route dispatch behavior; `server/app.vercel.test.ts` and `server/vercel-entry.test.ts` are present in the current project.
- [x] Identify required production environment variables in `docs/vercel-production-configuration.md`; actual Vercel secret entry remains explicitly deferred to the user’s Mac Command Center workflow.
- [x] Verify the deployed Vercel root and API status: root returned HTTP 200 HTML, while `https://mlb-terminal.vercel.app/api/health` returned HTTP 404; authenticated-flow verification and the unresolved Vercel API deployment remain explicitly deferred with the environment-variable setup.
- [x] Record Vercel Analytics as explicitly deferred by the user for the Mac Command Center workflow.
- [x] Record `www.lukerumpler.com` domain configuration as explicitly deferred by the user for the Mac Command Center workflow.
- [x] Save the managed deployment checkpoint and record the Vercel configuration items that remain deferred; checkpoint `3e10fd6b` is live for the managed callback.

## Deferred by user

- [x] Defer Vercel production environment-variable setup to the user’s Mac Command Center workflow, as requested.
- [x] Defer remaining Vercel serverless authenticated-flow testing, Analytics enablement, and `www.lukerumper.com` confirmation to the user’s Mac Command Center workflow, as requested.

## Branch review and safe push

- [x] Read the attached branch notes as reference only and inspect all local and GitHub branches.
- [x] Compare branch histories and identify whether any branch can be pushed without overwriting newer work; the local `main` is 79 commits behind GitHub `main`, while the uptime-monitor feature branch is already published and has open PR #5.
- [x] Push only the safe, user-authorized branch changes; the selected managed backend port and heartbeat were applied only after the later explicit request to continue.
- [x] Verify the repository identity and default branch through GitHub CLI; record remaining Vercel setup as deferred to the Mac Command Center workflow.

## Uptime-monitor PR fix

- [x] Create an isolated checkout of `feature/uptime-monitor-dashboard` at the current PR head.
- [x] Fix the `server/_core/storageProxy.ts` TypeScript error by safely normalizing Express wildcard parameters; the existing uptime tests cover the branch route behavior.
- [x] Run the feature-branch tests, TypeScript check, and production build; focused uptime tests passed, TypeScript passed, and the production build passed. The full suite’s five failures reproduce identically on current GitHub `main` in the same three test files, so they are baseline failures unrelated to this PR fix.
- [x] Push the fix to `feature/uptime-monitor-dashboard` and verify PR #5 updates successfully at commit `2fef010`; Vercel Preview is still pending.
- [x] Report merge readiness while leaving the production migration and heartbeat schedule deferred; PR #5 is mergeable but currently unstable until its Vercel check completes.

## Managed deployment and heartbeat activation

- [x] Sync the managed project selectively from merged GitHub commit `bd9f546` without overwriting unrelated newer managed work; preserved newer managed UI/cache-health changes.
- [x] Verify `server/api/uptime-monitor.ts` and `/api/scheduled/daily-uptime-monitor` are present in the managed project; after restart, the preview route returned JSON and the callback was registered.
- [x] Save a deployed callback checkpoint before creating any schedule; checkpoint `3e10fd6b` was saved and auto-published before heartbeat creation.
- [x] Create the daily project heartbeat with cron `0 0 9 * * *` UTC and callback `/api/scheduled/daily-uptime-monitor`; task UID `VsrQFbndWxJPGaPWGDxTPZ`.
- [x] Verify the created heartbeat’s task UID, enabled state, schedule, and callback path: task UID `VsrQFbndWxJPGaPWGDxTPZ`, enabled, POST `/api/scheduled/daily-uptime-monitor`, with no runs yet; the heartbeat API did not return `next_execution_at` for this newly created job.

## Approved selective uptime-monitor port

- [x] Compare uptime-monitor files and dependencies between managed `57223a8` and GitHub merged `bd9f546`.
- [x] Port the backend uptime-monitor schema/code/tests into the newer managed project without overwriting unrelated updates; preserved the newer managed UI and cache-health changes. The GitHub-only dashboard UI was intentionally not ported because this request is for the deployed callback and heartbeat.
- [x] Run type check, focused uptime tests, full relevant validation, and production build on the combined project; type check, focused backend tests, and production build passed.
- [x] Save a checkpoint that deploys the combined callback before creating the heartbeat; checkpoint `3e10fd6b` is live in the managed environment.
- [x] Verify the callback and create the daily `0 0 9 * * *` heartbeat; unauthenticated callback returned the expected 403, and heartbeat `daily-uptime-monitor` was created successfully.
- [x] Confirm the remaining uptime-monitor client module/page is not required for this backend callback and heartbeat request; preserve the newer managed navigation and defer the optional dashboard UI.
- [x] Add and run route-level regression coverage for `/api/uptime-monitor` and `/api/scheduled/daily-uptime-monitor`; both route tests pass.
- [x] Reconcile generated Drizzle migration metadata with the already-applied production schema; the generated `0003_dark_jocasta` migration and journal entry match the additive tables, the incomplete existing ledger was verified, and the safe decision was documented in `docs/uptime-monitor-migration-reconciliation.md` rather than fabricating a partial ledger row.

- [x] Compare every local and remote branch against `main`, identify superior compatible features, and consolidate only validated changes into `main` without overwriting newer work; the compatible Vercel catch-all routing branch was integrated while preserving current main features.
- [x] Run type checking, focused routing/uptime tests, the full Vitest suite, and production build on the consolidated `main` branch; all validation completed successfully.
- [x] Add an automated deployment smoke test for `/api/health`, `/api/trpc`, and an MLB data endpoint, with configurable `VERCEL_SMOKE_BASE_URL` and safe skip behavior when no deployment URL is provided; added `pnpm test:smoke` and `.github/workflows/vercel-smoke.yml`.
- [x] Diagnose and fix the Vercel API 404 routing/deployment configuration for `/api/health`, `/api/trpc`, and `/api/mlb`; restored the catch-all, added explicit health/MLB handlers, added nested tRPC routing, and verified all three production endpoints return HTTP 200 on commit `c0e8a3f`.
- [x] Configure GitHub Actions to run the deployment smoke test automatically after a successful Vercel deployment; `.github/workflows/vercel-smoke.yml` listens for `deployment_status`, filters for success, targets the public production alias, and run `32407092246` completed successfully.
- [x] Validate the routing fix and workflow configuration; TypeScript, focused tests, builds, live production checks, and the automatic smoke workflow passed. The GitHub/Vercel fix is published; the managed-project checkpoint is recorded separately below.

- [x] Add accessible sorting and filtering controls to the selected team’s roster/player statistics display, preserving current data formatting and empty states; added player-name, position, plate-appearance, and innings-pitched sorting plus a clear-filters action to the roster workspace.
- [x] Save the checkpoint for the validated sorting/filtering enhancement; published as checkpoint `ecc9886f` after focused roster tests, full Vitest suite, type checking, production build, and desktop/mobile visual checks completed successfully.

- [x] Verify the best combined branch state, run final validation, and publish the consolidated version for the user; fast-forwarded to shared `origin/main` at `43fa38d`, 134 test files / 618 tests passed when excluding two intermittent external-network contracts, type checking and production build passed, desktop review passed, and the audit reported existing high/critical dev-tool vulnerabilities for separate remediation.

- [x] Add verified-data visual charts for recent player performance and hot-streak trends, with distinct loading and unavailable states; added labeled recent OPS/ERA charts, lower-is-better ERA interpretation, and explicit unavailable handling.
- [x] Add cross-team comparison tables with shared metric, division, and team-search filters plus sort direction, distinct loading/empty states, a pure row-builder regression suite, type checking, focused tests, and production build; ready for checkpoint publication.

- [x] Inspect the current project for reproducible bugs, validation failures, runtime warnings, and high-risk code paths; identified string-keyed team-stat lookups and Vercel tRPC URL-shape fragility as actionable risks, while browser logs showed no current runtime errors.
- [x] Implement targeted debugging and code-quality improvements, add regression coverage, and validate; comparison rows now support numeric/string provider IDs, anonymous tRPC auth detection handles Vercel/Express path shapes, focused routing/comparison/player tests, TypeScript, and production build pass. Checkpoint publication remains next.

- [x] Add loading skeletons and smooth reduced-motion-aware transitions for player-profile switching and cross-team comparison views; reused profile/comparison skeletons, added transition classes, and honored `prefers-reduced-motion`.
- [x] Add source-backed recent game highlights/news context to player profiles with loading and unavailable states; added `PlayerNewsPanel` using the resilient feed API and fixed the existing TeamNewsPanel React hook import contract.
- [x] Add an AI-powered natural-language MLB query bar for player-stat and team-comparison questions, with safe structured results and regression coverage; added server-side `ai.query`, source-constrained JSON output, graceful provider fallback, and input validation coverage.
- [x] Validate all three features and publish a checkpoint; focused page/routing/player regressions, AI contract test, type checking, production build, and visual dashboard review passed.

- [x] Add an efficient single-request progressive response state for longer AI comparison queries without making additional model calls or exposing provider credentials; shows staged context/metric/answer progress while the structured response is pending.
- [x] Add lightweight local query history with save, reuse, case-insensitive deduplication, bounded six-question retention, remove controls, and regression coverage; reuse fills the input without sending a model request.
- [x] Publish the validated AI search enhancement; checkpoint `1458b83c` contains the progressive response state, bounded local history, focused tests, type checking, and production build.

- [x] Audit all-team selection, standings/stat lookups, cross-team comparisons, loading/error states, and responsive rendering for reproducible issues; all 30 configured team intelligence endpoints returned valid responses, the in-app League UI rendered its comparison heading and metric control with 111 table rows at desktop and mobile widths without horizontal overflow, and the comparison audit found a NaN/null filtering defect.
- [x] Fix validated all-teams issues, add regression coverage, run validation, and publish a checkpoint; comparison rows now exclude null/NaN metrics, support deterministic tie sorting, and top-six charts exclude missing metric values while accepting numeric/string provider IDs.

- [x] Compare lukerumpler.com with the latest managed project and identify whether the custom domain points to a different deployment; it initially served a separate Vercel build, while the managed preview served the latest Padres-first interface.
- [x] Align the correct production deployment after verification; GitHub main was reconciled through PR #19, Vercel deployment status passed, and lukerumpler.com now serves the current Padres-first interface.

- [x] Synchronize the approved latest managed release into GitHub main/Vercel production and verify lukerumpler.com matches it; custom-domain reload now shows the current managed layout and API endpoints return HTTP 200.

- [x] Audit mobile layouts and controls across overview, League comparison, navigation, and fixed ticker at narrow widths; reviewed the 375px overview, verified the League workspace controls and no horizontal overflow, and identified bottom ticker clearance and touch-target improvements.
- [x] Implement validated mobile usability improvements, add regression coverage, run validation, and publish the result; added safe-area bottom clearance, larger touch targets, scroll-snap navigation, and passed focused/full tests, TypeScript, and production build.

- [x] Exercise the real League comparison workspace, mobile navigation drawer, and fixed ticker at 375px after the new CSS changes; desktop and mobile browser audits both passed with no horizontal overflow, the drawer opened, the League table rendered, and the ticker stayed within the viewport.
- [x] Add and run focused regression coverage for the mobile-specific layout contract; `test/mobile-layout.test.js` passed all 3 assertions for safe-area clearance, touch targets, and scroll navigation.
- [x] Save and publish a mobile optimization checkpoint and record its version ID.
