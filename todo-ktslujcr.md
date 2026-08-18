# Project TODO

- [x] Record the canonical main-branch baseline, working-tree status, release configuration, and available branch inventory.
- [x] Assess every non-main branch for unique commits, merge safety, overlap, conflicts, and expected release value.
- [x] Document the compatibility review of GitHub main at 64213f2 and advance the release-gate baseline only after confirming canonical main retains or supersedes every material safeguard.
- [x] Integrate only eligible changes into main and make any necessary targeted reliability, debugging, or performance corrections. The reviewed branch safeguards are already retained or strengthened by the canonical staged loader, validated provider routes, transparent fallback states, and the latest player-scoped Savant retry guard; no unsafe raw merge was applied.
- [x] Add or update focused automated tests for every production-code change made in this session. No production code was changed in this session; the current branch’s concurrent production change is covered by its focused regression and the full gate.
- [x] Run type checking, the relevant test suites, a production build, and browser-level release checks; resolve material failures. The latest full gate passed 113 test files / 535 tests, while MLB, Savant, news, and FanGraphs provider contracts all passed; public Overview, Talent, and player-profile smoke checks completed without a visible application failure.
- [ ] Commit and push the validated main-branch release, checkpoint it for publication, and verify the production site.
- [ ] Produce a concise integration decision record and release summary.
