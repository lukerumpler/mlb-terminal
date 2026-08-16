# Resilience & Fault-Tolerance Guide

The SKIP API and client architecture are engineered to withstand transient network failures, upstream rate limits (HTTP 429), and third-party downtime without cascading errors or corrupting data integrity.

## Key Resilience Mechanisms

1. **Request Coalescing & Rate Limiting**
   - Identical concurrent requests to external data proxies are coalesced into a single upstream fetch.
   - Client-side queues and exponential backoff protect upstream endpoints against rate limits.

2. **Stale-If-Error Caching**
   - Server-side and client-side caches retain valid snapshots past their normal Time-To-Live (TTL).
   - If an upstream API returns a 5xx error or times out, the proxy serves the last known successful snapshot with an explicit `stale-cached` freshness indicator and header (`X-Provider-Cache: STALE`).

3. **Cooldowns and Circuit Breakers**
   - When a provider repeatedly fails or triggers rate limits, a temporary cooldown is applied to prevent hammer loops.
   - Clear failure states and retry controls allow users and tests to re-trigger provider requests safely.

4. **Zero Fabrication Policy**
   - When upstream data is missing, rate-limited, or unavailable, proxies and UI components return explicit `null` or `Unavailable` states rather than generating mock or synthetic values.
