# Playoff-Odds Provider Review — 2026-08-18

FanGraphs remains the primary projection source. Its public MLB Playoff Odds page explicitly presents team postseason probabilities and publishes an update time, which can be carried to the Team Overview as the last verified timestamp.[1]

| Candidate | Evidence reviewed | Integration decision |
|---|---|---|
| FanGraphs | Public team playoff-odds page with an explicit “Updated” timestamp. | Primary source; surface its verified retrieval time next to a live or cached team-specific percentage. |
| SportsDataIO | Official MLB API documentation states requests use an API key and describes MLB odds, projections, and related feeds. | Viable credentialed secondary provider, subject to confirming the subscribed feed exposes a team make-postseason market or probability. |
| The Odds API | Official MLB documentation covers game moneyline, spread, total, and player-prop markets. | Not selected for postseason-probability fallback because the reviewed MLB API scope does not establish a team make-postseason probability feed. |
| OpticOdds | A disabled task connector exists, but its documented task description only confirms real-time sportsbook odds, props, and results. | Do not enable or use until a verified make-postseason market and user approval are available. |

> The application must not translate generic futures, win totals, game lines, or standings pace into a playoff percentage. Until a vetted provider supplies a team-specific make-postseason value, the metric remains explicitly unavailable and the verified standings-context panel provides decision support instead.

## References

[1]: https://www.fangraphs.com/standings/playoff-odds/fg/div "FanGraphs MLB Playoff Odds"
[2]: https://sportsdata.io/developers/api-documentation/mlb "SportsDataIO MLB API Documentation"
[3]: https://the-odds-api.com/sports-odds-data/mlb-odds.html "The Odds API MLB Odds Documentation"

## Live verification

On August 18, 2026, the FanGraphs adapter returned no parsed Dodgers postseason value from its cached response. The independent PlayoffStatus adapter returned the displayed `>99%` Wild Card Series probability for the Dodgers, together with its page update text and the application retrieval timestamp. The Team Overview Performance workspace rendered the separate MLB standings-context panel with a 75–51 record, first place in the National League West, games back, recent form, streak, and division leader. These fields are explicitly described as verified standings context rather than a new playoff percentage.

The initial browser rendering continued to show the primary-unavailable label while the new secondary request path was investigated. The live endpoint itself returned the verified secondary payload, so the remaining validation work is limited to ensuring that this source reaches the client view after the lazy Performance-workspace request.

The client guard was corrected so a missing primary value (`null`) is no longer coerced to numeric zero before deciding whether to call the secondary source. This preserves the intended behavior: FanGraphs is preferred only for a real team-specific percentage; otherwise the Performance workspace requests the independent source.
