# API and UI Fixes Patch Review

## Scope

The attached `api-and-ui-fixes.patch` was reviewed against the current shared project. Only changes tied to the requested debugging and performance work were retained. No metric definitions, customer-generated content, or staging secrets were changed.

## Hunk decisions

| Patch area | Decision | Reason |
|---|---|---|
| `server/api/contract.js` | Accepted and adapted | Diacritic normalization and length-scaled fuzzy matching reduce the risk of assigning a real contract value to the wrong player. Named exports were added for focused regression tests. |
| `client/src/pages/OverviewPage.jsx` `rosterSavantKey` hunk | Already present, then extracted | The current source already used the attachment’s identity-based dependency instead of the raw `liveTeamPlayers` object. The calculation is now in `client/src/lib/rosterSavantKey.js` so stability is directly testable, while the Savant effect still depends on the stable identity key. |
| `client/src/index.css` profile-column layout changes | Rejected as out of scope | These are player-profile layout changes and do not address upload integrity, request frequency, provider errors, or the current Overview loading race. Applying them would expand the task beyond debugging and optimization. |
| `client/src/pages/PlayersPage.jsx` additions and panel changes | Rejected as out of scope | These add or alter player-profile visualizations and derived displays. They are feature/UI expansion rather than a necessary fix for the reported data-loading and duplicate-request problems. They were not applied without separate validation of every metric and data source. |

## Additional reliability work

The AI roster-insights request now uses a stable team-and-retry key, so polling updates cannot duplicate the same POST while roster data settles. A changed MLB team or explicit retry receives a new key and remains eligible to request fresh insights.

The MLB proxy now gives slow schedule requests 20 seconds, team and affiliate requests 15 seconds, and other MLB resources 12 seconds. Existing in-flight coalescing, failure cooldown, stale-cache behavior, and the once-nightly Savant refresh policy remain unchanged.

## Validation

The full Vitest suite passed with 81 test files and 388 tests. The expanded focused suite passed with 7 files and 30 tests, type-checking passed, and the production build completed successfully. New tests cover roster-insights request deduplication, stable Savant roster identity, contract-name safety, and route-specific MLB timeout selection.
