# Project TODO

- [x] Record the canonical main-branch baseline, working-tree status, release configuration, and available branch inventory.
- [x] Assess every non-main branch for unique commits, merge safety, overlap, conflicts, and expected release value.
- [x] Document the compatibility review of GitHub main at 64213f2 and advance the release-gate baseline only after confirming canonical main retains or supersedes every material safeguard.
- [x] Integrate only eligible changes into main and make any necessary targeted reliability, debugging, or performance corrections. The reviewed branch safeguards are already retained or strengthened by the canonical staged loader, validated provider routes, transparent fallback states, and the latest player-scoped Savant retry guard; no unsafe raw merge was applied.
- [x] Add or update focused automated tests for every production-code change made in this session. No production code was changed in this session; the current branch’s concurrent production change is covered by its focused regression and the full gate.
- [x] Run type checking, the relevant test suites, a production build, and browser-level release checks; resolve material failures. The latest full gate passed 113 test files / 535 tests, while MLB, Savant, news, and FanGraphs provider contracts all passed; public Overview, Talent, and player-profile smoke checks completed without a visible application failure.
- [x] Commit and push the validated main-branch release, checkpoint it for publication, and verify the production site. Managed checkpoints 45450c5e and 00376784 are live; external GitHub PR #4 merged cleanly to main at 576d127 after the Vercel check passed, and the custom domain was refreshed successfully.
- [x] Produce a concise integration decision record and release summary.
- [x] Inspect the current roster-insights tables, player statistics loading path, and team-overview loading path to preserve existing data contracts and visual patterns.
- [x] Add accessible roster-insights controls for metric sorting, sort direction, player search, and position filtering without mutating source data.
- [x] Add responsive, reduced-motion-safe skeleton loading states for player statistics and team overview content while preserving transparent source and unavailable-data states. Desktop review confirmed the table controls and the initial overview skeleton render correctly.
- [x] Add focused Vitest coverage for roster sorting/filtering and skeleton-loading behavior, then run the relevant full validation suite and visual checks. Focused coverage passed 38 assertions; the full suite passed 114 files / 538 tests after explicit test cleanup; TypeScript and production build passed; desktop and mobile previews verified the table, controls, and overview skeleton layout.
- [ ] Publish the validated roster-table and skeleton-loading enhancement.
