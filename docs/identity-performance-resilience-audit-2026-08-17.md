# Identity Performance and Resilience Audit — 2026-08-17

## Scope and telemetry retention

This audit analyzed the existing identity-resolution telemetry, added aggregate latency summaries, stress-tested the API rate limiter, and simulated a Baseball-Reference recovery through the real profile workflow. The resolver remains intentionally privacy-safe: it stores only aggregate counters and aggregate duration statistics. It does not retain player names, provider IDs, canonical URLs, request payloads, or client IP addresses.

> Process-level metrics reset on a server restart or hot reload. The live process had reset to zero by the end of this audit, so persistent historical comparison is not available from the server metric endpoint alone. The exact results below come from saved E2E telemetry artifacts and a deterministic resolver benchmark.

## Identity hit rates and latency

The controlled benchmark made three successful resolver calls: one direct canonical-ID verification, one exact name search, and one warm server-registry reuse. Provider delays of 40 ms for direct canonical retrieval and 100 ms for name search were injected solely to compare code paths deterministically; these figures are **not production network measurements**.

| Measure | Exact result | Interpretation |
| --- | ---: | --- |
| Direct-ID request rate | 66.7% | 2 of 3 resolver calls supplied a verified Baseball-Reference ID. |
| Browser-registry reuse rate | 100.0% | Both direct-ID calls were sourced from the persistent browser registry. |
| Warm server-registry hit rate | 33.3% | 1 of 3 calls was served from the seven-day in-memory registry. |
| Direct canonical verification rate | 100.0% | The direct canonical page exactly matched the requested player name. |
| Exact name-search match rate | 100.0% | The benchmark name search produced an exact normalized-name match. |
| Direct canonical average latency | 89 ms | One sampled direct canonical verification. |
| Name-search average latency | 102 ms | One sampled exact search. |
| Warm registry average latency | 0 ms at millisecond resolution | The in-memory response completed in under one measured millisecond. |

The direct-ID path saved **13 ms (12.7%)** against the controlled name-search path. A warm registry hit saved **102 ms** at millisecond resolution against the same controlled search path. Because this was one deterministic sample per path, the relative comparison is valid for the benchmark but should not be interpreted as a production percentile.

The earlier browser E2E artifacts recorded one profile resolution on each viewport. Both desktop and mobile reused the browser registry and made a direct-ID request; neither made a name search. Baseball-Reference was externally unavailable at that time, so each direct-ID path safely invalidated its stored mapping instead of accepting uncertain data.

## Rate-limiter stress verification

A controlled burst of 45 concurrent requests targeted the cached intelligence endpoint, so it did not multiply upstream MLB traffic. The configured limit is 30 requests in 10 seconds per client/window.

| Stress-test assertion | Result |
| --- | --- |
| Concurrent burst size | 45 requests |
| Allowed responses | 30 HTTP 200 |
| Rate-limited responses | 15 HTTP 429 |
| Unexpected statuses | 0 |
| `Retry-After` header | `10` on every HTTP 429 response |
| Retry delay observed | 10,150 ms, honoring the advertised window plus a 150 ms margin |
| Post-window retry | HTTP 200 in 3.5 ms |
| Allowed-response p95 | 42.9 ms |
| Rate-limited-response p95 | 45.3 ms |

The existing E2E verifier and the new stress harness both respect `Retry-After`; neither bypasses the rate limiter. This confirms the expected user-facing behavior under burst load: actionable HTTP 429 responses, a ten-second backoff instruction, then normal service after the window.

## Baseball-Reference recovery transition

The client had one recovery-blocking edge case: an MLB-only fallback object from an unavailable provider was stored in the short-lived identity promise cache, potentially delaying the next recovery attempt. The cache now preserves that object for the current render but immediately removes it from the resolution cache because it is not a usable exact provider identity.

The browser simulation intercepted only the provider resolver. The first profile load returned an unavailable Baseball-Reference mapping; after an application reload, the second returned an exact canonical mapping. The profile data-confidence strip changed as follows:

| Resolution pass | Provider response | Confidence-strip result | Browser request failures |
| --- | --- | --- | --- |
| Initial fallback | MLB identity only; no Baseball-Reference mapping | **B-Ref ID · Unavailable** | 0 |
| Simulated recovery | Exact canonical ID `ohtansh01`, verified name | **B-Ref ID · Exact name** | 0 |

The recovery regression also verifies that the exact ID detail returns to the source-check object and the recovered identity is written into the persistent cross-provider registry.

## Validation and reproducibility

The following reusable scripts are now part of the repository:

```bash
node scripts/identity-telemetry-latency-benchmark.mjs
node scripts/rate-limit-stress-test.mjs
node scripts/e2e-bref-recovery-transition.mjs
```

The final focused validation passed **27 tests across four files**. TypeScript validation and the production build also passed.
