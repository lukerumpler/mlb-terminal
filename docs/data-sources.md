# Data Sources & Provenance Contract

SKIP interfaces with verified public baseball data feeds, statistics APIs, and analytical leaderboards. Every metric presented in the terminal adheres to strict data-source provenance rules: unverified or missing data is never fabricated.

## Core Data Sources

| Provider               | Endpoint / Path                         | Purpose                                                                                                          | Caching & TTL                     | Fallback Behavior                                                                 |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| **MLB Stats API**      | `/api/mlb`                              | Live scores, team stats, player bios, stats, boxscores, and venue metadata                                       | 2–10 minutes with stales-if-error | Returns structured unavailable state and source health badge; never invents stats |
| **Baseball Savant**    | `/api/savant`                           | Statcast leaderboards, percentiles, expected metrics (xwOBA, xBA, xSLG), exit velocity, and batted-ball tracking | 15–30 minutes                     | Falls back to cached snapshot or displays Savant Unavailable badge                |
| **FanGraphs Models**   | `/api/fangraphs-models`                 | Team WAR, offensive/defensive WAR components, projected W-L, and playoff probabilities                           | 10–60 minutes                     | Returns aggregate team rows or partial model stats with coverage gap indicators   |
| **NCAA Stats**         | `/api/ncaa`                             | College baseball intelligence, player statistics, and leaderboard data                                           | 15 minutes                        | Returns empty results with provider error reporting                               |
| **Intel Feed & News**  | `/api/feed`, `/api/news`                | Baseball intelligence feed, trade updates, and RSS top headlines (ESPN fallback chain)                           | 5–10 minutes                      | Multi-tier XML/JSON parsing fallback chain from primary feed to RSS feeds         |
| **Spotrac Financials** | `/api/contract`, `/api/team-financials` | Team payroll, luxury tax (CBT) thresholds, repeater tier tracking, and multi-year contract projections           | 30 minutes                        | Displays structured financial unavailable states with surcharge warnings          |
| **Team Efficiency**    | `/api/team-efficiency`                  | Team payroll (Spotrac) paired with blended Team WAR (FanGraphs, Baseball-Reference fallback) as salary-to-WAR efficiency | 15 min fresh, 60 min stale | Missing provider fields stay null and are labelled; the panel names the actual WAR provider |
| **MLB Warehouse**      | `/api/mlb-warehouse`                    | SKIP-owned game and pitch history ingested from the MLB Stats API (pitch-level velocity, spin, break, hand splits) | 1-5 min (CDN)   | Returns 503 `{ available: false, reason }` when the database is absent or unmigrated; never substitutes Savant data |

## Provenance Status Badges

Every major metric card and model panel displays a verified source-health badge:

- **Live / Verified**: Freshly retrieved from the upstream API endpoint within TTL.
- **Cached**: Served from in-memory or bounded server cache during transient network interruptions.
- **Stale**: Served past TTL under stale-if-error rules during provider rate limits or downtime.
- **Coverage Gap / Unavailable**: Upstream response omitted the field or failed; explicitly marked unavailable without estimation.
