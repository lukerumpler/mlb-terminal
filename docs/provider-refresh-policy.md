# Provider Refresh Policy

The platform uses a fixed **UTC-day refresh boundary** for the high-impact FanGraphs model data used by playoff-odds and team-WAR panels. A successful model or aggregate-WAR snapshot remains server-cacheable until the next UTC midnight. After the first refresh attempt for a team/season or aggregate season on a UTC day, later requests reuse the snapshot or return an explicit daily-suppression response; they do not reopen FanGraphs.

The browser uses the same boundary for FanGraphs model and aggregate-WAR responses. Successful responses are reused through UTC midnight. If the provider fails, a verified local snapshot can be served for up to seven days with `stale-local` provenance, and the stale result is cached for the remainder of that UTC day to prevent repeated browser retries.

The Baseball-Reference fallback in the contract path is keyed by normalized player name and UTC day. It coalesces concurrent requests, records both successful and failed attempts, and does not retry the same player’s BRef lookup again until the next UTC day. It does not alter the primary Spotrac or official MLB Stats API behavior.

No metric definitions were changed. FanGraphs remains the provider for its model-specific playoff-odds and team-WAR fields. Baseball-Reference remains a contract fallback only in the existing contract path. MLB Stats API values remain official metadata or contract hydration where already supported. Playoff odds are never estimated: when no verified provider value is available, the UI must keep the metric unavailable and identify the provider state.

## Provenance states

| State | Meaning |
|---|---|
| `live` | Fresh provider response was parsed and accepted. |
| `cached` / `HIT` | A verified same-day server or browser snapshot was reused. |
| `daily-cached` / `DAILY` | The UTC-day refresh was already attempted; the existing verified snapshot was reused. |
| `stale-cached` / `STALE` | A verified older server snapshot was used during a bounded failure or cooldown fallback. |
| `stale-local` | A browser-persistent snapshot, no older than seven days, was used after refresh failure. |
| `provider blocked` | The upstream returned a recognized protection page or blocking response; no bypass is attempted. |
| `Unavailable` | No verified source value is available. |

## Validation completed

The focused provider-policy suite passed with 20 tests, including UTC-midnight transition behavior, same-day duplicate suppression, BRef retry-after-midnight behavior, FanGraphs stale fallback, provider-blocked handling, and distinct 429 cooldown semantics. TypeScript checking, the complete Vitest suite, and the production build also passed.
