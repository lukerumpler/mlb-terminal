# MLB Terminal Release Hardening Report

**Date:** August 17, 2026  
**Hardened local checkpoint:** `d3554f5`  
**Protected staging preview:** [mlb-terminal-6t3jnh7gl-rumpler.vercel.app](https://mlb-terminal-6t3jnh7gl-rumpler.vercel.app)  
**Current decision:** **Protected staging approved; public production promotion remains blocked pending account-level checks.**

## Baseline reconciliation

The working tree is already a descendant of the tracked GitHub `main` reference (`ffb803e`); it contains the newer identity, calculated-intelligence, Vercel bundle, and staging-routing work. There are no commits unique to `origin/main` that would be overwritten by the current candidate. The earlier synchronization summary describing a clean `aa73d31` checkout does not match the present local checkout, which is at `d3554f5` after the hardening commit.

## Repairs completed

| Area | Completed work | Validation |
| --- | --- | --- |
| Test gates | Repaired the LLM retry fixture so it exercises a mocked `412`, corrected the FanGraphs stale-cache fake-clock ordering, and made the defensive-WAR source-contract assertion formatter-safe. | Focused suites passed, and the full local suite completed with **91 files passed, 1 skipped; 440 tests passed, 2 skipped**. |
| Published-browser E2E | Removed the obsolete hard-coded deployment target. The test is skipped unless `SKIP_LIVE_URL` is supplied; `test:published` requires that explicit candidate URL. | The two published-Overview tests passed against the hardened protected preview. |
| Dependency baseline | Upgraded AWS SDK, Axios, tRPC, Drizzle, NanoID, Express, Express types, Streamdown, and direct security-resolution packages. Removed the unused Streamdown 1.x chain before restoring the actively used dependency at Streamdown 2.5.0. | Type check and production build passed. Resolved production paths now include Express 5.2.1, router/path-to-regexp 8.4.2, qs 6.15.3, body-parser 2.3.0, and Streamdown 2.5.0. |
| Package resolution | Moved the ignored patch/override settings into `pnpm-workspace.yaml`, including the existing Wouter patch. | pnpm no longer emitted the legacy package-level settings warning; a frozen install completed. |
| Express 5 | Migrated the storage proxy wildcard from an unnamed Express 4 wildcard to named Express 5 `*key` semantics, joining the wildcard segment array safely. | Added a serverless app regression that passes for a multi-segment storage key; all four Vercel app tests pass. |
| Staging deployment | Built and published the committed candidate as a protected preview. | The preview reached `READY`; `/api/health` returned the expected service JSON. |

## Live protected-preview verification

The browser rendered the SKIP Overview workspace, retaining explicit **Calculated** labels for WAR proxy and playoff estimates. The final serial smoke check returned HTTP 200 for MLB standings, all-team intelligence with exactly 30 teams, strict Baseball-Reference identity resolution for the direct Judge lookup, and privacy-safe resolver metrics. The explicit published Overview E2E suite also passed **2/2** against this preview.

## Remaining promotion actions

| Priority | Owner/action | Reason |
| --- | --- | --- |
| **P0** | Promote the immutable `d3554f5` checkpoint through the tracked GitHub and Vercel production workflow, then repeat health, provider, and published-browser checks against the production URL. | The hardened candidate is a direct protected preview; the active production target remains older. |
| **P0** | Verify production environment-variable presence and values through the Vercel project settings, including allowed origins and OAuth configuration or an intentional decision to disable unused OAuth flows. | The local app initialization still reports an absent `OAUTH_SERVER_URL`; no production secret values were inspected or changed. |
| **P1** | Re-run the registry-backed production advisory scan from a network-stable CI worker and save the exact result with the immutable lockfile. | The final `pnpm audit --prod --json` registry request stalled after the upgrades, so the final advisory count is not claimed as clean. Direct dependency resolution confirms the previously critical Express, qs, body-parser, and path-to-regexp paths are now patched. |
| **P1** | Trace Vercel’s remaining `DEP0169` `url.parse()` runtime warning using a platform stack trace or dependency attribution. | The warning persists in Vercel aggregation; a local `--trace-deprecation` app test did not reproduce a stack trace. |
| **P1** | Decide on production monitoring ownership and a non-email incident workflow. | Email alerts remain deliberately disabled; no alert schedule or mailbox integration was activated. |
| **P2** | Establish a shared persistent rate-limit/cache store before broad public traffic. | The current rate limiter correctly enforces its local window but is process-local across serverless instances. |

## References

[1]: [Staging smoke chronology](./staging-smoke-findings-2026-08-17.md)

[2]: [Production-readiness evidence](./production-readiness-evidence-2026-08-17.md)

[3]: [Hardened preview published-browser E2E log](./hardened-preview-published-e2e-2026-08-17.log)

[4]: [Reconciled full-suite log](./reconciled-release-vitest-2026-08-17.log)
