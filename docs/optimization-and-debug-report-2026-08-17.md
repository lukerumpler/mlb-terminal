# MLB Terminal Deep Debug and Optimization Report

**Date:** 2026-08-17  
**Scope:** Production data loading, provider resilience, request pressure, and release validation  
**Prepared by:** Manus AI

## Executive summary

The optimization pass identified two concrete sources of avoidable production load and one live data-population defect. The Overview page previously expanded roster pitch data into up to twelve individual Baseball Savant pitcher requests, even though the verified `pitch_arsenal` feed already provides roster-filterable pitch-type data. It also downloaded two league-wide Savant leaderboards despite rendering the same visible xwOBA and exit-velocity tiles from the verified team batted-ball query whenever that direct query was available. Finally, the live FanGraphs playoff-odds page had changed from abbreviation-style team labels and long metric headers to nickname rows and abbreviated projection headers, causing the application to label a successful fetch as `unparsed` and fall back to calculated values.

The release replaces the twelve player-scoped pitch calls with one cached league pitch-arsenal query filtered to the verified roster, retaining the former player-scoped path solely as a failure fallback. It defers full-league Savant summary downloads until the direct team batted-ball query is unavailable. It also strengthens FanGraphs parsing with all-team nickname aliases and header-aware support for `Proj W`, `Proj L`, and `Make Playoffs`. Calculated fallback values remain explicitly labelled and no telemetry behavior, strict identity mapping, or rate-limit contract was weakened.

## Observed production findings

| Finding | Evidence | Resolution |
|---|---|---|
| FanGraphs values were not populating despite a successful live response | `/api/fangraphs-models?team=LAD&season=2026` returned `freshness: live` with `playoffOdds`, WAR, and projections set to null and `unparsed` statuses. | The parser now matches current team nicknames and current header names before using controlled fallback parsing. |
| Overview created excessive Savant request fan-out | The old roster rollup could issue up to 12 player-scoped pitcher requests after direct team batted-ball calls. | One shared cached `pitch_arsenal` request is filtered to active pitcher IDs; exact player queries remain a fallback only. |
| Full-league Savant summary queries were redundant for normal team renders | The Overview already overrides summary xwOBA and exit velocity with direct verified team batted-ball rows when present. | The full-league summary is now requested only if direct team batted-ball data is unavailable. |
| Provider protection must remain intact | The project enforces both client-side request queuing and server-side rate limiting with retry handling. | No threshold, bypass, or test exception was changed. |

## Live provider verification

The live FanGraphs MLB playoff-odds table identifies the Los Angeles club as `Dodgers` and provides `Proj W`, `Proj L`, and `Make Playoffs` columns. At the sampled time, those values were 96.9, 65.1, and 100.0%, respectively. The production Baseball Savant `pitch_arsenal` response provides `player_id`, `team_name_alt`, `pitch_type`, and `velocity`, allowing safe roster filtering and direct `velocity` to `release_speed` normalization.[1] [2]

## Validation evidence

| Gate | Result |
|---|---:|
| Focused optimization tests | 46 passed across request-cache, Savant snapshot, FanGraphs parser, and Overview provider-state suites. |
| Full automated suite | 445 passed, 2 explicitly skipped; 91 files passed and 1 skipped. |
| Type validation | Passed (`pnpm check`). |
| Formatting gate | Passed (`pnpm lint`). |
| Production client/server build | Passed; 2,513 modules transformed. |
| Rate-limit behavior | Preserved; the shared rate-limit tests remain included in the successful full suite. |

## Remaining operational configuration

The Vercel project still lacks the required production environment values, including `OAUTH_SERVER_URL`, `ALLOWED_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, and `OWNER_OPEN_ID`. This release does not fabricate or add secret values. The public data experience is validated, but authentication- and database-dependent paths remain unconfigured until those values are securely provided through project settings.

## References

[1]: https://www.fangraphs.com/standings/playoff-odds/fg/mlb "FanGraphs MLB Playoff Odds"
[2]: https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats "Baseball Savant Pitch Arsenal"
