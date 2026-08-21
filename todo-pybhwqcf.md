# Project TODO

- [x] Inspect existing cache telemetry, Settings alerts, and workspace navigation contracts
- [x] Add a live cache-health dashboard using existing provider telemetry without generating additional provider requests
- [x] Add evidence-based live alert sources to the Settings alert area with clear provenance and empty states
- [x] Add a compact, accessible mobile workspace switcher for the combined navigation model
- [x] Add regression coverage and validate the new dashboard, alert, and mobile navigation behavior
- [x] Keep the cache-health dashboard populated and visibly refreshing during manual or scheduled telemetry rereads
- [x] Add regression coverage for the non-blank cache-dashboard refresh state and rerun validation
- [x] Save and report the verified operations-dashboard update
- [x] Audit current runtime, browser, network, and provider behavior for concrete optimization opportunities
- [x] Audit client request deduplication, staged loading, cache TTLs, and retry boundaries across high-traffic data flows
- [x] Review production build, dependency, accessibility, and test-quality signals for verified release gaps
- [x] Implement and test only high-impact, evidence-based fixes discovered during the audit
- [ ] Run final release validation, checkpoint, and report the master optimization result
