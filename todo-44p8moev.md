# Project TODO

- [x] Inspect the existing Team Overview page, navigation, styling, and reusable dashboard components.
- [x] Enhance Team Overview with clearer team context, decision-ready summary metrics, and improved scouting/analytics hierarchy.
- [x] Add a dedicated Prospects tab with filters, prospect table/cards, ranking context, and player evaluation details.
- [x] Connect Team Overview and Prospects navigation without breaking existing routes or authentication behavior.
- [x] Add or update Vitest coverage for the new feature behavior and run the project checks.
- [x] Verify desktop and mobile presentation with screenshots and refine any visual issues.
- [x] Save a checkpoint with all completed items marked complete.

- [x] Add an AI-powered Team Overview insights section grounded in current roster and team statistics, clearly labeling the source context.
- [x] Add Prospects filters for position, age, and projected ETA.
- [x] Add Prospects sorting controls for rank, age, ETA, future value, and performance metrics.
- [x] Add focused Vitest coverage for roster insights and Prospects filtering/sorting behavior.
- [x] Verify the new controls and insights on desktop and mobile, then save a published checkpoint.

- [x] Add a source-safe interactive key-play index for key highlights and plays in the player video section.
- [x] Remove unnecessary hover mechanics while preserving clear keyboard and click affordances.
- [x] Add or update player-video interaction tests and verify responsive presentation.
- [x] Save and publish the completed player-video update.

- [x] Relabel the key-play area as source-safe highlight search shortcuts because verified timestamp metadata is not available from the current external search links.
- [x] Add rendered player-video tests that verify the highlight shortcuts appear and are accessible/clickable in the Player Video panel.
- [x] Perform desktop and mobile visual verification of the updated Player Video panel.

- [x] Add custom highlight playlist creation and persistence for the current user/browser.
- [x] Add save-to-playlist and remove/reorder organization controls for highlight clips.
- [x] Add a compact in-page player for verified embeddable video URLs with safe fallback for search-only links.
- [x] Add rendered interaction tests for playlist and playback flows, then verify desktop/mobile behavior.
- [x] Save and publish the completed playlist and embedded-player update.

- [x] Add move-up and move-down controls for saved clips within the active playlist and test ordering persistence.

- [x] Inventory every visible unavailable, pending, loading, dash, and placeholder data state across the app.
- [x] Trace each state to its API, transformation, loading, or empty-data source.
- [x] Repair safe data paths and replace unresolved states with specific, honest explanations and recovery actions.
- [x] Add focused tests for repaired data states and verify affected views at desktop and mobile sizes.
- [x] Save and publish the completed unavailable-data remediation update.

- [x] Bound the Overview live-feed loading state with an explicit timeout/error message so a stalled upstream cannot leave the page connecting forever.

- [x] Add source-backed playoff odds to Team Overview with source and last-updated freshness metadata.
- [x] Add source-backed team-WAR model data to Team Overview with source and last-updated freshness metadata.
- [x] Add a retry button and bounded retry state for stalled MLB aggregate/player feeds.
- [x] Add focused tests for odds, team-WAR, freshness, retry, and failure states; verify desktop/mobile presentation.
- [x] Save and publish the completed model-source and retry update.

- [x] Sort the Team Overview selector by league, then division, then alphabetical team name.
- [x] Add regression coverage for deterministic selector ordering and preserve selected-team behavior.
- [x] Verify the selector on desktop/mobile and save a published checkpoint.

- [x] Add affiliate lookup from an MLB team to its current minor-league clubs and levels.
- [x] Add a minor-league team overview mode with level, affiliate, team identity, and available live metrics.
- [x] Support the San Francisco Giants → Triple-A Sacramento River Cats example through the real MLB affiliate data path.
- [x] Add tests for affiliate mapping, level selection, loading/error states, and MLB overview preservation.
- [x] Verify the minor-league overview on desktop/mobile and save a published checkpoint.

- [x] Add a rendered test that selects an MLB team, verifies the affiliate selector and minor-league identity/metrics, exercises loading/error fallback, and confirms the MLB overview remains visible.
- [x] Save a new checkpoint after selector ordering and minor-league overview validation.

- [x] Assert the affiliate loading badge in the rendered interaction test before the mocked minor-league overview resolves.
- [x] Save the final selector and minor-league overview checkpoint after all validation is complete.

- [x] Save the final published checkpoint after the latest selector, affiliate overview, and loading-test changes.

- [x] Save a successful post-merge checkpoint for the latest selector, affiliate overview, and loading-state test changes.

- [x] Add a rendered Overview test that verifies model-source success/failure, playoff odds and team-WAR freshness text, source-gap messaging, and retry behavior end to end.
- [x] Save a fresh checkpoint after the rendered model-source and retry test passes.

- [x] Assert rendered model-source freshness text in both the source-gap and recovered-live states.
- [x] Save a successful checkpoint after the freshness assertions pass.

- [ ] Save the final checkpoint after the current freshness assertions pass.
