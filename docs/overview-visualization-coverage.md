# Team Overview Visualization Coverage

## Purpose

This note records what the current SKIP data contracts can support **without estimating, inventing, or relabeling baseball intelligence**. It is a readiness assessment, not an implementation of either visualization.

| Proposed visualization | Current coverage | Honest implementation status |
|---|---|---|
| Defensive field map | Baseball Savant player-level OAA rows with player name, reported position, and OAA | Conditionally implementable when the Savant response contains position rows for the selected team |
| League-benchmark radar | MLB team aggregate records grouped by abbreviation, with comparable hitting, pitching, and standings fields | Implementable with an explicitly labeled league-average reference series |

## Defensive Field Map

`getTeamSavantOaa()` requests the Baseball Savant OAA leaderboard, filters it to the selected organization, and emits `playerRows` in the form `{ name, position, oaa }`. The same response retains source status, retrieval time, player count, and the full comparison-pool size. This is sufficient to place **reported positions** on a compact diamond and display the real OAA value at each represented position.

The map must be labeled **“Defensive value by position (OAA)”**. It must not be labeled “Depth Chart,” because the contract measures Statcast fielding value rather than roster depth, availability, or an organization’s preferred defensive alignment. A position without a returned OAA row must be shown as unavailable, not zero; a player without a recognized baseball position must remain in an “other / unplaced” list rather than being assigned to a field location. When Savant returns `source-gap` or `upstream-unavailable`, the visualization must present the existing unavailable state rather than a diagram populated with placeholders.

The current `PositionOaaChart` already provides an OAA-by-position presentation path. A field map would be a spatial alternative using the same verified player-row data, not a new source or a new grade.

## League-Benchmark Radar

`buildLiveRadarData()` already derives axes from `liveTeamData.byAbbr`: OPS, SLG, OBP, HR, SB, run differential, plus the strength dimensions. It applies the same `rankValue()` helper to numeric values across the available MLB team aggregate records. Therefore, the application can calculate a **league-average value per radar axis** directly from the same population and render it as a dashed reference series.

The benchmark series should be labeled **“Available MLB team aggregate average”** and its provenance should state the current number of usable team records for each axis. If fewer than the documented complete comparison set are available, the interface should say “available MLB team aggregate set” rather than imply all 30 clubs. Any missing axis must be omitted from both series or displayed as unavailable; it must never be silently filled with a default league value.

## Implementation Guardrails

| Guardrail | Required behavior |
|---|---|
| Source availability | Render each visualization only from its documented source contract and show the existing source status. |
| Population labels | Name the exact comparison population used, including “available” when the live response is incomplete. |
| Missing data | Preserve `null` / unavailable states; do not turn missing OAA or team aggregates into zero. |
| Scope of claims | OAA is defensive value, not a scouting grade or depth chart. A radar benchmark is a population average, not a target or a projected outcome. |
| Reuse | Reuse `getTeamSavantOaa()`, `buildLiveRadarData()`, and the existing OAA/radar chart layer rather than adding parallel metrics. |

## Verification Record

Desktop and 375-pixel mobile previews were inspected on August 20, 2026. The Executive Briefing is content-sized with no former 460-pixel blank area, Supporting Analysis starts at the intended tighter separation, and the workspace controls remain legible on mobile. The live preview did not expose a complete documented comparison pool at capture time, so no percentile track was rendered; this is the intended honest behavior. Portrait rendering is additionally covered with stable cached MLB IDs and fallback cases in automated tests.
