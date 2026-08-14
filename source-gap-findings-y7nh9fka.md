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
