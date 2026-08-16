# Baseball Savant Endpoint Verification — 2026-08-16

The current `server/api/savant.js` builds leaderboard URLs with `csv=true`, uses `Accept: text/csv,*/*`, follows redirects, reads the response body, rejects bodies beginning with `<!DOCTYPE` or `<html`, and only then parses CSV. Therefore an HTML response is not silently parsed as valid rows; it returns HTTP 502 with `Savant returned HTML — endpoint may be unavailable for this year` and can serve a stale snapshot when one exists.

Direct live fetches through the web extraction service returned CSV for the exact URL families used by the app. The responses began with CSV headers and data rows:

| Endpoint | URL | Observed response |
|---|---|---|
| Outs Above Average | https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Batter&year=2026&team=&range=year&min=1&pos=&roles=&viz=Show&csv=true | CSV beginning with `last_name, first_name`, `player_id`, `fielding_runs_prevented`, and `outs_above_average` |
| Expected statistics | https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=2026&position=&team=&min=1&csv=true | CSV beginning with expected-stat headers and rows such as Henderson, Gunnar |
| Statcast leaderboard | https://baseballsavant.mlb.com/statcast_leaderboard?year=2026&abs=0&player_type=batter&min_pa=1&csv=true | CSV beginning with `last_name, first_name`, `player_id`, `attempts`, and batted-ball fields |
| Bat tracking | https://baseballsavant.mlb.com/leaderboard/bat-tracking?attackZone=&batSide=&contactType=&count=&csv=true&handedness=&minSwings=1&minGroupSwings=1&pitchType=&seasonStart=2026&seasonEnd=2026&team=&type=batter | CSV beginning with `id`, `name`, `swings_competitive`, and bat-tracking fields |
| Sprint speed | https://baseballsavant.mlb.com/sprint_speed_leaderboard?year=2026&position=&team=&min=0&csv=true | CSV beginning with `last_name, first_name`, `player_id`, `team_id`, and `sprint_speed` |

The evidence does not support the claim that the `?csv=true` leaderboard pattern universally returns the interactive HTML page. It is possible that a different request client, headers, date, endpoint, or deployment path behaves differently, but the current proxy already detects HTML explicitly. The next diagnostic should capture the current proxy’s `Content-Type`, status, and first response characters on a controlled test or production log path for the exact endpoint that is failing. Do not replace the URL pattern based only on the HTML hypothesis.
