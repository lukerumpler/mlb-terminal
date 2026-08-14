# Data Coverage Audit

## Scope

This audit reviewed the visible unavailable, pending, loading, dash, and empty-data states across the main SKIP pages. The objective was to repair fields that can be calculated from authoritative data already in the app while keeping source gaps explicit rather than inventing statistics.

| Area | Current source | Result | Treatment |
|---|---|---|---|
| Team Overview standings, offense, pitching, leaders | MLB Stats API season aggregate and player rows | Available when the live feed resolves | Uses independent aggregate/player requests and a bounded loading timeout |
| Team Overview baserunning and position depth | MLB Stats API player rows | Partially available | Rolls up stolen bases, caught stealing, attempts, extra-base hits/rate, and player counts by position |
| Team Overview OAA, team exit velocity, spray, contact quality allowed, pitch arsenal | Team-level Baseball Savant/Statcast feed | Not exposed by the current team endpoints | Uses specific “Coverage gap” explanations; no proxy values or seeded dots |
| Team Overview Team WAR, playoff odds, future value | External projection/model feed | Not connected | Uses “Source gap” rather than a misleading zero or stale snapshot |
| Players advanced percentile/contact panels | Player-level MLB/Savant responses | Mixed by player and season | Displays missing fields as unavailable and explains the required sample/source |
| Prospects rankings, filters, ETA, sorting | Current prospect data model | Available | Keeps filtering/sorting behavior intact; empty results are explicit |
| League standings and leaderboards | MLB Stats API | Available when requests resolve | Static snapshots remain hidden when the official response is unavailable |
| Intel Feed | Public RSS proxy | Partial by account | Shows loaded account count and source-specific reachability warnings |
| Draft, NCAA, financial, and historical panels | Dedicated source or model-specific endpoints | Mixed | Existing pages retain source-aware empty states rather than fabricating values |

## Repairs completed

The Team Overview now derives verified baserunning and position-depth signals from current player rows, replaces generic unavailable labels with source-specific coverage language, and changes an indefinitely connecting live feed into a bounded error state after twelve seconds. The declared PDF dependency was also restored locally so the Overview can load its export path without a module-resolution error.

## Deliberate non-repairs

The remaining team-level Statcast and projection fields cannot be recovered from the current authoritative endpoints used by the app. Replacing these with estimates would make the intelligence platform less reliable. The next legitimate improvement is to connect dedicated team-level Baseball Savant, projection, and playoff-odds sources and add their freshness metadata to the existing data-status system.
