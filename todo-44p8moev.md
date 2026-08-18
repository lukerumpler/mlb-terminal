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

- [x] Save the final checkpoint after the current freshness assertions pass.

- [x] Add dedicated standings and schedule views to the minor-league affiliate overview.
- [x] Integrate richer source-aware FanGraphs projections and advanced metrics on MLB Team Overview.
- [x] Add more Baseball Savant data with source and freshness metadata.
- [x] Persist recently viewed minor-league affiliates across sessions and expose quick-access controls.
- [x] Add rendered tests for MiLB navigation/data, model/Savant freshness, and affiliate history persistence.
- [x] Verify MLB and MiLB flows on desktop/mobile and save a published checkpoint.

- [x] Improve mobile dashboard navigation with a compact, accessible navigation control while preserving the desktop sidebar.
- [x] Add responsive interaction coverage and verify the mobile navigation at desktop and mobile sizes.
- [x] Save and publish the validated mobile navigation update.

- [x] Inventory MLB, FanGraphs, Savant, affiliate, Nitter, and NCAA feed request paths and recent 429/error behavior.
- [x] Reduce avoidable feed bursts with bounded retries, request deduplication, cache-aware handling, and strict origin/rate-limit safeguards where applicable.
- [x] Add regression coverage for successful uploads, throttled responses, cached fallbacks, and honest source-gap labels.
- [x] Validate dashboard data rendering at desktop/mobile sizes and publish the repaired data-feed update.
- [x] Preserve the explicit empty-body MLB proxy error contract discovered by the full-suite regression.
- [x] Make the Overview smoke test target the workspace navigation control without colliding with page-level Overview buttons.

- [x] Inventory every visible Source gap state and trace its verified live, cached, or derived data path.
- [x] Replace resolvable Source gap states with verified values or clearly labeled derived rollups; improve genuinely unavailable states with specific provider messaging and recovery actions.
- [x] Add regression coverage for resolved source states and honest unavailable fallbacks.
- [x] Verify desktop/mobile rendering and publish the Source gap replacement update.

- [x] Inventory FanGraphs and Baseball Savant proxy/client request paths, cache behavior, and current 429 handling.
- [x] Implement provider-specific caching, in-flight deduplication, bounded 429 backoff, and verified stale fallbacks with truthful freshness metadata.
- [x] Add regression coverage for live, cached, stale, throttled, and recovery states.
- [x] Verify desktop/mobile freshness labels, run the full suite, and publish the provider-reliability update.

- [x] Reconcile the supplied specification with current FanGraphs/Savant/MLB data contracts.
- [x] Add verified FanGraphs aggregate Team WAR coverage with cache and stale fallback metadata.
- [x] Add verified Savant team batted-ball and against-team endpoints for spray, xwOBA, contact quality, and exit-velocity rollups.
- [x] Add MLB schedule-based Home/Away and Day/Night split aggregation without fabricating OPS/ERA splits.
- [x] Decide whether Playoff Odds remains an explicit gap or becomes a clearly labeled SKIP estimate before implementing that field.
- [x] Implement a clearly labeled SKIP Playoff Odds estimate using verified standings and remaining MLB schedule data; never attribute it to FanGraphs.
- [x] Replace the oversized full-season playoff-estimate schedule request with bounded sequential date chunks and honor per-request timeout options.
- [x] Wire team_batted_balls and team_batted_balls_against into OverviewPage so spray, xwOBA, contact-quality, and exit-velocity panels consume verified rows.
- [x] Add rendered tests for team spray/contact-quality success and honest empty fallback states.
- [x] Capture post-change desktop/mobile screenshots and publish a fresh provider-reliability checkpoint.

- [x] Finish wiring verified team and opponent Savant rows into spray, batted-ball, exit-velocity, and contact-quality panels.
- [x] Add verified aggregate FanGraphs Team WAR parsing with cache and stale fallback metadata.
- [x] Add schedule-derived Home/Away and Day/Night W–L split rows; keep OPS/ERA split fields explicitly unavailable until boxscore data is connected.
- [x] Add confirmed MLB venue metadata, recorded game weather, and official MLB media links where the current page has a relevant surface.
- [x] Add tests, desktop/mobile screenshots, and publish the specification-aligned release.
- [x] Wire Advanced Models xwOBA and the intended exit-velocity dependency to verified team_batted_balls rows, or explicitly narrow their source contract.
- [x] Save a fresh checkpoint after the final provider-reliability and specification-aligned verification pass.

- [x] Audit the attached empty-state, responsive-overflow, control-state, footer, and sidebar recommendations against the current rendered dashboard.
- [x] Unify empty-state card templates, remove redundant body titles, distinguish status accents, and standardize unavailable-value presentation.
- [x] Repair responsive overflow and clipping in the Overview grid, badges, and Splits Dashboard table.
- [x] Replace nonfunctional toggle controls with truthful static states or implemented interactions; clarify footer truncation and sidebar grouping.
- [x] Add responsive regression coverage, verify desktop/mobile screenshots, and publish the UI repair update.
- [x] Finish converting any remaining Overview manual unavailable blocks to OverviewEmptyState and standardize unavailable-value rendering across relevant panels.
- [x] Add explicit regression coverage for Overview mobile selector/grid overflow, sidebar Workspace grouping, and ticker truncation behavior.
- [x] Confirm remaining toggle-like controls are truthful implemented interactions or clearly labeled static states.
- [x] Save and publish a fresh checkpoint covering provider reliability, source-aligned metrics, and the UI repair release.

- [x] Inspect current player-profile routes, MLB proxy contracts, and existing player stat presentation for boxscore-level split integration.
- [x] Define verified boxscore aggregation fields for player OPS and ERA splits, including source and freshness metadata.
- [x] Implement bounded MLB boxscore retrieval, aggregation, and player-profile split presentation without fabricated values.
- [x] Add regression tests for batting/pitching split success, loading, unavailable, and source freshness states.
- [x] Verify desktop/mobile player-profile layouts and publish the validated boxscore splits release.

- [x] Audit dashboard, team, affiliate, player, boxscore, FanGraphs, Savant, NCAA, and MLB loading paths plus current server/browser/network logs.
- [x] Reproduce and document any loading failures, timeouts, 404s, 429s, stale states, or frontend race conditions with their root causes.
- [x] Repair verified loading failures while preserving honest unavailable states and provider-specific freshness metadata.
- [x] Add regression coverage for repaired loading and recovery flows, then run the complete test suite and TypeScript check.
- [x] Verify repaired data flows at desktop/mobile sizes and publish the validated data-loading repair.
- [x] Stabilize the preservation command-palette regression under the full Vitest worker run without weakening its interaction coverage.
- [x] Bound the Savant team batted-ball request so an upstream timeout resolves to an honest unavailable state instead of holding Overview loading.
- [x] Confirm FanGraphs 502 responses resolve to explicit unavailable/fallback states without leaving model panels in Loading.
- [x] Rerun the complete suite and TypeScript check after the final affiliate timeout change.
- [x] Capture post-fix desktop/mobile verification showing the affiliate selector resolves or transitions to an explicit unavailable state.
- [x] Add or rerun rendered Overview coverage proving a FanGraphs 502 leaves model panels in an explicit unavailable/fallback state rather than Loading.
- [x] Verify whether the ERR_HTTP_HEADERS_SENT log recurs after current proxy repairs or document it as stale/non-blocking.
- [x] Save and publish a fresh checkpoint for the final data-loading repair after the verified fixes.
- [x] Preserve rendered regression evidence that affiliate lookup transitions from generic Loading to identity-ready or explicit unavailable status.

- [x] Inspect existing team/player aggregate, boxscore, freshness, export, navigation, and retry contracts for the data-quality toolkit.
- [x] Define verified reconciliation rows, freshness metadata schema, export payloads, provider statuses, and retry behavior.
- [x] Implement aggregate-versus-boxscore reconciliation view with explicit match, variance, incomplete, and unavailable states.
- [x] Implement freshness-aware CSV and JSON exports for current team/player/reconciliation data.
- [x] Implement a data-source status center with provider-specific retry controls and independent loading states.
- [x] Add regression coverage, run the full suite and TypeScript check, and verify responsive desktop/mobile flows.
- [x] Save and publish the validated data-quality toolkit checkpoint.
- [x] Add team-level CSV and JSON exports with current team values and freshness/source metadata, exposed from Overview.
- [x] Refactor MLB, FanGraphs, Savant, boxscore, and roster-insights retries into provider-specific tokens/effects rather than one shared Overview refresh token.
- [x] Wire the NCAA retry control to the actual NcaaWatchPanel consumer and prove each provider retry refreshes only its targeted source panel.
- [x] Add regression coverage for team exports and isolated provider retry behavior, then rerun full validation and responsive verification.

- [x] Resolve OverviewPage, global stylesheet, and retry interaction-test merge conflicts while preserving natural-language search and divisional WAR.
- [x] Add regression coverage for team exports and isolated provider retry behavior, then rerun full validation and responsive verification.
- [x] Run the complete 66-file, 352-test suite and TypeScript check successfully.
- [x] Capture final desktop and mobile Overview screenshots and verify responsive presentation.
- [x] Save and publish the validated data-quality toolkit and merge-resolution checkpoint.

## Historical checklist items completed in this session

- [x] Add regression coverage, run the full suite and TypeScript check, and verify responsive desktop/mobile flows.
- [x] Save and publish the validated data-quality toolkit checkpoint.
- [x] Add team-level CSV and JSON exports with current team values and freshness/source metadata, exposed from Overview.
- [x] Refactor MLB, FanGraphs, Savant, boxscore, and roster-insights retries into provider-specific tokens/effects rather than one shared Overview refresh token.
- [x] Wire the NCAA retry control to the actual NcaaWatchPanel consumer and prove each provider retry refreshes only its targeted source panel.
- [x] Add regression coverage for team exports and isolated provider retry behavior, then rerun full validation and responsive verification.

- [x] Add date and team filtering for NCAA data navigation.
- [x] Add date and team filtering for MLB boxscore data navigation.
- [x] Add sorting controls for NCAA and MLB boxscore records by date and team.
- [x] Add loading animations and clear error messages for provider status and retry controls.
- [x] Add regression tests for filters, sorting, loading, retry success, and retry error states.
- [x] Verify desktop/mobile presentation and publish the validated update.

- [x] Add pagination controls for larger historical MLB boxscore tables.
- [x] Add saved filter presets for favorite boxscore team/date/sort combinations.
- [x] Persist presets safely per player/browser and support applying and deleting them.
- [x] Add regression tests for pagination, preset persistence, apply/delete, and responsive controls.
- [x] Verify desktop/mobile presentation and publish the validated update.

- [x] Rerun the focused regression suite against the current local workspace and record the result.
- [x] Inspect /api/player-identity?mode=metrics for privacy-safe telemetry fields and response behavior; current local and published routes return the SPA HTML shell rather than JSON.
- [x] Extract and review the attached observability audit archive methodology and evidence outputs.
- [x] Report focused-test, endpoint, and archive-review findings with any discrepancies.

- [x] Explain the Players and Intelligence honestState false flags from ui-data-audit.json and related evidence.
- [x] Run the full local 433-test suite and identify the exact cause of every failing test; the current workspace instead contains 360 passing tests and no reproduced failures.
- [x] Trace player-identity telemetry through current source, branches, commits, and repository history.
- [x] Report the audit, test-health, and telemetry-history findings with exact discrepancies.

- [x] Search reflogs, remote branches, tags, and unreachable objects for d65383c or the missing telemetry branch.
- [x] Inspect Players and Intelligence source contracts and add honest source/freshness metadata where verified.
- [x] Add regression coverage for the new Players and Intelligence metadata states.
- [x] Run the current 360-test suite with coverage reporting and review file/test distribution; after the shared merge, 101 files and 483 tests passed with V8 coverage.
- [x] Verify metadata changes and publish a validated checkpoint if implementation is required and passes.

- [x] Add persistent Players Favorites with save, remove, and quick-open profile actions.
- [x] Add responsive Favorites presentation to the Players landing and selected-profile states.
- [x] Trace the divisional WAR payload and fix verified division-row normalization/rendering.
- [x] Preserve an explicit unavailable state when no verified divisional WAR rows exist.
- [x] Add regression tests for Favorites and verified/unavailable divisional WAR states.
- [x] Run full validation, review responsive behavior, and publish the update.

- [x] Calculate playoff odds from verified MLB standings when provider odds are unavailable, with an explicit calculated label.
- [x] Calculate a projected WAR proxy from verified MLB team inputs when provider Team WAR is unavailable, with an explicit calculated label.
- [x] Preserve provider-first values and explicit unavailable states when verified inputs are insufficient.
- [x] Add regression coverage for provider, calculated, and unavailable metric paths.
- [x] Run validation, review responsive Overview labels, and publish the update.

- [x] Inspect Front Office Evaluation grade inputs for Defense, Depth, and Future Value.
- [x] Calculate and label Defense, Depth, and Future Value grades from verified team, roster, and prospect inputs where supported.
- [x] Preserve explicit unavailable labels when a required verified input is absent.
- [x] Add regression tests for populated and unavailable Front Office grades.
- [x] Run validation, review the rating strip, and publish the repair.

- [x] Inspect existing Baseball Savant OAA inputs and prospect-chart patterns.
- [x] Display verified Statcast OAA alongside the calculated Defense grade with a clear source distinction.
- [x] Add a clickable Future Value rating that opens an accessible organization-level prospect depth-chart modal.
- [x] Preserve explicit OAA and prospect-data unavailable states.
- [x] Add regression tests for OAA context, modal opening/closing, and source labels.
- [x] Repair the release-blocking package-manager declaration introduced by the shared production-readiness update.
- [x] Run full validation, review responsive behavior, and publish the enhancements.

- [x] Inspect existing player-profile navigation and depth-chart row semantics.
- [x] Make organization depth-chart prospect rows open the matching detailed player profile.
- [x] Preserve accessible modal behavior and add profile-link navigation regression coverage.
- [x] Run validation, review the interaction, and publish the linked rows.

- [x] Inspect the Team Overview schedule loader, schedule states, and Divisional WAR comparison data/visual path.
- [x] Repair schedule loading while preserving verified/cached/unavailable states.
- [x] Improve the Divisional WAR Comparison visual and its provider/fallback labels.
- [x] Add regressions for schedule readiness and comparative WAR rendering states.
- [x] Run validation, visually review the repaired Overview panels, and publish the update.

- [x] Inspect the current Divisional WAR comparison panel and verified component fields.
- [x] Add a compact exact-value divisional WAR table beneath the chart.
- [x] Preserve selected-team emphasis and explicit unavailable component fields.
- [x] Add regression coverage and validate the compact comparison table.
- [x] Review and publish the Divisional WAR table update.

- [x] Inspect the interrupted compact-table patch and current FanGraphs provider status signals.
- [x] Remove verified-status badges from unavailable Off WAR and Def WAR values.
- [x] Clarify provider-blocked, cached historical, and live FanGraphs states in the Divisional WAR panel.
- [x] Complete the compact exact-value Divisional WAR table without manufacturing missing components.
- [x] Add blocked/cached/unavailable presentation regressions, validate, and publish.

- [x] Audit remaining unavailable Overview and model metrics against verified backend inputs.
- [x] Define backend calculation fallbacks only for metrics with sufficient verified source fields.
- [x] Implement calculated metrics with explicit method and provenance labels.
- [x] Preserve unavailable states for unsupported provider-only metrics.
- [x] Add calculation integrity regressions, validate responsive UI labels, and publish.

- [x] Inspect current win-pace projection presentation, request lifecycle, cache boundaries, and recent dashboard errors.
- [x] Add a compact pythagorean W–L comparison beside the existing win-pace projections with clear calculated provenance.
- [x] Apply targeted dashboard reliability and performance optimizations without suppressing source-gap states.
- [x] Add regression coverage for the comparison, request bounds, and optimized fallback behavior.
- [x] Run full validation, review desktop/mobile dashboard performance, and publish.

- [x] Inspect dashboard explanation blocks and identify redundant copy.
- [x] Remove unnecessary explanations while preserving short source and calculation labels.
- [x] Add or update concise-copy regressions and review responsive layout.
- [x] Validate and publish the streamlined dashboard copy.

- [x] Inspect repeated source badges, Executive Briefing copy, and compact-label mobile alignment.
- [x] Consolidate repeated provider badges into concise panel-level status lines.
- [x] Shorten the Executive Briefing subtitle and refine compact-label alignment on mobile.
- [x] Add regression coverage and validate desktop/mobile presentation.
- [x] Publish the panel-status and mobile-layout refinement.

- [x] Inspect Batted Ball, Pitching, and dashboard empty-state component patterns.
- [x] Consolidate Batted Ball and Pitching provider labels into panel-level status lines.
- [x] Convert long empty-state details into concise expandable notes while preserving honest source context.
- [x] Add regression coverage and validate desktop/mobile interactions.
- [x] Publish the consolidated panels and expandable empty notes.

- [x] Review the supplied overall-grade scoring system and map each formula input to verified platform data.
- [x] Identify unsupported metrics, hidden assumptions, availability rules, and differences from the current Front Office grade.
- [x] Present the validation findings and obtain approval for any necessary substitutions before integration.
- [x] Integrate the approved scoring system with provenance, unavailable states, and regression coverage.
- [x] Run full validation, review the overall-grade display, and publish.
