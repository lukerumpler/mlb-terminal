# Backend Intelligence Calculations

The intelligence panel now has a backend-derived fallback for projected season wins and losses when FanGraphs projected values are unavailable. The calculation uses the verified MLB Stats API regular-season standings snapshot for the selected team.

| Metric | Calculation | Provenance |
|---|---|---|
| Win percentage | Verified wins divided by verified wins plus losses | MLB Stats API, calculated |
| Projected wins | Win percentage multiplied by 162 games | MLB Stats API, calculated |
| Projected losses | 162 minus calculated projected wins | MLB Stats API, calculated |
| Run differential | Verified runs scored minus verified runs allowed, when both exist | MLB Stats API, calculated |
| Pythagorean win percentage | Runs scored raised to 1.83 divided by the sum of runs scored and runs allowed raised to 1.83 | MLB Stats API, calculated |

The result is cached and coalesced on the backend for the current UTC day. The browser also reuses the returned calculation through the same UTC-day boundary. The UI labels these values **MLB Stats API · calculated** and explains that projected wins and losses are calculated from verified standings and are not official playoff odds.

This calculation does not overwrite or redefine FanGraphs WAR, offensive WAR, defensive WAR, pitching WAR, or official playoff odds. If FanGraphs supplies a model-specific projected value, that provider-reported value remains primary. If no verified input exists, the panel remains unavailable rather than calculating from incomplete fields.
