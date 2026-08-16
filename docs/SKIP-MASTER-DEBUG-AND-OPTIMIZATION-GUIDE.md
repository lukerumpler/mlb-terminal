# SKIP Baseball Intelligence Platform
## Master Debugging, Optimization, and AI Execution Guide

**Version:** 1.0  
**Date:** 2026-08-16  
**Purpose:** Primary operating document for debugging, optimizing, and safely extending the baseball intelligence platform.

> The platform must prefer verified, clearly labeled data over complete-looking screens. Missing data is acceptable; fabricated data is not.

## 1. Mission and success criteria

SKIP should behave like a modern front-office intelligence terminal. Verified core information must appear quickly, optional intelligence must arrive progressively, provider failures must not block the page, and every displayed value must expose enough provenance for a scout, analyst, or executive to understand where it came from.

Optimization is successful when the system produces fewer duplicate requests, does not retry blocked providers unnecessarily, preserves once-per-UTC-day provider rules, renders Player Profile core data before optional panels, prevents old responses from overwriting a new selection, and exposes measurable cache and queue outcomes.

The project should be optimized as a **data-orchestration system**, not by repeatedly tuning individual React components or increasing retry counts.

## 2. Current verified state

The current codebase already contains several important protections. Player Profiles use core-first loading with `onCoreReady`; server and browser caches reuse data; durable shared cache covers major provider families; FanGraphs and Savant have daily refresh protection; stale verified data is labeled; provider-blocked states are represented; MLB standings power calculated intelligence metrics; and cache-health telemetry is visible in Overview.

The remaining performance problem is orchestration. Many optional requests begin close together, several Overview effects have independent lifecycles, and the client does not yet have one explicit priority-aware queue with common cancellation, stable-key, timeout, and telemetry rules.

### Evidence snapshot

| Area | Current evidence | Meaning | Priority |
|---|---|---|---|
| Player Profile | Core data is delivered before supplemental data, but optional work still fans out broadly afterward. | Core-first exists; stage ownership and cancellation need strengthening. | P0 |
| Overview | Many independent effects load team, roster, provider, financial, intelligence, and AI data. | Stable keys and effect grouping need a formal budget. | P0 |
| Captured request trace | Approximately 164 Savant, 154 MLB, 62 team-financial, 29 FanGraphs, 14 intelligence, 10 roster-insights, and 6 cache-health browser requests appeared in the captured trace. | These are browser trace totals, not confirmed upstream misses. Cache outcomes must be attached before interpreting them. | P0 |
| Runtime failures | Repeated FanGraphs 502/503 responses, Savant timeouts, and MLB affiliate timeouts were observed. | Prevent repeat attempts and keep slow optional providers off the critical path. | P0 |
| Durable cache | MLB, Savant, FanGraphs, contract, and team-financial paths have durable/shared reuse and provider-specific freshness rules. | Next step is measuring effectiveness and cross-instance cold-miss races. | P1 |
| Maintainability | `mlb.js`, `PlayersPage.jsx`, and `OverviewPage.jsx` contain many lines longer than 180 characters. | Refactor by responsibility after behavior is covered; do not make a blind formatting diff. | P2 |
| Heartbeat cleanup | Daily telemetry cleanup schedule exists; manual execution was explicitly deprioritized by the user. | Keep this operational concern separate from queue optimization. | P3 |

## 3. Non-negotiable data rules

The AI must not fabricate WAR, playoff odds, contract values, ratings, reviews, testimonials, or player metrics. It may calculate only metrics with verified source fields and a documented formula. Calculated values must be labeled as calculated and identify the source dataset.

The FanGraphs and Savant once-per-UTC-day refresh policies must not be bypassed by manual retries, React effect replay, browser reloads, or a second server instance. Provider-blocked, timeout, invalid-payload, stale, unavailable, and not-requested states must remain distinct.

A real zero is data. `0`, `null`, empty string, unavailable, and pending must not be collapsed through truthy checks. A failed request must not be cached as fresh verified data. A stale response must never overwrite a newer live response.

## 4. Target architecture

| Layer | Responsibility | Prohibited behavior |
|---|---|---|
| UI panel | Render data, pending state, error state, and provenance | Starting ad hoc duplicate requests from render logic |
| Screen orchestrator | Define stages, priorities, selection generation, and cancellation | Parsing provider-specific formats directly |
| Request queue | Limit concurrency, coalesce identical keys, abort stale work, measure timing | Replacing server-side durable caching or silently dropping data |
| API client | Build canonical keys, timeouts, abort handling, and response envelopes | Hiding cache source or provider status |
| Server provider route | Enforce TTL, daily gates, cooldowns, stale fallback, parsing, and provenance | Treating invalid HTML or estimates as verified data |
| Durable cache | Share verified payloads across sessions and instances | Persisting unverified payloads as fresh |
| Telemetry | Count outcomes, timing, provider, and bounded endpoint groups | Storing full response payloads |
| Tests | Prove ordering, request counts, races, cache outcomes, and data contracts | Relying only on screenshots |

## 5. Priority-aware loading model

Every screen should use four explicit stages.

| Stage | Examples | Rule |
|---|---|---|
| Core | Player identity, selected MLB team, season hitting/pitching, verified standings | Starts immediately and renders first |
| Important | Advanced metrics, contract, team financials, roster context | Starts after core dispatch or readiness; never blocks core rendering |
| Optional | Savant splits, boxscores, career enrichment, affiliate detail | Starts after core readiness and may be canceled |
| Background | AI roster insight, nonessential charts, exports, warmups | Lowest priority; yields to all other work |

The initial queue policy should be two concurrent core requests, two important requests, two optional requests, and one background request. These are starting values to measure, not permanent assumptions.

Each request must have a canonical key such as `screen:resource:identity:season:variant`, a priority, timeout, abort signal, cache policy, and generation token. Equivalent requests share one promise. A response may commit only if its generation still matches the currently visible selection.

## 6. Player Profile plan

Extract the current loader into named contracts: `loadPlayerCore`, `loadPlayerImportant`, `loadPlayerOptional`, and `loadPlayerBackground`. Keep `onCoreReady`, but make its contract explicit: identity plus verified required season statistics only.

The important stage should own advanced verified metrics, contracts, handedness, and team financials. The optional stage should own Savant, boxscores, career enrichment, and trend history. Each panel should have its own status instead of using one broad `extrasLoading` flag as the only explanation.

When a player changes, abort pending optional work, increment the selection generation, and ignore any response that belongs to the previous generation. Add a timing test proving that core readiness occurs before optional completion and a race test proving old optional data cannot commit.

## 7. Overview plan

Inventory each Overview effect by dependency, stable request key, stage, cache policy, and visible panel. Effects that respond to object identity changes must use stable scalar keys for team, season, roster, and retry state. Roster-insights already has a duplicate-request guard; the same principle should be applied consistently.

Do not replace all effects with one giant `Promise.all`. One slow FanGraphs or Savant provider would recreate the blocking problem. Instead, coordinate team identity and core metrics first, important panels second, and optional/background panels last.

The initial Overview budget should be no more than one request per stable key, no more than two concurrent provider misses per provider family, and no duplicate roster-insights call during React StrictMode effect replay.

## 8. Cache and provider policy

| Provider | Required policy |
|---|---|
| FanGraphs | Once-per-UTC-day refresh, provider-blocked classification, bounded stale verified fallback |
| Savant | Once-per-UTC-day refresh, correct response classification, stale age/provenance labeling |
| MLB Stats | Stable-key reuse, durable cache, route-specific timeout handling, in-flight coalescing |
| Contract | Existing source order and six-hour reuse, truthful pending/stale/unavailable states |
| Team financials | Fresh/stale windows, no rate-limit decision on cache hits or in-flight followers |
| Intelligence | Verified MLB standings calculations and explicit calculated provenance only |

Before changing TTLs, add a cache decision record containing local hit, durable hit, stale availability, refresh permission, upstream result, and final state. If separate instances still perform the same cold upstream request, add a short-lived durable refresh lease with an owner token and expiry. A process-local lock alone cannot protect across instances.

## 9. Error and timeout model

Use one shared classification vocabulary: `aborted`, `timeout`, `429`, `502`, `503`, `provider-blocked`, `invalid-payload`, `database-unavailable`, and `success`.

| Failure | Correct behavior |
|---|---|
| User changed selection | Abort or ignore quietly; do not count as provider failure |
| Timeout or provider 5xx | Use valid stale data if available; respect cooldown and freshness |
| 429 or provider block | Do not retry aggressively; show explicit provider status |
| Invalid payload | Never cache as verified; record parser failure |
| Database unavailable | Fail open to local/provider policy; do not block core UI |

## 10. Telemetry and request budgets

Every request trace should record `{ screen, stage, key, priority, provider, cacheOutcome, startedAt, finishedAt, durationMs, aborted, status, committed }`. Cache outcomes should include `local-hit`, `durable-hit`, `stale-hit`, `deduplicated`, `upstream-miss`, `timeout`, `provider-error`, and `invalid-payload`.

Telemetry must remain aggregated and bounded. It should never store full provider payloads. The existing 30-day cache-health retention policy should remain separate from response-cache retention.

The development diagnostics view should report total requests, stable-key duplicates, cache-hit rate, stale-hit rate, upstream-miss rate, median duration, timeout count, and last upstream attempt by provider and endpoint group. A budget violation should be logged with a reason, not silently suppress data.

## 11. Maintainability plan for long lines

Refactor only after request behavior is covered. The first targets are request-key builders and argument objects in `client/src/api/mlb.js`, stage loaders in `mlb.js`, large JSX panels and repeated provenance labels in `PlayersPage.jsx`, and grouped effects in `OverviewPage.jsx`.

The goal is not a prettier diff. The goal is to make each request path readable enough that its key, timeout, cache policy, provider, and provenance are visible in one small unit. Every extraction must preserve behavior and add or retain focused tests.

## 12. Required test matrix

| Test class | Required proof |
|---|---|
| Key normalization | Equivalent requests share a key; different identities do not collide |
| Queue priority | Core starts before optional; background yields |
| Coalescing | Identical concurrent requests perform one operation |
| Cancellation | Selection changes abort or invalidate old optional work |
| State safety | Old responses cannot update new visible state |
| Cache outcomes | Local, durable, stale, upstream miss, timeout, and provider failure differ |
| Daily policy | FanGraphs/Savant retries do not bypass same-day protection |
| Contract/financial | Fresh reuse, stale fallback, failure recovery, and request counts hold |
| Provenance | Every metric identifies live, calculated, cached, stale, unavailable, or blocked state |
| Build health | Full Vitest, type-check, production build, and responsive browser checks pass |

## 13. Safe execution roadmap

**Phase 1: Instrumentation.** Add request-stage, stable-key, cache-outcome, timing, and commit tracing without changing behavior.

**Phase 2: Queue correctness.** Add canonical keys, priority, in-flight coalescing, abort support, generation checks, and bounded concurrency.

**Phase 3: Player Profile staging.** Extract core, important, optional, and background loaders; add panel-level states and timing tests.

**Phase 4: Overview orchestration.** Stabilize effect dependencies, group effects by lifecycle, and enforce screen budgets.

**Phase 5: Durable ownership.** Add short-lived durable refresh leases only for endpoints whose telemetry proves cross-instance races.

**Phase 6: Maintainability.** Extract long lines and oversized components by responsibility, with behavior-preserving tests.

**Phase 7: Verification.** Compare time-to-core, time-to-panel, duplicate-key count, cache-hit rate, stale-hit rate, upstream-miss rate, timeout rate, and error rate against baseline.

Do not combine queue work with provider TTL changes or metric-definition changes. Keeping those decisions separate makes regressions diagnosable.

## 14. Operating protocol for a stronger coding AI

> Work as a senior reliability engineer on SKIP. Begin with the synchronized branch, project instructions, TODO ledger, tests, and recent logs. Do not edit first. Build a request map and timing trace for Overview, fresh Player Profile, player switching, team switching, retry, and refresh.
>
> For every request, identify the canonical key, screen, stage, priority, provider, cache outcome, timing, status, abort state, and state commit. Separate browser calls from real upstream calls. Preserve all verified data definitions and provenance. Never fabricate WAR, playoff odds, contracts, ratings, reviews, or testimonials.
>
> Make one small change at a time. Before editing, write the expected behavior and regression test. After editing, run the narrow test, type-check, affected tests, full suite, and production build. Reconcile concurrent changes before writing. Report problem, evidence, files, before/after behavior, tests, request-count impact, remaining uncertainty, and checkpoint identity.
>
> Optimize in this order: stable keys, cache reuse, in-flight coalescing, cancellation, priority ordering, timeout classification, durable refresh ownership, and only then TTL changes if evidence justifies them. Core verified data must never wait for optional providers.

## 15. Definition of done

The master optimization is complete when core verified data appears quickly, optional panels load independently, selection changes cannot commit stale results, stable keys do not create duplicate upstream calls, provider daily policies remain intact, durable cache outcomes are measurable, timeout and provider-blocked states are truthful, long-line refactors improve ownership boundaries, and all tests/build/browser checks pass.

The stronger AI should be judged by these measurable outcomes rather than by the size of its refactor.
