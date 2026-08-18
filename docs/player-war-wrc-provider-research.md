# Player WAR / wRC+ fallback provider research

## Findings

The official MLB Stats API `seasonAdvanced` response is the primary adapter already used by SKIP, but it does not guarantee explicit WAR or wRC+ fields for every player. The current adapter correctly preserves only explicit fields and returns an unavailable status otherwise.

Baseball-Reference documents its own WAR methodology and publishes WAR values for players, but it is a distinct WAR edition from FanGraphs and should not be silently mixed into a FanGraphs-labeled field. Baseball-Reference is therefore a possible WAR-only fallback if the application labels the provider and edition explicitly.

FanGraphs publishes player WAR and wRC+ leaderboards and defines wRC+ as a context-adjusted offensive metric. However, the project’s existing runtime audits document intermittent FanGraphs blocking and provider failures. FanGraphs should be used only through an existing verified project adapter or an explicitly configured provider route, never by scraping directly in the browser.

Because WAR editions are not interchangeable, the fallback contract should carry `provider`, `edition`, `retrievedAt`, and `status` metadata. If a fallback provider is unavailable or does not return an explicit field, the UI must continue to show an unavailable coverage state rather than calculate or substitute a value.

## Sources

1. Baseball-Reference, “Baseball-Reference.com WAR Explained”: https://www.baseball-reference.com/about/war_explained.shtml
2. FanGraphs Library, “wRC+”: https://library.fangraphs.com/offense/wrc/
3. FanGraphs, “WAR Leaders”: https://www.fangraphs.com/leaders/war
