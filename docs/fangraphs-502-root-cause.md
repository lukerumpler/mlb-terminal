# FanGraphs 502 Root-Cause Diagnosis

## Conclusion

The current FanGraphs 502 is caused by **provider-side Cloudflare challenge blocking**, not by an API key, a missing season parameter, or a parser selector mismatch at this stage. A passive request to every exact upstream URL used by the proxy returned HTTP 403 with an HTML body titled `Just a moment...` and Cloudflare challenge markers.

| Proxy purpose | Exact upstream path | Observed response | Interpretation |
|---|---|---:|---|
| Playoff odds | `/standings/playoff-odds/fg/mlb` | 403, HTML challenge | Cloudflare blocks the proxy request before real odds HTML is delivered. |
| Team WAR | `/depthcharts.aspx?position=Team` | 403, HTML challenge | Cloudflare blocks the proxy request before the depth-chart table is delivered. |
| Batting WAR | `/leaders-legacy.aspx?...stats=bat...season=2026...` | 403, HTML challenge | Aggregate parser receives no real batting table. |
| Pitching WAR | `/leaders-legacy.aspx?...stats=pit...season=2026...` | 403, HTML challenge | Aggregate parser receives no real pitching table. |

## Code evidence

`server/api/fangraphs-models.js` currently uses the four URLs above, sends `User-Agent: Mozilla/5.0 (compatible; SKIPBaseball/1.0)`, accepts HTML, follows redirects, and aborts after 10 seconds. It does not use an API key or authenticated FanGraphs session. When both model pages fail, the handler intentionally converts the upstream failure into HTTP 502 with `FanGraphs model sources unavailable`. When both aggregate pages fail, it converts the result into HTTP 502 with `FanGraphs aggregate Team WAR unavailable`.

The parser functions `parseFanGraphsModelHtml()` and `parseFanGraphsAggregateWarHtml()` are therefore not receiving FanGraphs content during the observed failure. They cannot match tables or selectors against a Cloudflare challenge page. A parser rewrite may still be needed after access is restored, but it is not the cause of the current blank metrics.

## Safe remediation boundary

The application should not attempt to solve this by rotating User-Agent strings, solving a CAPTCHA, bypassing Cloudflare, or aggressively retrying. Those actions would be unreliable and could increase provider load. The existing 15-minute server cache, in-flight coalescing, cooldowns, and seven-day browser fallback should remain in place.

Safe next options are: obtain an approved FanGraphs data/API access path; use a permitted authenticated connector or licensed data source; or improve diagnostics so the UI distinguishes `provider blocked` from a generic 502. Until an approved source is available, the local stale snapshot is the correct way to keep previously verified metrics visible without fabricating new values.

## Diagnostic improvement

The proxy now inspects only HTTP 403 error bodies for Cloudflare challenge markers and returns a structured `providerBlocked` flag. The client preserves that metadata, and Overview displays **Provider Blocked** with the freshness line **provider blocked by upstream protection**. This is a diagnostic correction, not a bypass: the proxy still makes the same coalesced requests, keeps the existing cooldowns, and does not rotate headers or solve challenges.

Focused provider-blocked, parser, fallback, StatusBadge, and rendered Overview tests passed. The complete suite passed with 86 test files and 409 tests; type-check and production build also passed. Actual FanGraphs recovery remains blocked until an approved access path or alternate provider is available.
