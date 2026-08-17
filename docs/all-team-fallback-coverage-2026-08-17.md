# All-Team Fallback Coverage — 2026-08-17

## Coverage expansion

The standings intelligence fallback now calculates **Team WAR proxy** and **playoff estimate** for every team returned by the official MLB standings response. A new all-team request is available at:

```text
GET /api/intelligence-calculations?mode=all&season=2026
```

The individual `teamId` request remains unchanged for existing Overview loads. Both modes share one daily, coalesced standings snapshot, so roster-wide inspection does not multiply MLB API traffic.

| Scenario | Fallback behavior |
| --- | --- |
| Active regular season | The model calculates projected wins from each team’s verified winning percentage; Team WAR proxy uses pythagorean expected wins less a 48-win replacement baseline. |
| Division race | The model estimates the division path by sweeping pairwise four-win-logistic comparisons against every division rival. |
| Wild Card race | The model evaluates a three-slot Wild Card cutline within each league, including a projected division leader’s fallback Wild Card path. |
| Completed 162-game season | Division leaders and the three Wild Card qualifiers receive deterministic 100% outcomes; eliminated teams receive 0%. |
| Missing runs scored/allowed | The team remains available for season-pace and playoff calculations; only the Team WAR proxy is `null`. |
| Missing wins/losses or structural league/division data | The affected team is explicitly unavailable rather than estimated. |

> The calculation is an **MLB-standings intelligence fallback**, not a FanGraphs forecast. It excludes schedule strength, roster projections, injuries, transactions, and simulation inputs. The UI retains the visible `Calculated` badge and labels the value as a **WAR proxy** whenever the verified FanGraphs metric is unavailable.

## Live all-team result

The live official 2026 standings response contained **30 unique teams**, six five-team divisions, two 15-team leagues, and no missing league or division identifiers. The local all-team endpoint returned 30 calculated team records with 30 Team WAR proxy values, 30 bounded playoff probabilities, zero unavailable teams, and unique IDs for all results.

| Live audit field | Result |
| --- | --- |
| Official standings team rows | 30 |
| Calculated team records | 30 |
| Team WAR proxy calculations | 30 |
| Playoff-probability calculations | 30 |
| Unavailable team records | 0 |
| Probability bounds / unique team IDs | Passed |

## Regression and build validation

The expanded intelligence suite now covers all 30 teams in six divisions, Wild Card contenders, division leaders, final-season clinched and eliminated outcomes, partial run data, shared daily cache use, malformed inputs, and missing standings records. The focused suite passed seven tests. The related Overview fallback tests, TypeScript validation, and production build also passed.

Run the following from the repository root to repeat the live coverage audit:

```bash
node scripts/all-team-intelligence-audit.mjs
```
