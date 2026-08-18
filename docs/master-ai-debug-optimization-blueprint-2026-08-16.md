# SKIP Baseball Intelligence Platform
## Advice-First Master Debugging and Optimization Blueprint

**Purpose:** Give a stronger coding AI a disciplined operating plan for debugging and optimizing the entire project before it changes production code.  
**Primary concern:** Loading/data-queue behavior, duplicate provider requests, slow optional panels, cache reuse, and truthful data provenance.  
**Current decision:** Advice and architecture first; no broad refactor should begin until the AI has produced evidence for each proposed change.

## Executive recommendation

The project should be treated as a **data orchestration system**, not primarily as a collection of React pages. The biggest gains will come from controlling when requests start, which request is allowed to win, how results are cached, and how partial failures are represented. A stronger AI should therefore begin by building a request map and timing trace, then make small changes at the orchestration boundaries.

The AI must never solve a slow or missing metric by inventing an estimate. It may calculate only metrics whose definitions and source fields are verified. It must preserve the existing once-per-UTC-day policy for FanGraphs and Savant, durable shared cache behavior, stale-data labels, provider-blocked states, and the distinction between `0`, missing, unavailable, timed out, and not requested.

The desired user experience is a front-office terminal: core verified facts appear quickly, optional intelligence fills in progressively, failures are visible but not disruptive, and every number has understandable provenance.

## What the next AI must do first

The next AI should not start by rewriting `mlb.js`, `PlayersPage.jsx`, or `OverviewPage.jsx`. It should first create a short evidence report from the current synchronized branch. That report must include the request key, screen, stage, cache outcome, start time, finish time, duration, abort state, HTTP status, provider, and the component that requested it. The report should distinguish browser requests from actual upstream-provider fetches.

The AI should then reproduce three flows: a fresh Overview load, a fresh Player Profile load, and a Player Profile switch before optional requests finish. It should capture request order and state commits. A code-only conclusion is insufficient for race conditions; the AI needs a trace showing which request started first, which finished first, and whether an old response changed current UI state.

## Target architecture

| Layer | Responsibility | Must not do |
|---|---|---|
| UI page | Render current verified state and panel-level loading/error/provenance | Start ad hoc duplicate fetches inside many unrelated effects |
| Screen orchestrator | Define stages, priorities, cancellation, and selection generation | Parse provider-specific payloads directly |
| Request queue | Limit browser concurrency, coalesce identical keys, abort stale work, measure timing | Replace durable server caching or silently drop over-budget data |
| API client | Build canonical keys, apply timeout/abort handling, normalize response envelopes | Hide whether data came from live, durable, stale, or unavailable state |
| Server route | Enforce provider policy, local cache, durable cache, cooldown, stale fallback, and provenance | Return fabricated values or treat invalid upstream HTML as verified JSON |
| Durable cache | Share verified payloads across instances and sessions | Store unverified payloads as fresh data or retain telemetry forever |
| Telemetry | Count outcomes and durations by bounded provider/endpoint keys | Store full response bodies or personally identifying data |
| Tests | Prove request counts, ordering, race protection, and data contracts | Rely only on screenshots for behavior validation |

## The loading model to implement

Every screen should use four explicit stages.

| Stage | Examples | Rendering rule |
|---|---|---|
| Core | Player identity, selected team identity, verified season hitting/pitching, current standings | Must render as soon as required core responses resolve |
| Important | Advanced verified metrics, contract, team financials, roster context | Starts after core dispatch or readiness; each panel owns its own state |
| Optional | Savant splits, boxscores, career enrichment, affiliate detail | Never blocks core; can be canceled when selection changes |
| Background | AI roster insight, nonessential charts, exports, warmups | Lowest priority; should not compete with core or important requests |

A stage should return a structured result rather than an untyped merged object. The minimum result shape should include the selection key, stage, data, `status`, `source`, `retrievedAt`, `cacheAge`, and an optional error classification. A panel should be able to say `pending`, `live`, `durable-cached`, `stale-cached`, `provider-blocked`, `timeout`, `unavailable`, or `not-requested` without guessing from a missing field.

## Queue rules for the stronger AI

The queue should use a canonical key such as `screen:resource:identity:season:variant`. Query-string ordering, empty values, and aliases must normalize to one key. Two callers with the same key should share a promise. Two callers with different keys must not share data merely because they use the same endpoint.

The queue should have bounded concurrency. Start with two core slots, two important slots, two optional slots, and one background slot. These are initial safety values, not permanent truths; the AI must tune them from timing telemetry. The queue must support `AbortController` and a selection-generation token. Aborting a request is not enough by itself: every completion must verify that its generation still matches the visible selection.

The queue must count `deduplicated`, `local-hit`, `durable-hit`, `stale-hit`, `upstream-start`, `upstream-success`, `timeout`, `provider-error`, `aborted`, and `state-commit`. A canceled request must not be counted as a provider failure. A stale response must never overwrite a newer live response.

## Provider and cache policy

The AI must treat cache policy as part of data correctness. It must not make a broad TTL change to solve a screen-loading issue.

| Provider/data family | Required behavior |
|---|---|
| FanGraphs | Preserve once-per-UTC-day refresh protection, provider-blocked classification, and bounded stale verified fallback |
| Savant | Preserve once-per-UTC-day refresh protection, stale cache labeling, and correct CSV/HTML response classification |
| MLB Stats | Prefer durable/local reuse and request coalescing; maintain route-specific timeout behavior |
| Contract | Preserve source order and six-hour reuse; distinguish pending, unavailable, and stale data |
| Team financials | Preserve fresh and stale windows; avoid rate-limit checks on cache hits or in-flight followers |
| Intelligence calculations | Use verified MLB standings and explicit calculated provenance; do not turn unsupported metrics into estimates |

The stronger AI should add a cache decision log before changing any cache. For each request it should answer: Was there a local hit? Was there a durable hit? Was stale data available? Was an upstream request permitted by the daily or cooldown gate? Was the returned payload verified? Why was the final state selected?

## Highest-priority debugging targets

### 1. Player Profile fan-out

`loadFullPlayer()` already provides core-first rendering, but the next AI should verify whether optional promises begin too early and compete with the core path. It should separate the loader into named `loadPlayerCore`, `loadPlayerImportant`, and `loadPlayerOptional` functions. Each function should have a narrow return contract and its own tests.

The AI should not remove advanced metrics merely to make the page look faster. It should delay them, cache them, or render them progressively. The contract panel, financial panel, Savant panels, boxscore panels, and career-trend panels must each show their own pending state.

### 2. Overview effect density

Overview contains many independent effects, including roster insights, cache health, team metrics, schedule-related data, Savant data, and financial data. The next AI should map every effect to its dependencies and stable key. It should identify effects that run because an object reference changed even though the underlying team or roster key did not.

The AI should consolidate only effects with the same lifecycle. It should not put all Overview work into one giant `Promise.all`, because one slow provider would recreate the blocking problem. The goal is coordinated stages with independent panel commits.

### 3. Savant and FanGraphs failure repetition

The logs show repeated FanGraphs 502/503 responses and Savant timeout events. The next AI must determine whether these are true upstream attempts or browser requests receiving durable/stale responses. It should inspect cache-health telemetry and server logs together. If repeated upstream attempts occur on the same UTC day, the bug is policy enforcement or key mismatch. If only browser calls repeat while the server returns cache hits, the problem is client orchestration or display refresh.

### 4. MLB and affiliate timeouts

MLB affiliate/team requests are slow enough to appear in the browser trace. The AI should verify that affiliate detail is not on the critical path for the selected MLB team and that an affiliate selection change cancels the prior request. A timeout should leave the MLB parent team visible and mark only the affiliate panel unavailable.

### 5. Maintainability and long lines

Long lines are a real debugging cost, but formatting everything at once would create a noisy and risky diff. The AI should refactor only around behavior boundaries: request-key builders, stage loaders, provider status mapping, large JSX panels, and repeated provenance labels. Every extraction must be accompanied by a behavior test. Cosmetic wrapping without a smaller responsibility is not a useful optimization.

## AI operating protocol

The following protocol should be given to the more powerful coding AI as its operating instruction:

> Work as a senior reliability engineer on the SKIP baseball intelligence platform. Start with evidence, not edits. Read the current synchronized files, project instructions, TODO ledger, recent logs, and tests before proposing code. Build a request map for Overview and Player Profile. For every request, record the canonical key, screen, stage, priority, cache outcome, provider, start time, finish time, duration, status, and state commit. Separate browser calls from actual upstream calls.
>
> Preserve verified data definitions and provenance. Never fabricate WAR, playoff odds, contract values, ratings, reviews, or player metrics. Preserve once-per-UTC-day FanGraphs/Savant refresh rules, durable-cache behavior, stale fallback, cooldowns, provider-blocked states, and the zero-versus-missing distinction.
>
> Make one small change at a time. Before editing, write the intended behavior and the regression test. After editing, run the narrow test first, then type-check, then the relevant integration tests. Run the full suite and production build before checkpointing. Do not merge or overwrite concurrent session changes; reconcile the current shared branch first.
>
> Optimize the request lifecycle in this order: stable keys, cache reuse, in-flight coalescing, cancellation, priority ordering, timeout classification, durable refresh ownership, and only then provider TTL changes if evidence justifies them. Core verified data must never wait for optional providers. Partial failures must remain visible and truthful.
>
> Report every change using: problem, evidence, exact files, behavior before, behavior after, tests, request-count impact, remaining uncertainty, and rollback/checkpoint identity. If evidence is insufficient, stop and say what must be measured instead of guessing.

## Required test matrix

| Test group | Required proof |
|---|---|
| Canonical keys | Equivalent requests share a key; different identities never collide |
| Queue priority | Core starts before optional; background work yields |
| Coalescing | Concurrent identical requests perform one network operation |
| Cancellation | Player/team changes abort or ignore old optional work |
| State safety | Old responses cannot commit into a new selection |
| Cache outcomes | Local, durable, stale, upstream miss, and provider failure are distinct |
| Daily policy | FanGraphs/Savant retries do not bypass same-day protection |
| Contract/financial | Fresh hits, stale fallback, failure recovery, and request counts hold |
| Provenance | Every displayed metric identifies live, calculated, cached, stale, unavailable, or provider-blocked state |
| Build health | Full Vitest, type-check, production build, and responsive browser checks pass |

## Safe execution roadmap

**Phase 1: Instrumentation only.** Add request and cache tracing without changing behavior. Produce baseline traces for Overview, Player Profile, team change, player change, retry, and refresh.

**Phase 2: Queue correctness.** Add canonical keys, priority, in-flight coalescing, abort support, and generation checks. Keep the current provider policies unchanged.

**Phase 3: Player Profile staging.** Extract core, important, optional, and background loaders. Add timing and panel-state tests. Confirm core readiness does not wait for optional providers.

**Phase 4: Overview orchestration.** Group effects by lifecycle, stabilize dependency keys, and prevent duplicate roster/team/provider work. Keep panels independently renderable.

**Phase 5: Durable refresh ownership.** Use telemetry to find cross-instance cold-miss races. Add short-lived database leases only where duplicated upstream work is proven.

**Phase 6: Maintainability refactor.** Extract long functions and long JSX lines by responsibility. Keep diffs small and behavior-covered.

**Phase 7: Verification.** Compare request count, time-to-core, time-to-panel, cache-hit rate, stale-hit rate, upstream-miss rate, and error rate against the baseline. Save a checkpoint only when the evidence is better or unchanged with a clear reliability gain.

## Definition of success

The platform is improved when the first meaningful verified data appears quickly, optional panels never block core, changing selections does not cause stale state commits, duplicate stable keys do not produce duplicate upstream calls, daily provider policies remain intact, durable cache outcomes are measurable, and unavailable metrics remain honestly unavailable instead of being replaced with guesses.

The more powerful AI should be judged by these measurable outcomes—not by the size of its refactor or the number of files changed.
