# Provider Refresh Policy

The platform uses a fixed **UTC-day refresh boundary** for the high-impact FanGraphs model data used by playoff-odds and team-WAR panels. A successful model or aggregate-WAR snapshot remains server-cacheable until the next UTC midnight. After the first refresh attempt for a team/season or aggregate season on a UTC day, later requests reuse the snapshot or return an explicit daily-suppression response; they do not reopen FanGraphs.

**Exception: aggregate team WAR after a refresh that returned nothing.** If both FanGraphs and the Baseball-Reference fallback fail (a timeout, a 5xx, a network error), the day is no longer locked for everyone until UTC midnight. The aggregate loader may try again, bounded: at most `PROVIDER_RETRY_MAX_PER_DAY` attempts per UTC day in total (default 3), never sooner than `PROVIDER_RETRY_MIN_GAP_SECONDS` after the previous attempt (default 1800). Three things are unchanged: a refresh that returned data is final for the day, a refresh the provider *blocked* (a recognised Cloudflare challenge) is final for the day and is never retried, and a 429 still honours its `Retry-After` cooldown. While a retry is not yet allowed, the suppression response carries `retryAfter`. Set `PROVIDER_RETRY_MAX_PER_DAY=1` to restore the strictly-once behaviour. The per-team model loader and the Savant and contract paths keep the original once-per-day rule.

Not covered: when only one provider answered (for example FanGraphs succeeded and Baseball-Reference failed once), that single-source result is still final for the day, because filling in the missing side would mean reopening FanGraphs. The row is labelled `single-source` so this is visible.

The browser uses the same boundary for FanGraphs model and aggregate-WAR responses. Successful responses are reused through UTC midnight. If the provider fails, a verified local snapshot can be served for up to seven days with `stale-local` provenance. That stale result is reused for 15 minutes (never past UTC midnight) so a failing provider is not re-requested on every render, but a long-lived tab picks up a server recovery instead of staying on stale data until midnight.

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
