# Project TODO

- [x] Complete the attached UI-audit review alongside current SKIP integration boundaries, runtime logs, request behavior, and build health.
- [x] Prioritize the highest-value compatible accessibility, design-system, reliability, and integration improvements from the audit.
- [x] Implement selected audit fixes and a configuration-compatible integration without fabricating baseball data or obscuring unavailable states.
- [x] Add regression coverage and validate integration success, provider failure, unavailable behavior, accessibility, and responsive UI states.
- [x] Run type checks, linting, supported full tests, production build, and desktop/mobile verification, then publish a live checkpoint.

- [x] Preserve all seven Overview headline metrics at the compact mobile breakpoint instead of hiding Playoff Odds and Team WAR.
- [x] Correct warm-palette secondary text contrast and raise the sub-8px status text to a readable minimum.
- [x] Replace Intelligence’s static labeled-as-projection tables with live MLB leader data and explicit loading/unavailable states.
- [x] Remove the fabricated named-player injury-risk claims and superseded hardcoded trade simulator.
- [x] Add regression coverage for the audit P0 fixes and live Intelligence leader integration.

- [x] Resolve the fallback-route full-suite regression with a regular-expression SPA fallback compatible with the running Express server.

- [x] Add rendered regression coverage for the Intelligence live-leader unavailable state.
- [x] Verify the live-leader Intelligence panels at desktop and compact mobile widths.
- [x] Document the actual regular-expression SPA fallback contract that supports the running Express version.
- [x] Save and publish the final validated audit-driven checkpoint.

- [x] Inventory all player, team, leader-table, trade, and report WAR displays and trace their current sources.
- [x] Select verified source paths for each WAR type and document any metric that must remain explicitly unavailable.
- [x] Integrate source-backed WAR values throughout supported SKIP views without replacing unavailable data with proxies or static examples.
- [x] Add regression coverage for available, unavailable, and source-failure WAR states across responsive views.
- [x] Run type checks, linting, supported full tests, production build, and desktop/mobile verification, then publish a live checkpoint.

- [x] Remove the calculated Team WAR proxy from all live WAR display paths so only source-backed Team WAR or explicit unavailability is shown.

- [x] Update Team WAR regressions to require verified values or explicit unavailability rather than a calculated proxy.
- [x] Preserve provider-free Overview test rendering after the concurrent ballpark-weather query integration.

- [x] Scope prospect and historical WAR labels to their supported datasets or show explicit unavailability rather than implying live current-season WAR.
- [x] Document the remaining public-provider access limitation and future-ready integration boundary without requesting a paid service.

- [x] Update the historical net WAR sorting regression for the explicit fixed-dataset label.
- [x] Diagnose and resolve the concurrent Scouting Notes interaction timeout before final WAR integrity validation.

- [x] Repair the Scouting Notes tRPC module import so the page can load in the routed app and direct regression suite.

- [x] Normalize the shared authentication hook’s tRPC import path so provider-backed pages resolve in production and tests.

- [x] Keep the direct Scouting Notes persistence regression local-first by stubbing authentication and sync outside the application provider tree.

- [x] Reconcile the roster-insights interaction selector with the current Team Overview workspace navigation.
- [x] Reconcile the playoff-odds source-contract assertion with the verified-only Team WAR explanatory copy.

- [x] Save and publish the validated WAR source-integrity update as a live checkpoint.
