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

- [ ] Inspect existing MLB, legacy API, and tRPC route registration and map them to a Vercel serverless handler.
- [ ] Implement a Vercel-compatible serverless API entrypoint for MLB, legacy API, OAuth, storage proxy, and tRPC routes without breaking the managed Express runtime.
- [ ] Add or update Vitest coverage for the Vercel handler and route dispatch behavior.
- [ ] Identify required production environment variables and configure them in Vercel through the approved secrets workflow.
- [ ] Verify public API responses and authenticated login/logout behavior on the Vercel deployment.
- [ ] Enable Vercel Analytics for the production project.
- [ ] Configure and verify the user-selected custom production domain.
- [ ] Save a final checkpoint and record the completed Vercel configuration and test results.

## Deferred by user

- [ ] Resume Vercel production environment-variable setup from the Mac Command Center workflow.
- [ ] Resume Vercel serverless API deployment verification, authenticated-flow testing, Analytics enablement, and `www.lukerumper.com` confirmation.

## Branch review and safe push

- [x] Read the attached branch notes as reference only and inspect all local and GitHub branches.
- [x] Compare branch histories and identify whether any branch can be pushed without overwriting newer work; the local `main` is 79 commits behind GitHub `main`, while the uptime-monitor feature branch is already published and has open PR #5.
- [ ] Push only the safe, user-authorized branch changes; do not apply the referenced database migration, heartbeat schedule, or pull-request merge unless separately requested.
- [ ] Verify the final remote branch state and report any deferred actions.

## Uptime-monitor PR fix

- [x] Create an isolated checkout of `feature/uptime-monitor-dashboard` at the current PR head.
- [x] Fix the `server/_core/storageProxy.ts` TypeScript error by safely normalizing Express wildcard parameters; the existing uptime tests cover the branch route behavior.
- [x] Run the feature-branch tests, TypeScript check, and production build; focused uptime tests passed, TypeScript passed, and the production build passed. The full suite’s five failures reproduce identically on current GitHub `main` in the same three test files, so they are baseline failures unrelated to this PR fix.
- [x] Push the fix to `feature/uptime-monitor-dashboard` and verify PR #5 updates successfully at commit `2fef010`; Vercel Preview is still pending.
- [x] Report merge readiness while leaving the production migration and heartbeat schedule deferred; PR #5 is mergeable but currently unstable until its Vercel check completes.

## Managed deployment and heartbeat activation

- [ ] Sync the managed project to merged GitHub commit `bd9f546` without overwriting unrelated newer managed work.
- [ ] Verify `server/api/uptime-monitor.ts` and `/api/scheduled/daily-uptime-monitor` are present in the deployed managed project.
- [ ] Save a deployed callback checkpoint before creating any schedule.
- [ ] Create the daily project heartbeat with cron `0 0 9 * * *` UTC and callback `/api/scheduled/daily-uptime-monitor`.
- [ ] Verify the created heartbeat’s task UID, enabled state, next execution, and callback path.

## Approved selective uptime-monitor port

- [x] Compare uptime-monitor files and dependencies between managed `57223a8` and GitHub merged `bd9f546`.
- [x] Port the backend uptime-monitor schema/code/tests into the newer managed project without overwriting unrelated updates; preserved the newer managed UI and cache-health changes. The GitHub-only dashboard UI was intentionally not ported because this request is for the deployed callback and heartbeat.
- [x] Run type check, focused uptime tests, full relevant validation, and production build on the combined project; type check, focused backend tests, and production build passed.
- [ ] Save a checkpoint that deploys the combined callback before creating the heartbeat.
- [ ] Verify the callback and create the daily `0 0 9 * * *` heartbeat.
- [x] Confirm the remaining uptime-monitor client module/page is not required for this backend callback and heartbeat request; preserve the newer managed navigation and defer the optional dashboard UI.
- [x] Add and run route-level regression coverage for `/api/uptime-monitor` and `/api/scheduled/daily-uptime-monitor`; both route tests pass.
- [x] Reconcile generated Drizzle migration metadata with the already-applied production schema; the generated `0003_dark_jocasta` migration and journal entry match the additive tables, the incomplete existing ledger was verified, and the safe decision was documented in `docs/uptime-monitor-migration-reconciliation.md` rather than fabricating a partial ledger row.
