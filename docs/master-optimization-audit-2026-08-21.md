# Master Optimization and Debugging Audit — 2026-08-21 UTC

## Scope and baseline

The audit examined the client data adapters, page-level polling and asynchronous effects, state-derived roster selection, runtime diagnostics, bundle output, production dependencies, and the complete regression suite. The review began from the clean `fix/live-score-ticker` revision so the optimization branch preserved the separately reviewed ticker repair.

| Baseline area | Result |
|---|---|
| Type check | Passed |
| Production build | Passed; lazy page splitting retained |
| Clean test suite before changes | 117 files / 544 tests passed; 2 files / 4 tests skipped |
| Production dependency audit | 0 known vulnerabilities across 519 production dependencies |
| Vercel runtime diagnostic window | One historical `DEP0169` `url.parse()` warning cluster; no application-source use found |

## Implemented improvements

### Intel Feed cache correctness

The Intel Feed client previously returned an entry throughout its full stale window, including after its five-minute fresh TTL elapsed. That made stale content short-circuit a new request for up to 30 minutes, even when the provider was reachable. The cache now returns only fresh entries to normal callers. A stale entry is retained exclusively as a verified fallback after a new request fails.

### Intel Feed background polling

The Feed page previously continued its five-minute polling interval whenever the page was mounted, including while the document was hidden. It now clears polling when the document becomes hidden, immediately reloads when the document becomes visible, and restarts the normal interval only while visible. This retains feed freshness for active users while reducing background browser and provider work.

### Overview roster state immutability

The team Savant snapshot path sorted `liveTeamPlayers.hitting` and `liveTeamPlayers.pitching` in place before selecting the top 12 rows. Those arrays are state-backed and shared with downstream memoized selectors, so in-place ordering could produce unnecessary churn and difficult-to-reproduce UI inconsistencies. Selection is now centralized in an immutable helper that clones before sorting; the same helper drives the Savant request key.

## Regression coverage

| Area | New or strengthened coverage |
|---|---|
| Intel Feed cache | Verifies fresh data is requested after TTL expiry and stale data appears only after a failed refresh |
| Intel Feed polling | Verifies hidden documents perform no automatic requests and visibility restoration refreshes immediately |
| Savant roster selection | Verifies top workload rows are selected without reordering the original state-backed roster arrays |

## Residual risks and deliberately deferred items

The Vercel diagnostic service reported a historical Node `DEP0169` warning around `url.parse()`. Repository source inspection found no direct call, so no speculative dependency change was made. The warning should be revisited only after a stack trace or dependency attribution identifies the responsible production component.

The separate Vercel handler-bundling repair remains in PR #7. It is the correct path to resolve the production `/api/uptime-monitor` function initialization issue before the additive uptime-monitor migration and daily heartbeat are activated. This optimization branch does not duplicate or alter that routing repair.

## Final validation

The optimized branch passed TypeScript validation, the configured formatting gate, the production build, and the complete clean-environment suite: 118 test files / 548 tests passed, with 2 test files / 4 tests skipped.
