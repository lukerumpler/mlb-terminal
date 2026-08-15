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
