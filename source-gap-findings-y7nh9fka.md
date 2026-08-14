# Source Gap Findings

## Exit Velocity Distribution

Official Baseball Savant documentation confirms that Statcast Search supports queries by team and season, and that `launch_speed` is the tracked exit velocity field. The official Statcast Search page also exposes Team as a filter and includes Team / Team & Year grouping options.

Sources:

- https://baseballsavant.mlb.com/csv-docs — defines `launch_speed` as exit velocity of the batted ball and documents related fields such as `launch_angle`, `bb_type`, and `launch_speed_angle`.
- https://baseballsavant.mlb.com/statcast_search — states that queries can be made per-team and per-season and lists team grouping plus exit-velocity metrics.

## Existing implementation gap

`client/src/pages/OverviewPage.jsx` currently sets `const evBins = [];` and renders `Exit Velocity Distribution` as a permanent Coverage gap. `server/api/savant.js` already proxies player-scoped raw Statcast Search requests but has no team-scoped exit-velocity endpoint. `client/src/api/mlb.js` has no corresponding team exit-velocity helper.

## Safe implementation direction

Add a dedicated team-scoped Savant Search endpoint that requests raw season batted-ball rows for a team, filters to rows with verified `launch_speed`, trims the response to only the chart fields, and lets the client aggregate real launch-speed bins. If the upstream query returns no rows or fails, preserve an explicit unavailable state with the source and reason rather than creating proxy values.

## Broader Source Gap inventory

| Surface | Current state | Verified source status | Scope decision |
|---|---|---|---|
| Team Overview — Playoff Odds | Source gap when FanGraphs response is absent | FanGraphs model endpoint is connected and already exposes freshness/status | Keep explicit source-aware fallback; do not infer odds |
| Team Overview — Team WAR | Source gap when FanGraphs response is absent | FanGraphs model endpoint is connected and already exposes freshness/status | Keep explicit source-aware fallback; do not infer WAR |
| Team Overview — Batted Ball Profile | Coverage gap | MLB aggregate team stats do not include Statcast batted-ball fields; player-level Statcast fields exist | Preserve explicit unavailable state; requires a separate team or roster rollup implementation |
| Team Overview — Pitch Arsenal | Coverage gap | Savant pitch arsenal is player/pitcher scoped in the current implementation | Preserve explicit unavailable state; no seeded team values |
| Team Overview — Contact Quality Allowed | Coverage gap | Opponent-level team Statcast rows are not currently connected | Preserve explicit unavailable state; no proxy values |
| Team Overview — Spray Chart | Coverage gap | Requires verified batted-ball coordinates; no current team query is connected | Preserve explicit unavailable state |
| Team Overview — FIP / OAA / BsR | Source gap | MLB aggregate endpoint does not expose these team metrics in the current contract; OAA/BsR need dedicated Statcast or play-by-play feeds | Preserve explicit unavailable state |
| Player Profile — injury line | Unavailable | No authoritative injury feed is connected | Preserve explicit unavailable state |
| Player Profile — contract/financial details | Source-aware | Spotrac / MLB Stats API responses are already surfaced with source copy | Preserve source labels and identity-only caveats when applicable |
| Player Profile — Statcast panels | Source-aware | Baseball Savant player-scoped data is connected for available panels | Preserve empty/unavailable states when a player query returns no verified rows |

The current remediation scope is intentionally limited to Exit Velocity Distribution: it now attempts a direct team-scoped Savant query and falls back to a verified rollup of player-scoped Statcast contact rows. Remaining gaps are kept explicit because no verified connected team-level source is currently available in this codebase.
