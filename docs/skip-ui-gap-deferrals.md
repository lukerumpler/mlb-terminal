# SKIP UI Gap Deferrals

This note records UI-gap items from the attached reference-dashboard implementation specification that were intentionally not implemented in the current presentation pass because they require unresolved data contracts or architecture decisions.

| Deferred item | Reason for deferral | Safe next decision |
|---|---|---|
| Live ticker refresh architecture | The ticker needs a deliberate polling or server-cached refresh strategy. The current app already has a bottom game strip, but a new persistent scoreboard contract should not be added opportunistically. | Choose short server-cached responses plus client polling while games are active, or explicitly accept a client-only interval. |
| Freeform live feed | Game content and play-by-play are separate, more complex data shapes rather than one simple endpoint. | Scope as a separate feature after the scoreboard ticker contract is stable. |
| Delta/trend arrows | A directional value needs a stored baseline or a second date-ranged request. Adding this broadly could increase request volume and create misleading deltas. | Decide between snapshot storage and bounded historical comparison endpoints. |
| Hero-level playoff odds treatment | The visual prominence should wait until the displayed value has a settled, source-backed or explicitly labeled SKIP simulation contract. | Choose the authoritative provider or document the Monte Carlo methodology and confidence context. |
| 20–80 scouting grades | The current connected data does not establish verified Hit, Power, Run, Arm, and Field grades. | Connect a permitted, verified scouting source before rendering grades. Do not fill the scale with inferred values. |
| Multi-layer radar projection overlay | A projection series must come from a real forward-looking model; duplicating current data would create false visual confidence. | Add only when current, projected, and market-context datasets have independent provenance. |
| Surplus-value dollar figures | Dollar values imply a valuation methodology that is not currently established in the product’s source contracts. | Do not add until a documented valuation model and provenance design exist. |

The current pass safely implemented presentation-only improvements that use existing values: gradient percentile tracks with dot markers, accessible metric glossary affordances, semantic status styling, and responsive source surfaces. These changes do not alter the underlying data or create synthetic scouting conclusions.
