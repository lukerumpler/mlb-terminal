# WAR Source Assessment — 2026-08-26

## Public source findings

| Coverage | Source | Evidence | Integration note |
|---|---|---|---|
| Current MLB player WAR leaders | ESPN MLB WAR Leaders | The current seasonal leaderboard exposes player, WAR, offensive, and defensive fields, and attributes WAR data to Baseball-Reference. | Can support a transparent public leaderboard fallback, but player identity matching and rate/terms compliance must be handled explicitly. |
| Current player WAR leaders | Baseball-Reference MLB Leaders | The 2026 leader page exposes combined, position-player, and pitcher WAR leader categories. | Existing SKIP player provider already uses Baseball-Reference player summary data; any expanded parser must preserve unavailability when a named player is not returned. |
| Team/position WAR context | Baseball-Reference Team Position Comparison | Current season page exposes team WAR-related position tables and explains that WAR/WAA values are prorated from player-team totals. | Suitable for labelled team-position context; it must not be mislabeled as the same metric as FanGraphs Team WAR. |
| Current Team WAR | FanGraphs Team WAR / aggregate pages | Existing SKIP integration reads FanGraphs Team WAR, but known upstream blocking can make this unavailable. | Retain explicit unavailable and stale-cache behavior; do not replace with a proxy while the source is absent. |

## Constraints

- MLB Stats API does not publish a canonical WAR field, so it cannot provide a verified replacement for WAR displays by itself.
- FanGraphs WAR, Baseball-Reference WAR, and ESPN’s Baseball-Reference-provided WAR should not be combined in one comparison population without a visible source label.
- Prospect `projWar` and fixed historical trade `netWAR` are distinct, non-live datasets. They need scope labels rather than substitution with current-season player WAR.

## Sources

- https://www.espn.com/mlb/war/leaders
- https://www.baseball-reference.com/leagues/MLB-leaders.shtml
- https://www.baseball-reference.com/leagues/team_compare.cgi
- https://www.fangraphs.com/depthcharts.aspx?position=Team

## Browser verification

The full ESPN seasonal route was successfully rendered in the connected browser on 2026-08-26. The route accepted the `count/151` pagination position and displayed ranks 151 onward with player, WAR, OFF, DEF, WAA, TRPG, ORPG, RAA, and WAAWP columns. The page explicitly attributes its WAR data to Baseball-Reference. This confirms a human browser can access the table, but it does not establish a deployable server-to-server API: direct server probes returned only ESPN shell markup, while direct FanGraphs requests returned a Cloudflare challenge.
