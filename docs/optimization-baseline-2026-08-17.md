# Optimization Baseline — 2026-08-17

## Production release under review

The current GitHub-backed production deployment is `dpl_83eDuiUoxiJrK5AM3nfotxoZpMLY`, built from commit `9aeea29996ca681ffeec64df7beb789e2f79419b`. Vercel’s build log confirms the package-level Node 22 override was applied over the project default Node 24 setting. A fresh `/api/savant` request returned HTTP 200 on that deployment without the previous `DEP0169` warning. The current public Overview browser smoke suite passed 2/2.

## Vercel operational baseline

| Metric | Observation |
| --- | --- |
| Production requests, last 24 hours | 158 HTTP 200, 4 HTTP 502, 1 HTTP 400. |
| Runtime error groups, last 24 hours | One historical `DEP0169` group: 92 occurrences, last seen 2026-08-17T16:58:03Z on the superseded Node 24 deployment `dpl_3KCxHpNgF46m7pzCTuNicwGHX3Po`. |
| HTTP 502 route attribution | All four were `/api/fangraphs-models`, on the earlier `dpl_6hTadWPadH5ZyVbguhvK8Mai1Tii` deployment. |
| FanGraphs failure window | Four upstream model failures occurred between 16:45:27 and 16:47:50 UTC; no application exception stack was recorded. |
| Current project environment configuration | Authenticated Vercel settings show no project environment variables. `OAUTH_SERVER_URL`, `ALLOWED_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, and `OWNER_OPEN_ID` are absent. |

## FanGraphs endpoint audit

`server/api/fangraphs-models.js` already provides request coalescing, successful-response daily caching, one-hour stale retention, 15-second failure cooldowns, 30-second 429 cooldowns, and clearly labelled stale-cache responses. On a cold serverless instance with no cache, both FanGraphs upstream model pages failing results in an intentional HTTP 502. Existing UI behavior must therefore be examined for graceful calculated-fallback presentation, cold-start request deduplication, and redundant model requests before making a safe optimization.

## External references

- [Node.js DEP0169 documentation](https://nodejs.org/api/deprecations.html)
- [Node.js issue 61724: Node 24/25 legacy URL API warning behavior](https://github.com/nodejs/node/issues/61724)
- [Vercel Node version configuration](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

## Live Overview baseline

The initial public Overview render displayed progressive skeletons while primary team data loaded, then settled successfully into a fully populated Los Angeles Dodgers dashboard. MLB standings, team aggregates, roster leaders, venue information, Savant summary, batted-ball profile, pitch arsenal, contact-quality-against panel, and the local roster-insight fallback all loaded. The visible FanGraphs division panel remained intentionally marked **Coverage Gap**, while team WAR, projected wins/losses, and playoff estimate transparently used calculated MLB standings fallbacks. This behavior is accurate and properly labelled, but the above-the-fold provider work remains a candidate for lower-request, faster-settling optimization.

## Confirmed FanGraphs parser coverage gap

The current production endpoint `/api/fangraphs-models?team=LAD&season=2026` returned HTTP 200 with `freshness: "live"`, but every verified model field was null and both source statuses were `unparsed`. This confirms a successful upstream HTML fetch paired with a schema or team-identifier parsing mismatch, not an upstream HTTP failure. The Overview correctly renders calculated MLB standings fallbacks and an explicit FanGraphs coverage gap; the next debugging step is to inspect the upstream markup and strengthen parsing only where live structure supports it.

## Verified live provider structures

The live [FanGraphs 2026 MLB Playoff Odds table](https://www.fangraphs.com/standings/playoff-odds/fg/mlb) lists the Dodgers by nickname, not `LAD`, and exposes the headers `Proj W`, `Proj L`, and `Make Playoffs`. At the observed snapshot the Dodgers row showed 96.9 projected wins, 65.1 projected losses, and 100.0% make-playoffs probability. The endpoint parser previously recognized only abbreviation-style row matching and longer key names, explaining the `unparsed` response.

The production Baseball Savant `pitch_arsenal` response was verified to expose `player_id`, `team_name_alt`, `pitch_type`, and `velocity`. This supports replacing up to 12 player-scoped pitch queries with one cached league pitch-arsenal query filtered to the current roster IDs, while retaining player-scoped requests only as an exact-data fallback.
