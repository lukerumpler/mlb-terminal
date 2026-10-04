# Whole-Website Data Audit — Official Source Notes

Audit baseline: `skip-baseball-v75.zip` and the current Manus project. Audit date: 2026-08-13.

## Official source endpoints and pages

The official MLB Stats API is the authoritative endpoint family for players, teams, rosters, standings, schedules, and standard statistics. The public landing page redirects to MLB authentication for documentation, but the JSON endpoints used by the application remain directly queryable under `https://statsapi.mlb.com/api/v1/`.

Base URL: https://statsapi.mlb.com/api/v1/

The official Baseball Savant league page is the authoritative MLB source for Statcast, expected statistics, batted-ball profile, pitch metrics, and defensive/advanced metric context: https://baseballsavant.mlb.com/league

Baseball Savant exposes a 2026 season selector and displays league standings plus Statcast hitting tables that include PA, AB, H, 2B, 3B, HR, BB, SO, BA, OBP, SLG, wOBA, wOBAcon, pitches, hits, runs, barrels, barrel rate, hard-hit rate, exit velocity, launch angle, xBA, xSLG, xwOBA, and xwOBACON.

The official MLB prospect statistics page is available at https://www.mlb.com/prospects/stats/top-prospects and the prospect tracker at https://www.mlb.com/prospects/stats/player-tracker.

## Immediate source-audit observations

The v75 static data catalog contains a 2026 season marker, 30 team records, a 2026 top-prospect catalog, static batting and pitching leaderboards, draft data, trade-history data, and other curated records. The team records are partial snapshots and include fields such as wins, losses, runs, runs allowed, ERA, OPS, HR, AVG, OBP, SLG, WHIP, strikeouts, stolen bases, wRC+, FIP, DRS, BsR, WAR, and division. These fields must be validated separately because the MLB Stats API does not provide all advanced metrics in the same team endpoint.

The v75 code also includes live API adapters for MLB, NCAA, feed, contract, and Savant data. The full audit must distinguish official live responses, curated but dated records, derived estimates, and fallback/mock data. Any metric not available from an authoritative source must be labeled as estimated, illustrative, unavailable, or removed from a current-stat view rather than presented as an official number.

## Source policy for the implementation

Use MLB Stats API for standard MLB player/team/standings/roster/schedule data, Baseball Savant for Statcast-derived fields, MLB.com prospect pages/MLB Stats API for prospect identity and minor-league records, and NCAA/statistical provider responses for college records. Never silently substitute a static snapshot for a current live record. Preserve the existing UI and tab structure while correcting the shared data paths and labels.
