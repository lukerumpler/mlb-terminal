# Project TODO

- [x] Inspect the affiliate subtitle state rendering and remove raw internal error text
- [x] Trace cached-source badge rendering and identify whether the spacing defect exists in the current repository
- [ ] Verify whether the two top dropdown outlines are true simultaneous focus or shared styling
- [x] Add focused regression tests for confirmed defects
- [x] Run targeted tests and record remaining issues or repository gaps
- [x] Limit Savant and related provider requests to a nightly refresh with same-day cache reuse
- [x] Verify manual retry behavior does not bypass the nightly refresh policy unless explicitly intended
- [x] Replace the fused “savant Cached” presentation with a readable source and cache-age label
- [x] Implement an actual nightly Savant refresh mechanism instead of relying only on a rolling 24-hour TTL
- [x] Add a regression test proving manual retry does not refetch same-day Savant data
- [x] Add explicit user-facing Savant cache-age text and a UI regression test
- [x] Record the full-suite unhandled test-environment errors and the unresolved dropdown-focus question in a QA note
- [ ] Create the production Heartbeat job for /api/scheduled/refresh-savant after deployment is confirmed
- [ ] Add an effect-level test that changes the manual retry path and asserts same-day Savant helpers are not called again
- [ ] Add a rendered Overview UI test proving the visible cache-age label appears in the DOM
