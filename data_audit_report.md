# SKIP Baseball Whole-Website Data Audit

**Audit baseline:** `skip-baseball-v75.zip` merged into the Manus project. **Audit date:** 2026-08-13.

## Result

The site now treats current standard MLB values as live data rather than as static snapshots wherever the application already has an authoritative MLB Stats API path. Team overview cards use live standings plus aggregate team hitting and pitching totals. The League tab uses live standings, live team totals, and live leader categories. The MLB proxy now returns controlled JSON errors for empty or non-JSON upstream responses instead of allowing an upstream response problem to destabilize the preview.

## Verified source policy

| Data category | Source used or required | Current handling |
|---|---|---|
| MLB standings, schedule, standard team totals, player identity, standard player stats | [MLB Stats API](https://statsapi.mlb.com/api/v1/) | Live requests through the Manus proxy and client adapter |
| MLB Statcast, expected, batted-ball, pitch, and advanced defensive metrics | [Baseball Savant](https://baseballsavant.mlb.com/league) | Not silently substituted with standard MLB values; unsupported current panels are labeled illustrative, estimated, or unavailable |
| Prospect identity and minor-league statistics | [MLB prospect statistics](https://www.mlb.com/prospects/stats/top-prospects), MLB Stats API | Live enrichment is used where identifiers and responses are available; curated baseline remains visible as a prospect catalog, not a claim of current completeness |
| NCAA data | NCAA adapter/provider path | Existing live adapter retained; no fabricated replacement data added |
| Contract and feed data | Existing API adapters | Existing live/error behavior retained; no static value is presented as a successful live response |

## Corrected shared paths

The San Diego Padres and all 30 team records were synchronized against current MLB standings and standard team totals during the audit. Shohei Ohtani and Bryce Eldridge were corrected as part of the earlier targeted audit and remain covered by the shared static/live data paths. The Overview page now joins aggregate team statistics by MLB team ID, avoiding abbreviation-based joins that could fall back to stale values.

The League page no longer uses the static batting/pitching leaderboard arrays for its current leaderboard. It builds rows from live MLB leader categories and displays an explicit unavailable state when the live response is missing. Its team OPS and ERA charts and summary strip use live aggregate team totals. Static standings fallbacks are hidden when the live standings request fails rather than presenting an old snapshot as current.

## Data that is intentionally not presented as official current data

The application contains editorial scouting and reference material that is not an official live feed. Draft rankings, value picks, breakout/riser/faller analysis, and historical trade records remain part of the product but are labeled as SKIP editorial or fixed historical analysis. The following League and prospect summary panels no longer present dated snapshots as current statistics: parity index, league trends, injury overview, farm-system rankings, and the Prospects top farm-system card. They show an unavailable state until a source-backed feed is connected.

The Overview page continues to show the requested Bloomberg-terminal visual structure, but unsupported advanced panels are explicitly marked illustrative or estimated. This is deliberate: standard MLB Stats API data cannot be used as a substitute for Statcast exit velocity, hard-hit rate, barrel rate, OAA, DRS, FIP, WAR, injury counts, or a complete farm-system ranking.

## Validation performed

The final release gate passed after the changes:

| Check | Result |
|---|---|
| Prettier-based lint command | Passed |
| TypeScript check | Passed |
| Production build | Passed |
| Vitest suite | 21 test files, 122 tests passed |
| Focused MLB proxy response tests | 2 tests passed |
| Preview root request | HTTP 200 |
| Schedule proxy smoke test | HTTP 200 with current MLB schedule JSON |
| Invalid MLB proxy path | Controlled HTTP 400 |

The preview was also captured successfully after the server restart. The official roadmap markdown was not modified as part of this audit.

## Remaining limitation

A truly complete current-data guarantee for every numerical value would require live source integrations for Baseball Savant team/player Statcast, injury reporting, contract data, farm-system rankings, NCAA detail, and a maintained prospect identity/statistics feed. Where those feeds are not connected, the application now avoids claiming that static or formula-derived values are official current data.

## Reference notes

See `data_audit_official_sources.md` for the official source endpoints and the source policy used during this audit.

## Player-profile smoke-test checkpoint

The live preview loaded the Players tab and exposed all six quick profiles (Aaron Judge, Shohei Ohtani, Juan Soto, Gunnar Henderson, Spencer Strider, and Bobby Witt Jr.) with MLB IDs, team abbreviations, and positions from the profile search/quick-access path. The preview root and tab navigation rendered successfully after the dev-server restart. Aaron Judge was selected and remained in the profile loading state while the parallel MLB, Savant, career, and contract requests settled; this is expected for the multi-source profile loader and is being checked against the browser console/network logs before final delivery.


The Aaron Judge profile now hydrates and renders authoritative 2026 MLB standard stats (59 G, .248 AVG, 17 HR, .908 OPS) and live Baseball Savant fields where returned. Missing fields such as Sweet Spot %, Hard Hit %, and plate-discipline percentiles show `—` or an explicit unavailable message rather than proxy values. The profile also shows the model-only, illustrative, estimated, and unavailable labels introduced by the accuracy pass. This smoke test exposed no new profile-rendering exception after the split-selection change.


The profile search correctly identifies Shohei Ohtani as MLB person ID 660271 and labels the quick-access entry `DH · LAD`; the search result also exposes the MLB profile classification as `TWP`. The current selected profile remains Aaron Judge until the result is explicitly chosen, so the smoke test is checking both identity resolution and selection behavior rather than assuming a typed name changed the loaded record.


The Ohtani search result selection correctly enters the same multi-source profile loading state used for every player, indicating that the catalog identity path and detail loader are connected. The next browser check will confirm that his two-way MLB profile resolves to the current Dodgers record and does not inherit Aaron Judge’s hitter data.


Shohei Ohtani’s profile resolved correctly to **Los Angeles Dodgers · TWP**, MLB person ID 660271, with current 2026 batting data from MLB Stats API (115 G, .292 AVG, 27 HR, 74 RBI, .937 OPS). The profile did not inherit Aaron Judge’s values, and its live Savant contact-point panel reported 875 tracked swings with left-handed batting. His standard stats and two-way identity are therefore hydrated from the selected MLB record rather than from the curated quick-access card.


The Spencer Strider search result resolves to MLB person ID 675911 and is labeled `Free Agent · P`; the current selected profile remains Ohtani until the result is explicitly selected. This confirms the search path is updating candidate identity independently from the loaded profile, which avoids cross-profile data bleed during selection.


Spencer Strider’s selected profile entered the shared loading state without a client exception. The initial wait did not yet complete the profile, consistent with the slower Savant pitcher endpoints and contract request; the current test is checking that the loader eventually resolves or fails with a controlled state rather than displaying stale Ohtani data.


The complete six-player quick-access identity audit found and corrected one real catalog error: MLB person ID `668939` belonged to Adley Rutschman, not Bobby Witt Jr. MLB’s live people search identified Bobby Witt Jr. as ID `677951`; the quick-access record was corrected and its official position/team abbreviations were aligned (`RF`, `TWP`, `LF`, `SS`, `P`, `SS`). The corrected audit now reports **6/6 identities matched** live MLB name, hydrated current team, position, and ID records.


## Baseball Savant baseline for the UI refinement

Baseball Savant’s 2026 Percentile Rankings page states the qualifier thresholds of 2.1 PA per team game for batters and 1.25 PA per team game for pitchers, and presents the percentile values as the primary visual ranking rather than raw-stat scales. Its displayed batter columns include xwOBA, xBA, xSLG, xISO, xOBP, Barrel%, EV, Max EV, HardHit%, K%, BB%, Whiff%, Chase%, Sprint Speed, OAA, Arm Strength, Bat Speed, Squared-Up Rate, and Swing Length. These values are the baseline for SKIP’s percentile-first player cards.

Baseball Savant’s Visuals page identifies authentic Statcast visual conventions including pitch highlighter spray charts, batting stance and intercept visuals, swing-and-miss profiles, pitch arsenals, hitting signatures, and Statcast field visualizer spray charts. It also links the official glossary definitions for EV, launch angle, barrels, hard-hit rate, sweet-spot rate, batted-ball events, xBA, xwOBA, bat speed, pitch velocity, pitch movement, active spin, spin rate, extension, xERA, OAA, arm strength, and sprint speed. SKIP must not use deterministic seeded dots as if they were tracked spray locations; where the required source-backed coordinates are unavailable, the UI should display an explicit unavailable state.

References: [Baseball Savant Percentile Rankings](https://baseballsavant.mlb.com/leaderboard/percentile-rankings); [Baseball Savant Visuals](https://baseballsavant.mlb.com/visuals); [Baseball Savant CSV Documentation](https://baseballsavant.mlb.com/csv-docs); [Baseball Savant Statcast Metrics Context](https://baseballsavant.mlb.com/statcast-metrics-context).


## UI refinement source baseline — 2026-08-13
- Baseball Savant percentile rankings: https://baseballsavant.mlb.com/leaderboard/percentile-rankings
- Baseball Savant visuals and Statcast chart conventions: https://baseballsavant.mlb.com/visuals
- Baseball Savant CSV field documentation: https://baseballsavant.mlb.com/csv-docs

Implementation rule: percentile bars use league-population ranks on a 0–100 scale, while raw values remain secondary labels. Missing Statcast distributions, team spray coordinates, and team pitch arsenals render as unavailable rather than seeded estimates. Player spray charts use Statcast Search `hc_x`/`hc_y` coordinates when present; draft class rows use one canonical SKIP rank map shared by the Big Board, directory, and mover panels.


## Baseball Savant baseline — spray and Statcast visuals
- Official CSV documentation: https://baseballsavant.mlb.com/csv-docs
- Official visuals glossary: https://baseballsavant.mlb.com/visuals
- Baseball Savant defines `hc_x` as the hit-coordinate X of the batted ball and `hc_y` as the hit-coordinate Y of the batted ball. These are field-contact coordinates and must not be confused with the batter-relative intercept coordinates used by the Contact Point panel.
- Baseball Savant defines a hard-hit ball as a batted ball with exit velocity of at least 95 mph, a launch-angle sweet spot as 8–32 degrees, xBA as expected batting average, and xwOBA as a result based on exit velocity, launch angle, and in some cases sprint speed.
- Baseball Savant’s visuals page is the presentation baseline for batted-ball, pitch, expected-statistics, and bat-tracking labels. Player percentile chart widths must use the 0–100 population rank; raw statistics are contextual labels only.


## UI and chart refinement checkpoint — 2026-08-13

The Juan Soto profile smoke test rendered live 2026 MLB and Baseball Savant data with xwOBA at the 98th percentile, xSLG at the 98th percentile, EV at the 92nd percentile, and raw values retained only as secondary context. The profile card is percentile-first and contains no slider interaction. The shared ordinal formatter now correctly renders 92nd, 93rd, 98th, 99th, and 100th, while null values remain an em dash.

The player spray chart now consumes Baseball Savant field-contact `hc_x`/`hc_y` coordinates from the Statcast Search feed and uses a wider horizontal and calibrated vertical projection around home plate near (125, 198). Contact Point remains a separate batter-relative intercept visualization. Missing coordinates render an explicit unavailable state; no synthetic dots or one-value EV histogram are used.

The Overview smoke test confirmed live Dodgers standings, team hitting and pitching totals, team leaders, and proper 93rd/77th percentile labels. Unsupported team-level Statcast panels remain explicitly unavailable. The Draft tab rendered a canonical SKIP rank order shared by the Big Board, movers, and class directory, with SKIP editorial fields separated from official round results.

A 375px mobile preview was also checked. The terminal now collapses the navigation rail to icons, stacks major Overview grids, and converts the shared metric strip to two columns so the data cards remain readable on a narrow screen while desktop layout remains unchanged.


## Final 2026 source verification — 2026-08-13

### Live probes and decisions

- MLB identity, standings, and transaction probes succeeded against the official Stats API: `https://statsapi.mlb.com/api/v1/people/660271?hydrate=currentTeam,stats(type=season,group=hitting,season=2026)`, `https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2026&standingsTypes=regularSeason`, and `https://statsapi.mlb.com/api/v1/transactions?startDate=2026-08-01&endDate=2026-08-13&sportId=1`. The project proxy forwards these endpoints and does not create a static fallback when an upstream response is unreadable.
- The NCAA proxy’s upstream `https://ncaa-api.henrygd.me/standings/baseball/d1` returned HTTP 500 with `Could not parse data` during the audit. `NcaaWatchPanel` renders a readable error/unavailable state when both the scoreboard and ranking requests fail; no NCAA snapshot rows are substituted.
- The contract route returned `found:true` for Shohei Ohtani with the official MLB service/debut path and null money fields when the Spotrac/Baseball-Reference scrapes did not produce a match. Its source caveat remains visible in the handler and UI; dollar values are not represented as official MLB salary data.
- The Intel Feed route returned `items:[]` with `error:"Feed unavailable"` when the public RSS/Nitter hosts were unavailable. No canned posts or stale metadata are supplied.

### Prospect identity audit

- Audited all 95 curated prospect records against `https://statsapi.mlb.com/api/v1/people/{mlbId}?hydrate=currentTeam`. After correction, all 95 IDs resolved, all names matched diacritic-insensitively, and no record lacked a current team object.
- Corrected stale person IDs in `client/src/constants/data.js`: Brandon Sproat `687075` (was `803997`), Kyle Harrison `690986` (was `802565`), and Ricky Tiedemann `694357` (was `807028`). Normalized official names to `Pedro Ramírez` and `Elmer Rodríguez`.
- The live prospect adapter remains authoritative for current AAA/AA stats; curated rank, level, and scouting fields remain editorial baseline context and are surfaced with the page’s `LIVE STATS` / `STATIC` status instead of being silently presented as live MLB figures.

### Remaining source limitations

- Contract dollar values are not official MLB Stats API fields in this implementation; Spotrac and Baseball-Reference are scraped public reference sources, while service time/debut are MLB-backed. Null values remain explicit when scrapes fail.
- Current NCAA data and Intel Feed posts were unavailable at audit time; the UI displays explicit unavailable/error states rather than fallback data.
- `ROADMAP_REFERENCE_FEATURES.md` was not modified.


The same parent-organization audit corrected 11 current organization labels in the curated prospect catalog: Leo De Vries to ATH, Zyhir Hope to DET, Arjun Nimmala to LAA, Jefferson Rojas to NYM, Jamie Arnold to ATH, Gage Jump to ATH, Anthony Eyanson to BAL, River Ryan to DET, Kyson Witherspoon to BAL, Brandon Sproat to MIL, and Kyle Harrison to MIL. These are current MLB organization affiliations derived from the live person record’s `currentTeam.parentOrgId`; the table’s level and editorial rank fields remain separate from the live affiliation check.


## Comprehensive metric verification — source research phase

Authoritative online documentation was rechecked on 2026-08-13. Baseball Savant's 2026 Percentile Rankings page documents the batting and pitching qualifiers of 2.1 PA per team game and 1.25 PA per team game, and defines the relevant Statcast metrics including EV, launch angle, barrels, hard-hit rate, sweet-spot rate, xBA, xwOBA, sprint speed, pitch velocity, movement, spin, extension, xERA, arm strength, and OAA. The Statcast CSV documentation identifies `hc_x` and `hc_y` as batted-ball hit coordinates, `hit_distance` as projected hit distance, `launch_speed` as exit velocity, and `launch_angle` as launch angle. Baseball Savant's Statcast Search page confirms that the underlying database can be queried by player, team, season, event, and batted-ball fields. Sources: https://baseballsavant.mlb.com/leaderboard/percentile-rankings, https://baseballsavant.mlb.com/csv-docs, https://baseballsavant.mlb.com/statcast_search.

The NCAA.com Division I baseball rankings page was also read as an authoritative current-season reference. It identifies the D1Baseball.com Top 25 through games on June 23, 2026 and reports rank, team, overall record, and previous rank. The existing NCAA adapter is therefore treated as a live provider path only when it returns data; NCAA.com rankings are a corroborating reference, not a fabricated fallback. Source: https://www.ncaa.com/rankings/baseball/d1/d1baseballcom-top-25.


### Live endpoint probe results — 2026-08-13

The connected routes were probed after the Overview remount. MLB person identity for Shohei Ohtani, MLB team player stats for the Dodgers, and MLB leader categories returned HTTP 200 JSON from the official Stats API. Baseball Savant expected-statistics and Statcast leaderboard CSV routes returned HTTP 200 with current 2026 rows. The NCAA standings route returned HTTP 500 from `ncaa-api.henrygd.me` with an explicit proxy error, while the current-week scoreboard route returned HTTP 200 with an empty scoreboard response. This confirms the app can display live MLB/Savant data and must retain explicit unavailable states for NCAA standings when the provider fails.

The Overview issue was traced to one `Promise.allSettled` block that waited for slow per-player leader requests before committing successful aggregate standings/team-total responses. The loader now commits the three critical aggregate requests independently and handles team-leader requests in a separate non-blocking promise. A fresh clean remount then displayed live Dodgers values including 73–48, .603, 606 runs scored, 464 runs allowed, +142 run differential, .768 OPS, 155 HR, 3.70 ERA, 1.160 WHIP, .261 AVG, 1081 strikeouts, and 46 stolen bases from the live responses.


## Draft trend source research — 2026-08-13

NCAA.com exposes current Division I individual and team leaderboard pages and links to archived ranking resources, while D1Baseball exposes year selectors for 2026 back through 2016 plus standard and advanced batting/pitching tables. Neither public page provides a stable player-season history API that the current SKIP proxy can query for every Draft-board player. The Draft board includes high-school players and college players, and its current authoritative MLB draft-results adapter supplies pick metadata rather than a three-year performance time series. Therefore no synthetic trend points will be generated: Draft rows will show a real three-season sparkline only when a source-backed history record exists, otherwise they will display an explicit unavailable state. Sources: https://www.ncaa.com/stats/baseball/d1, https://d1baseball.com/statistics/, https://stats.ncaa.org/.

D1Baseball team-season pages for Georgia Tech 2024–2026 expose season links, team record, RPI, and links to separate Stats pages, but the extracted Overview HTML does not expose a player-by-season table. This reinforces the rule that a Draft sparkline must be rendered only from an explicit source-backed history payload; team records or editorial draft notes cannot be repurposed as player trends.

UI verification addendum (2026-08-13): desktop and 375px screenshots show the Bloomberg-style shell, responsive icon rail, stacked overview cards, and explicit `LOADING MLB DATA`/dash states when upstream requests are still pending. The comparison modal’s new motion and spinner states are covered by interaction tests; Draft trend cells are source-gated and show `—` when no complete three-season history is available.
