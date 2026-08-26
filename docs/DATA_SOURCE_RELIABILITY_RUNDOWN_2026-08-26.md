# SKIP Baseball Intelligence Platform — Data Source Reliability Rundown

**Purpose.** This guide explains where the platform’s baseball information comes from, what each source is good at, why an official source can still be intermittent, and which improvements are realistic without inventing data or ignoring provider limits.

## Executive Summary

The platform has a sensible source hierarchy. **MLB Stats API** is the operational backbone for schedules, standings, rosters, team/player identity, game state, venue details, and official box-score context. **Baseball Savant** is the advanced Statcast layer for measured pitch, batted-ball, running, and fielding information. Those are the right primary sources because they are close to the underlying game and tracking data.

However, “official” does not mean “a contracted, guaranteed production API.” The app reaches public web/API surfaces that can time out, throttle, return an HTML page instead of the expected machine-readable output, change schema, or briefly become unavailable during high demand. SKIP already protects against much of this with durable caching, shared in-flight requests, stale-data fallback, cooldowns, daily refresh gates, and clear freshness labels. The largest remaining reliability opportunity is **cross-instance coordination**: making request locks and provider budgets durable, rather than relying partly on memory that resets when a server instance changes.

> **Important distinction:** a cached or unavailable value is not automatically a bad value. It is often the honest result of choosing not to repeat a risky upstream request. The platform should prefer a labeled last verified value—or an explicit unavailable state—over a fabricated live metric.

## Current Provider Map

| Source | What SKIP uses it for | Source class | Current refresh and resilience policy | Main limitation |
|---|---|---|---|---|
| **MLB Stats API** | Schedules, standings, rosters, player/team identity, game feeds, venue context, official results, basic stats, service time | Official MLB data surface | Short path-specific cache windows: schedule ~90 seconds, standings ~120 seconds, teams/leaders ~300 seconds, people ~600 seconds; durable cache; stale fallback; in-flight coalescing; 12–20 second upstream timeouts | Public endpoint behavior can be intermittent, rate-limited, slow, or non-JSON during upstream trouble |
| **Baseball Savant / Statcast** | xBA/xwOBA, batted-ball data, OAA, sprint speed, bat tracking, pitch arsenal, raw pitch/event searches | Official MLB Statcast web-export surface | Fresh to the next UTC midnight; week-long stale fallback; durable cache; one shared in-flight request per query; provider cooldowns; daily scheduled warm-up | CSV exports are web-oriented, query-heavy, sometimes return HTML, and do not present a stable formal endpoint contract for every leaderboard |
| **FanGraphs** | Team WAR, divisional WAR, projections, model-based playoff context | Third-party web scrape | Once per UTC day for a team/model key; durable cache; short stale period; parser checks; rate-limit and Cloudflare detection | HTML structure can change; Cloudflare or provider blocking can prevent retrieval; not an official API |
| **PlayoffStatus** | Secondary published postseason probability | Third-party web scrape | 15-minute fresh cache; 24-hour stale fallback; source label retained | Different published model from FanGraphs; HTML can change; should not be converted into a new SKIP probability |
| **Spotrac** | Contract/payout context | Third-party web scrape | Fresh cache for six hours; one-day stale fallback; coalescing | Web markup and access behavior can change; requires terms-of-use review for public product dependence |
| **Baseball-Reference** | Contract fallback, narrow player/identity support | Third-party web scrape | Contract fallback is capped at once per UTC day; no claim is made if a verified contract field is absent | Scrape-based, not real-time, and unsuitable as the main live operational feed |
| **MLB club / league RSS, ESPN, FOX** | News and headlines | Public publisher feeds | Ordered fallback feeds, cache, stale-if-error, and honest empty state | Headline availability and publication timing vary; news is not a stats substitute |
| **NCAA API service** | College/draft-oriented data | Third-party community service | Short path-specific caching and proxy limits | Separate service with its own published capacity limits; not a substitute for MLB data |
| **SKIP calculations** | Clearly labeled derived context from verified official inputs, such as record-based operational calculations | Internal calculation layer | Calculated only after an official input is available; provenance label is required | It can support context, but it must not impersonate provider-owned WAR, odds, salary, or projection values |

## Why MLB Stats API Can Be Intermittent

MLB is the most dependable source for **official game facts**, but the public Stats API endpoint should be treated as an operational feed rather than a commercial service-level agreement. A typical problem is not that a game result is “wrong.” It is that the public endpoint temporarily returns a **429 rate limit**, **503/504 availability or timeout response**, or a response body that is not valid JSON. The proxy already recognizes these cases and returns a labeled controlled response rather than treating an HTML error page as baseball data.

The application currently uses a good layered defense. It caches fast-changing paths for a short time, stores verified responses in the database so another server/session can reuse them, shares a single upstream request when multiple panels ask for the same data at once, and serves a labeled stale value if a verified cache still exists. It also applies a 15-second upstream-failure cooldown per request key. These mechanisms are why a temporary MLB issue should usually degrade one panel instead of causing the whole dashboard to keep retrying.

There are still two structural reasons it cannot be perfectly dependable. First, the public endpoint is outside SKIP’s control: if its service or route is slow, the platform cannot make it respond faster. Second, the app’s basic per-IP limiter is intentionally stored in memory. That stops a common single-instance burst, but separate server instances do not automatically share that memory. A durable request budget and durable in-flight lock would reduce the chance that many cold instances repeat the same MLB miss at once.

## Why Baseball Savant Can Be Intermittent

Baseball Savant is excellent data, but many of the SKIP calls use **CSV downloads attached to a website experience**, not a small, documented, subscription API built for high-frequency application traffic. MLB’s Statcast Search itself cautions that some searches are complicated and can take time to run.[1] The official CSV reference also documents the fields, while making clear that certain tracking definitions and measurement conventions can change by season—for example, 2026 plate-location and ABS-related definitions.[2]

That creates several practical failure modes. A leaderboard URL can return an HTML page rather than CSV; a filter may become client-side only; a column may be renamed or added; and raw pitch-level searches can be much heavier than a basic leaderboard. SKIP detects an HTML response and returns an honest “endpoint may be unavailable” result rather than parsing page markup as CSV. It also filters raw rows conservatively and leaves unavailable values blank instead of guessing.

The right response is **not** to request Savant more frequently. Doing that makes rate limits and temporary blocks more likely. SKIP’s current policy is intentionally conservative: one fresh Savant snapshot per UTC day, cache it durably, allow a week-old labeled stale snapshot if Savant is down, and share concurrent requests. This is appropriate for season-level scouting and model panels. It is not intended to make every Statcast panel pitch-by-pitch live during a game.

## What Is an Upstream Problem Versus an SKIP Problem?

| Symptom | Most likely category | What it means | Correct response |
|---|---|---|---|
| `429`, `Retry-After`, or cooldown label | Upstream protection | The source asked callers to slow down, or the app prevented another call after the source did | Keep cached/stale data; do not retry aggressively |
| `503`/`504` or timeout | Upstream/network | The source did not answer quickly enough | Serve verified stale data if available; retry later with a bounded cooldown |
| Savant response is HTML instead of CSV | Endpoint/export contract change or web layer | The expected download response was replaced by an interactive page, error page, or other HTML | Reject it, retain cached data, and verify the endpoint/parameters before changing code |
| Metric is `Unavailable` with a source label | Honest coverage gap | The provider did not supply a verified value and no safe fallback exists | Keep it unavailable; do not manufacture WAR, odds, contract values, or projections |
| Several panels fetch the same resource | Application-side request design | Duplicate client triggers can multiply provider calls | Coalesce requests and reuse durable snapshots |
| A query works after one browser refresh but not in the app | Source/session behavior or request shape | The public site may respond differently to a browser session, headers, CSV download flow, or load | Compare content type and body, then use the smallest verified request shape |

## What SKIP Is Already Doing Well

The current implementation has several production-quality defenses:

1. **Durable cache.** Verified provider responses are saved with fresh and stale expiry times. This means a newly started server can reuse a prior verified result instead of treating every process start as a provider miss.
2. **Request coalescing.** When multiple panels ask for the same MLB or Savant item at once, one upstream request is shared rather than duplicated.
3. **Stale-if-error.** A temporarily unreachable provider does not erase an earlier verified result; it is returned with a clear stale label and reason.
4. **Cooldowns and daily gates.** Savant, FanGraphs, and scrape-based fallbacks are prevented from retrying repeatedly after a failure or within the same allowed day.
5. **Content validation.** The Savant proxy explicitly rejects HTML when it expected CSV. The MLB proxy explicitly rejects empty or non-JSON responses.
6. **No-fabrication rule.** Provider-owned metrics remain provider-owned. A missing FanGraphs team WAR or probability is not silently replaced by an unrelated number.

The local cache-health read performed during this audit did not trigger an upstream provider call. It showed only current development telemetry for contract and team-financial cache outcomes, so it should not be interpreted as a production-wide MLB/Savant failure rate.

## Best Improvements, Ordered by Value

| Priority | Improvement | Why it helps | Cost / trade-off |
|---|---|---|---|
| **1** | Add **durable provider locks and request budgets** for MLB and Savant | Prevents duplicated upstream calls across cold starts and multiple server instances, not just within one process | Small backend/database change; preserves current sources and provenance |
| **2** | Add a daily **provider contract monitor** | Checks a very small, pre-approved set of endpoints for content type, required columns, and latency; warns before a broken export reaches many panels | Must remain once daily and never expand into broad scraping |
| **3** | Create curated **team and player snapshot tables** for high-traffic views | One verified daily/on-demand refresh can power many UI reads without repeatedly requesting raw sources | Requires defining exactly which panels are allowed to be day-old |
| **4** | Split data by freshness class | Keep game status/schedule short-lived; keep Statcast season snapshots daily; keep contracts and finances less frequent | Requires more explicit UI labels, but improves user expectations |
| **5** | Add a licensed fallback for mission-critical live operations | A contracted provider can offer authenticated APIs, support, and more predictable availability for schedules, play-by-play, and some Statcast data | Ongoing commercial cost, licensing review, key management, and source reconciliation |
| **6** | Keep scrape-only sources as noncritical fallbacks | Avoids turning a markup change into a core dashboard outage | Some metrics remain unavailable when a third-party page changes |

## Data Sources Worth Evaluating

**Sportradar MLB v8** is the strongest candidate if the product needs a paid, supported operational feed. Its documentation describes schedules, standings, real-time scores, injuries, transactions, seasonal data, and optional Statcast packages; it also states that authentication is required.[3] This makes it a possible replacement or corroborating source for **live game operations and critical tracking fields**, not a free drop-in replacement.

**SportsDataIO** is worth evaluating for authenticated scores, odds, projections, stats, news, and images, particularly if the product needs a broader commercial feed mix. Its documentation confirms API-key access and subscription-gated products.[4] It should be evaluated field by field; it is not safe to assume it matches Baseball Savant’s full raw-pitch or advanced tracking coverage.

**Baseball-Reference, Spotrac, and FanGraphs should remain secondary.** They add valuable context, but their current use depends on parsed web pages. They are appropriate for labeled fallbacks or noncritical research views, not as the single live source for an operational front-office dashboard.

## Recommended Next Decision

The highest-value next code task is **durable cross-instance locking for MLB and Savant**. It improves reliability without changing sources, buying a subscription, or increasing call volume. The next operational task is to let the newly registered daily Savant job complete one successful run and inspect its recorded response. After that, choose whether a commercial provider is justified for live game and Statcast coverage.

## References

[1] [Baseball Savant, *Statcast Search*](https://baseballsavant.mlb.com/statcast_search)

[2] [Baseball Savant, *Statcast Search CSV Documentation*](https://baseballsavant.mlb.com/csv-docs)

[3] [Sportradar, *MLB v8 Overview*](https://developer.sportradar.com/baseball/reference/mlb-overview)

[4] [SportsDataIO, *MLB API Documentation*](https://sportsdata.io/developers/api-documentation/mlb)
