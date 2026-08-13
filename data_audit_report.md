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
