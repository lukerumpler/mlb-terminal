# SKIP Data Audit Sources

Audit date: 2026-08-13. The application is configured for the 2026 season.

## Authoritative sources

- [MLB Stats API player profile: Shohei Ohtani](https://statsapi.mlb.com/api/v1/people/660271?hydrate=currentTeam)
- [MLB Stats API season stats: Shohei Ohtani](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season&season=2026&group=hitting,pitching)
- [MLB Stats API player search: Bryce Eldridge](https://statsapi.mlb.com/api/v1/people/search?names=Bryce%20Eldridge)
- [MLB Stats API player profile: Bryce Eldridge](https://statsapi.mlb.com/api/v1/people/805811?hydrate=currentTeam,rosterEntries)
- [MLB Stats API season stats: Bryce Eldridge](https://statsapi.mlb.com/api/v1/people/805811/stats?stats=season&season=2026&group=hitting)
- [MLB Stats API 2026 regular-season standings](https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason&hydrate=team)
- [MLB Stats API Padres 2026 hitting stats](https://statsapi.mlb.com/api/v1/teams/135/stats?stats=season&season=2026&group=hitting&sportIds=1)
- [MLB Stats API Padres 2026 pitching stats](https://statsapi.mlb.com/api/v1/teams/135/stats?stats=season&season=2026&group=pitching&sportIds=1)
- [MLB.com Ohtani 2026 news](https://www.mlb.com/news/shohei-ohtani-hits-10th-leadoff-homer-of-2026)
- [MLB.com Bryce Eldridge 2026 news](https://www.mlb.com/news/bryce-eldridge-has-earned-spot-on-giants-ahead-of-trade-deadline)
- [MLB.com Padres 2026 standings](https://www.mlb.com/padres/standings/league)

## Verified records

### Shohei Ohtani

The MLB Stats API identifies player ID `660271` as Shohei Ohtani, a Dodgers player. The 2026 season response reports 115 games and 509 plate appearances as a hitter with 125 hits, 77 runs, 27 home runs, 74 RBI, 69 walks, 117 strikeouts, a .292 AVG, .393 OBP, .544 SLG, and .937 OPS. The same response reports 14 pitching games/starts, 85.2 innings, an 8-2 record, 95 strikeouts, 26 walks, a 1.79 ERA, and a 0.95 WHIP.

The static application record in `client/src/constants/data.js` currently shows a materially different partial line (352 PA, .310/.412/.641, 18 HR, 5.8 WAR). That record is not current and must not be used as the authoritative 2026 Ohtani line.

### Bryce Eldridge

The MLB Stats API identifies player ID `805811` as Bryce Eldridge, born October 20, 2004, currently with the San Francisco Giants, primary position DH. The 2026 response reports 78 games, 318 plate appearances, 277 at-bats, 68 hits, 38 runs, 15 doubles, 12 home runs, 29 RBI, 40 walks, 85 strikeouts, 1 stolen base, .245 AVG, .340 OBP, .430 SLG, and .770 OPS. He is not present in the migrated static source files, so the application is missing a current Bryce Eldridge record rather than merely displaying a stale one.

### San Diego Padres

The MLB Stats API 2026 standings response reports San Diego (team ID 135) at 65-57, .533, with 522 runs scored and 521 runs allowed, division rank 2, league rank 5, and wild-card rank 2. Padres aggregate hitting stats report 122 games, 4,533 PA, 956 hits, 522 runs, 134 HR, .238/.314/.388 slash line, and .702 OPS. Aggregate pitching stats report 122 games, 65-57, 1,079 innings, 992 strikeouts, 426 walks, 4.10 ERA, and 1.32 WHIP.

The static `TEAMS.sd` record currently shows 44-42, .512, 328 runs, 314 runs allowed, 78 HR, .245/.316/.412, .728 OPS, 3.64 ERA, 1.21 WHIP, and 562 strikeouts. Those values are inconsistent with the authoritative current 2026 API response and explain the incorrect Padres overview.

## Root causes found in the application

- `client/src/constants/data.js` contains hardcoded 2026 team records and a hardcoded Ohtani leader row.
- `client/src/pages/OverviewPage.jsx` derives the entire team overview from static `TEAMS` values and seeded/formula-derived panels. It does not call the existing `getTeamStats` or live standings helpers for the selected team.
- `client/src/pages/OtherPages.jsx` consumes the static `BATTING_LEADERS` and `PITCHING_LEADERS` data for the League leaderboard and contains another hardcoded showcase hitter array with Ohtani.
- `client/src/api/mlb.js` already exposes `getTeamStats`, `getTeamRoster`, `getAllTeams`, and live leader helpers, so the primary correction is wiring live data into the existing views rather than inventing a new data service.
- `client/src/api/mlb.js` already loads individual player season stats through `loadFullPlayer`. Ohtani's player page can use the live API path; static leaderboards and quick-access metadata still require correction.

## Audit policy for implementation

Use the MLB Stats API response as the primary source for current MLB player/team records. Keep seeded/estimated panels clearly labeled if a raw MLB source does not provide the requested metric. Do not present a static or formula-derived number as current official data. Preserve the existing SKIP visual design and tab names; only correct data sourcing, labels, and calculations.
