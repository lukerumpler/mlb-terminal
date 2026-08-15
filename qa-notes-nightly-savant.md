# Nightly Savant Refresh QA Note

## Confirmed

The Savant proxy now keeps successful provider responses through the next UTC midnight and allows verified stale fallback data for seven days when Baseball Savant is unavailable. The browser-side team, summary, and opponent batted-ball caches use the same UTC-day boundary, so changing a manual retry token does not force another same-day provider request when cached data exists.

The affiliate subtitle no longer prints raw state-machine values such as `error`. Source badges now include explicit spacing between the provider name and status badge, and the overview includes cache-age wording such as `cached 2h ago` when a cached Savant result is displayed.

Focused validation passed: 25 tests across the Savant proxy cache, new nightly-cache tests, and existing team-data-cache tests. TypeScript checking passed, and the production build completed successfully.

## Remaining validation notes

The full Vitest suite reported 76 passing test files and 367 passing tests, but it also emitted two unrelated `window is not defined` unhandled errors from `test/savant-metric-display.test.jsx` after the test environment teardown. This should be investigated separately before treating the entire suite as clean.

The two top dropdown outlines were not changed in this pass because the still image cannot distinguish simultaneous focus from a shared static border style. That remains a separate UI investigation item.

The nightly callback endpoint is implemented at `/api/scheduled/refresh-savant` and is cron-protected. A production Heartbeat schedule still needs to be created after the deployed callback is reachable; the intended schedule is once nightly in UTC.

## Repository source-of-truth conclusion

The editable project is tracking `origin/main` at checkpoint commit `36aaf482`, which contains the Savant cache and badge-spacing changes. The attached external clone referenced an older unrelated GitHub state at `aa73d31`; it is stale relative to this project’s canonical remote. No merge or overwrite was performed, because the current project remote is the authoritative source for this Manus project.

## Dropdown focus audit

The team and affiliate selectors both use the same neutral `C.border` inline border and neither has a shared amber focus rule in the current OverviewPage or global CSS. The screenshot alone cannot prove simultaneous focus; the amber appearance is most consistent with browser focus rendering or the static themed surface rather than an application rule applying focus to both controls.


## Published Overview verification — checkpoint 4116a55d

A cache-busted navigation to https://skipbasebal-mm6hz9ps.manus.space/?verify=4116a55d loaded the published Dodgers Overview with the MLB selector set to Los Angeles Dodgers and the affiliate selector visibly set to “Select MiLB affiliate.” No “Minor-League Affiliate Overview” panel appeared in the captured first-load viewport/content. The published page showed readable provider separation in the Advanced Models & Savant panel: “FanGraphs ↻Cached” and “Savant ↻Cached” appeared as separate items, and the focused local regression suite remained green. The default page did not enter the affiliate error state, so the humanized error copy is validated by the controlled local affiliate-error regression rather than by this default live path.

The separate GitHub repository remains at aa73d314 and is not the Manus project remote. The editable project tracks its Cloudflare artifact remote at checkpoint 4116a55d.


## Automated published-site verification

`test/published-overview.e2e.test.js` now launches Chromium against the published URL with a cache-busting query. It passed on August 15, 2026 and asserted that the team selector value is `lad`, the affiliate selector value is empty, the affiliate panel title is absent, no raw `· error` text is present, and at least one published source-badge group has a computed gap of at least 10px. The prior hard-refresh observation conflicts with the repeatable current-build check, but its exact cause cannot be established from the available historical evidence. The current-build check passes against the published domain.

The deployed affiliate-error copy is verified through the controlled existing affiliate-error interaction test because the public page has no supported switch for intentionally forcing an upstream affiliate failure. That test asserts the exact user-facing sentence and confirms the MLB parent overview remains visible.


## Asset-level discrepancy resolution

The live deployment’s Overview chunk `OverviewPage-Bxtfk0co.js`, fetched at 21:06:51 UTC, contains the updated source locations for `OverviewSourceBadge` lines 67–68, the `Select MiLB affiliate` placeholder, the guarded affiliate panel, and the explicit `style:{gap:10}` badge groups. The local production build uses a different content hash because it was rebuilt after the Playwright dependency addition; the live asset’s embedded source locations match the checkpointed code. The current cache-busted deployment and automated E2E run use the corrected bundle. The exact cause of the earlier hard-refresh screenshot showing Oklahoma City remains undetermined because that historical load was not captured with equivalent runtime tracing.

Production has no supported fault-injection query or public control for forcing Baseball Savant/affiliate upstream failure. The reproducible error-state check is therefore intentionally scoped to the existing controlled affiliate-error interaction test, which verifies the exact humanized copy and preserved MLB parent overview. The deployed default path is separately asserted to contain no raw `· error` text.


## Historical hard-refresh limitation

The original Oklahoma City-on-hard-refresh screenshot was not captured with a simultaneous startup trace, storage dump, or asset response log, so its exact historical cause cannot be reconstructed with certainty. The reproducible current-build trace now loads both a hard-refresh URL and a cache-busted URL, records zero `skip-select-affiliate` startup events, records the recent-history storage reads, and observes an empty affiliate value in both modes. The current deployed asset contains the corrected source markers. This is sufficient to verify the present behavior, but not to claim a definitive causal explanation for the unreproducible historical view.
