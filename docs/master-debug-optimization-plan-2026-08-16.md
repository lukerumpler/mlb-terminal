# SKIP Baseball Intelligence Platform
## Master Debugging and Optimization Work Plan

**Date:** 2026-08-16  
**Scope:** Loading performance, data-request queue behavior, provider request minimization, cache reuse, failure resilience, and maintainability.  
**Status:** Audit complete; implementation work should proceed in the priority order below.

> This document is an execution plan grounded in the current synchronized codebase and captured runtime traces. It does not authorize fabricated estimates, unverified WAR, unsupported playoff odds, or provider requests that bypass the established freshness policies.

## 1. Executive assessment

The platform now has meaningful protections: staged Player Profile loading, in-flight request coalescing in several server paths, durable shared caching for major providers, daily FanGraphs/Savant refresh limits, stale-data handling, and cache-health telemetry. The next performance ceiling is not one isolated API call. It is the orchestration layer: too many optional requests begin near the same loading boundary, some panels still wait on broad promise groups, and the client queue does not yet have one explicit policy for priority, concurrency, cancellation, and observability.

The immediate goal should be to make loading **priority-aware and measurable**. Core identity and verified season statistics must always win. Optional scouting, contract, financial, boxscore, Savant, and FanGraphs work must yield to the core path, reuse durable or browser caches, and be cancelable when the user changes teams or players. A request should have one owner, one stable cache key, one timeout policy, and one visible provenance state.

## 2. Evidence snapshot from the current repository

| Area | Current evidence | Interpretation | Priority |
|---|---|---|---|
| Player Profile core loading | `loadFullPlayer()` starts the advanced-stat promise, then awaits hitting and pitching before invoking `onCoreReady`; supplemental work resolves afterward. | The core-first contract exists, but optional work still begins immediately and competes for bandwidth with core requests. | P0 |
| Player Profile supplemental fan-out | After core readiness, the loader uses a broad `Promise.all` for career, contract, handedness, team-financial, advanced, Savant, and boxscore-related work, followed by additional parallel groups. | A player change can create a large burst of optional traffic. The queue needs priorities and cancellation, not only promise grouping. | P0 |
| Overview effects | Overview contains many independent effects. Roster insights uses a stable request key and retry guard, while cache-health loads once per page initialization. | The duplicate roster-insights problem was addressed, but the page still has a high number of concurrent data-producing effects that should be inventoried and budgeted. | P0 |
| Captured request volume | The captured network trace contains approximately 164 `/api/savant`, 154 `/api/mlb`, 62 `/api/team-financials`, 29 `/api/fangraphs-models`, 14 `/api/intelligence-calculations`, 10 roster-insights, and 6 cache-health requests. These are trace totals, not a claim that every request was an upstream-provider call. | MLB/Savant traffic dominates the client trace. The next audit must separate cache hits, durable hits, stale hits, and true upstream misses. | P0 |
| Runtime failures | The trace contains repeated FanGraphs 502/503 responses, Savant timeout events, and MLB affiliate timeout events. | Failure states are expected for blocked or slow providers; the optimization target is preventing repeated attempts and keeping failures from delaying verified core content. | P0 |
| Durable shared cache | Durable storage now exists for MLB proxy, Savant, FanGraphs, contract, and team-financial flows, with provider-specific freshness and stale rules. | The cache boundary is strong, but telemetry must be used to find endpoints that still bypass it or produce low hit rates. | P1 |
| Long lines | Many files contain lines over 180 characters. `PlayersPage.jsx` includes extremely long JSX/data-map lines, and `mlb.js` has long request/normalization lines. | This is primarily a maintainability and debugging-cost problem. Refactor by responsibility, not by cosmetic wrapping alone. | P2 |
| Scheduled cleanup | The daily cleanup endpoint is implemented and checkpointed. The daily Heartbeat exists, but manual execution verification still needs a confirmed successful run record. | Keep schedule verification separate from request-queue refactoring so operational proof remains clear. | P1 |

## 3. Priority workstreams

### P0-A — Build one priority-aware client request queue

Create a shared queue abstraction for MLB, Savant, contract, financial, FanGraphs, and intelligence requests. The queue should accept a stable request key, priority (`core`, `important`, `optional`, `background`), timeout, abort signal, and cache policy. It should expose counters for queued, started, cache-hit, deduplicated, aborted, timed-out, and failed requests.

The queue must not replace server-side caching. Its job is to control browser concurrency and ordering. The first safe policy is:

| Priority | Examples | Initial concurrency rule |
|---|---|---|
| Core | Player identity, season hitting/pitching, selected MLB team identity and standings | Start immediately; maximum 2 concurrent core requests |
| Important | Team roster, contract, team financials, verified advanced metrics | Start after core begins; maximum 2 concurrent important requests |
| Optional | Savant splits, boxscores, career enrichment, affiliate details | Start only after core readiness; maximum 2 concurrent optional requests |
| Background | Roster AI insight, charts, nonessential exports, warmups | Start only when core and important work are settled; maximum 1 background request |

Every queued request must be cancelable. When a player or team changes, abort pending work associated with the previous selection and prevent its result from mutating current state. Existing response identity checks remain necessary even with `AbortController`, because an upstream response may finish during cancellation.

**Acceptance criteria:** A Player Profile switch renders core data without waiting for optional requests; old-player optional responses cannot overwrite the new player; concurrent identical keys share one promise; a canceled request is not counted as an upstream miss; queue counters are visible in test diagnostics.

### P0-B — Split Player Profile loading into explicit stages

Keep the current `onCoreReady` behavior, but make the stages explicit in the API contract:

1. `core`: identity, team, season hitting, season pitching.
2. `important`: advanced metrics, contract, handedness, team financials.
3. `optional`: Savant, boxscores, career enrichment, and trend history.
4. `background`: nonessential panels and AI-derived presentation layers.

Do not start every optional request at the same instant as the core requests. Start important work after core requests have been dispatched or after core readiness, depending on measured latency. Start optional work only after core readiness. Preserve partial data when one supplemental provider fails. Return per-panel status and provenance instead of collapsing all extras into one generic error.

**Acceptance criteria:** The core callback fires after only the required core requests; each stage has a distinct loading state; contract and financial panels say pending until their own data resolves; the final merged object has stable field names and explicit `extrasLoading`/per-panel statuses; no fabricated value is inserted for a failed provider.

### P0-C — Establish a request budget per screen

Add a development-only request budget report for Overview and Player Profile. The report should group requests by endpoint, stable key, cache result, and stage. The first budget should flag:

| Screen | Initial budget target |
|---|---:|
| Overview initial load | No more than 1 request per stable key; no more than 2 concurrent provider misses per provider family |
| Player Profile core | 2 required MLB requests, with shared-cache reuse allowed |
| Player Profile important | One request per stable contract, financial, and advanced key |
| Player Profile optional | No duplicate Savant, boxscore, or career key during one selection |

The budget is diagnostic, not a reason to suppress verified data. If a request exceeds budget, log the key and reason rather than silently dropping the panel.

### P1-A — Measure durable-cache effectiveness

Extend cache-health telemetry to include endpoint-level keys or bounded endpoint groups for contract and team-financial traffic. Track `durable-hit`, `stale-hit`, `upstream-miss`, `local-hit`, `deduplicated`, `timeout`, and `provider-error`. Keep payloads out of telemetry. Retain the current 30-day cleanup policy.

Add a read-only diagnostics view or development export showing, by provider and endpoint, total attempts, durable-hit rate, stale-hit rate, miss rate, median response time, and last upstream attempt. This is the fastest way to distinguish a queue problem from a provider availability problem.

### P1-B — Add server-side refresh ownership

Durable cache reads prevent cross-instance duplication, but concurrent cold misses across separate instances can still race unless refresh ownership is coordinated. Add a short-lived lease/lock record only for expensive provider refreshes. The lease should have an expiry, owner token, and provider key. A request that loses the lease should poll the durable cache briefly rather than making a second upstream request.

Do not use a process-local lock as the only protection. Process-local coalescing remains useful for same-instance latency, but it cannot guarantee cross-instance ownership.

### P1-C — Harden timeout and retry classification

Create one shared timeout/error classifier for client and server layers. Distinguish `aborted`, `timeout`, `429`, `502`, `503`, `provider-blocked`, `invalid-payload`, and `database-unavailable`. Each class should map to a defined action:

| Failure | Action |
|---|---|
| Aborted because the user changed selection | Stop quietly; do not count as provider failure |
| Timeout or provider 5xx | Use valid stale data; record upstream miss; respect cooldown/freshness |
| 429 or provider-blocked | Respect daily/cooldown gate; show explicit provenance |
| Invalid payload | Do not cache as verified; record parser failure |
| Database unavailable | Fall back to local cache or upstream policy; never make the database failure block core UI |

### P2-A — Refactor long lines by responsibility

The long-line count is broad, but the highest-value targets are `client/src/api/mlb.js`, `client/src/pages/PlayersPage.jsx`, and `client/src/pages/OverviewPage.jsx`. Do not perform a blind formatter pass that creates a large review diff. Refactor in small units:

- Extract request-key builders and endpoint argument objects from `mlb.js`.
- Extract stage loaders from `loadFullPlayer()` into named functions with typed result shapes.
- Extract large JSX panels and repeated status-label logic from `PlayersPage.jsx`.
- Extract Overview effects into hooks grouped by team identity, provider metrics, and secondary panels.
- Keep each request path readable enough that its cache key, timeout, and provenance are visible together.

**Acceptance criteria:** no behavior changes, no metric-definition changes, focused tests remain stable, and each refactor is independently reviewable.

## 4. Specific queue investigation checklist

The next implementation pass should answer these questions with instrumentation rather than assumptions:

| Question | Evidence to collect | Decision |
|---|---|---|
| Does the browser queue actually limit concurrent provider calls? | Active-count timeline by endpoint and selection key | Set or adjust concurrency limits |
| Are duplicate requests identical or merely related? | Canonical URL/key and request owner | Improve key normalization or effect dependencies |
| Are cache misses real upstream misses? | Cache outcome attached to each request | Fix cache bypasses before changing TTLs |
| Are slow optional requests delaying rendering? | Core-ready timestamp versus panel-ready timestamps | Move them to later queue stages |
| Are canceled requests still writing state? | Selection generation ID on start/finish | Add abort plus generation guard |
| Does durable cache reuse survive separate instances? | Same key across instance/request IDs | Add refresh leases if needed |
| Does the long line hide a data mapping bug? | Extracted helper tests and field-level assertions | Refactor only after behavior is covered |

## 5. Test plan

The queue work needs deterministic tests for stable-key coalescing, priority order, cancellation, timeout classification, cache-hit bypass, stale fallback, retry suppression, and result-generation protection. Add one integration-style Player Profile test that records request start and completion order and proves that core readiness precedes optional completion.

Add Overview tests that count each stable request key across initial mount, team change, manual retry, and React StrictMode effect replay. Add server tests that simulate two concurrent cold misses against the same durable key and verify that only one refresh owner is allowed once the lease is introduced.

Run the existing full suite, type-check, production build, and a browser trace at desktop and mobile widths. The known sandbox limitation around published Playwright E2E should remain explicitly separated from local/unit validation rather than being silently ignored.

## 6. Safe implementation order

The safest sequence is to instrument first, then change orchestration. First add request-stage and cache-outcome diagnostics without changing behavior. Second add the browser queue behind a feature flag or development-only switch and compare request counts. Third migrate Player Profile core/important/optional stages. Fourth migrate Overview effects in groups. Fifth add cross-instance refresh ownership only for endpoints whose telemetry proves they still race. Sixth refactor long lines after behavior and tests are stable.

Do not change provider TTLs, daily refresh rules, or metric definitions during the queue project. Those are separate policy decisions and mixing them into orchestration changes would make regressions difficult to diagnose.

## 7. Definition of done

The optimization pass is complete when a fresh Player Profile load shows core identity and verified season statistics before optional panels; changing players cancels or ignores prior optional work; repeated stable keys do not create duplicate upstream calls; durable and stale cache outcomes are visible by provider; FanGraphs/Savant daily policies remain intact; timeout and provider-blocked states are humanized; the queue has measurable concurrency and outcome counters; the full suite, type-check, production build, and responsive browser checks pass; and every remaining unavailable metric has a truthful provenance state.

## 8. Current known limitations

FanGraphs remains subject to upstream blocking and should continue to show unavailable or stale verified data rather than estimates. Savant and MLB upstream timeouts remain possible and should be reduced through queue ordering and cache reuse, not by increasing retries. The cleanup Heartbeat schedule exists, but its manual execution still requires a successful platform run record. Vercel should remain frontend-only unless durable cache ownership and API routing are deliberately migrated together.

## 9. Recommended first coding slice

The first coding slice should be small and measurable: add a `request-trace` object to the browser request helper, record `{ screen, stage, key, priority, cacheOutcome, startedAt, finishedAt, aborted }`, and expose it only in development diagnostics. Then add one Player Profile test asserting the exact start/finish order for core versus optional requests. This produces the evidence needed to tune the queue without guessing and avoids another broad refactor before the remaining bottleneck is quantified.
