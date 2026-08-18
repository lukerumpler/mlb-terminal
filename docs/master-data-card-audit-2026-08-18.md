# Master Analytic and Data Card Audit

**Scope:** MLB Terminal frontend pages and shared card primitives.  
**Baseline release:** `6cab522`  
**Prepared:** 2026-08-18

## Inventory

The shared `Panel` primitive is used more than 130 times across the application. The largest analytic-card surfaces are Player Profile (37 panels), Knowledge (32), Other Pages / operational analytics (31), Team Overview (28), and Prospects (18). `StatStrip` is used in AMD, Follow List, Other Pages, Overview, and Prospects.

| Surface | Card/data risks observed | Priority |
|---|---|---:|
| Shared `Panel` and `StatStrip` | Panel headings are not exposed as labelled regions; badges can crowd headers; eight-column stat strips compress dangerously on narrow screens. | P0 |
| Team Overview | Forecast and WAR context were previously over-dense; the current compact source-aware design is retained as the reference pattern. | P0 |
| Players | Large number of profile and comparison panels; source status and narrow-screen grids must remain readable. | P0 |
| Prospects | Farm summaries and prospect cards rely on fixed multi-column layouts requiring mobile fallback. | P0 |
| AMD | Static illustrative model cards appear beside live-derived features; source/illustrative status must be made unmistakable. | P0 |
| Other Pages and Feed | Data controls, boxscore/standings cards, and freshness views need consistent empty states and mobile overflow treatment. | P1 |
| Knowledge and Notes | Content panels have low runtime data risk but benefit from shared semantic headings and responsive panel headers. | P2 |

## Confirmed consistency defects

1. The global stat strip holds up to eight equal-width columns with no shared narrow-screen fallback, which can create unreadably small values and labels.
2. The shared panel header lacks semantic region labelling and does not explicitly wrap a large status/badge payload on constrained layouts.
3. Analytic pages mix verified, calculated, illustrative, cached, and unavailable data states. The existing status tokens are strong, but not every analytic panel uses them consistently.
4. The AMD page clearly discloses illustrative values in page copy and selected panel titles, but several cards show the generic `SKIP Model` badge without a per-card source state.
5. Several page-level grids are fixed to two, three, four, or more columns. Shared mobile rules should provide safe one- or two-column defaults wherever a reusable class can be adopted without changing data contracts.

## Non-negotiable guardrails

Verified provider values, calculated fallbacks, and illustrative examples must remain distinguishable. Baseball-Reference identity matching remains exact-name only. Calculated WAR, playoff estimates, and other derived metrics remain explicitly labelled. No telemetry changes may retain player names, IDs, or personal data, and no rate-limit behavior may be bypassed.

## Completed optimization pass

The shared `Panel` primitive now renders as a labelled `section`, uses a wrapping header with a constrained badge container, and allows long uppercase titles to wrap safely. `StatStrip` now exposes a labelled region and uses stable element hooks for its metric, label, and sublabel content. At 720px it reflows to responsive metric cells; at 420px it uses a predictable two-column presentation.

| Surface | Completed improvement | Result |
|---|---|---|
| Shared components | Semantic panel and metric-strip regions, badge wrapper, responsive metric reflow, reduced-motion support | All pages using `Panel` or `StatStrip` inherit consistent accessible card behavior. |
| Provider and freshness cards | Shared `skip-data-list` hooks and list/listitem semantics | Provider state, freshness, and retry rows retain readable structure at narrow widths. |
| AMD / IMD | Explicit illustrative model badges, a concise static-data disclosure, stacked concept/workspace grids, scoped leaderboard overflow | Fixed demonstration values cannot be mistaken for live player calculations. |
| Prospects | Semantic farm-ranking lists plus staged farm-summary and workspace breakpoints | Farm scores and prospect-detail workspaces do not compress below readable widths. |
| Other Pages | `Illustrative SKIP model` labels for injury, projection, and trade simulations; responsive comparison-card stacking | Simulation cards are clearly identified and remain legible on phones. |
| Intel Feed | Semantic timeline/source-chain lists and a responsive timeline/sidebar workspace | Feed provenance and source availability remain structured on mobile. |
| Player, Knowledge, Notes, Follow List, Overview | Inherit shared primitive upgrades without data-contract changes | Existing purpose-built responsive layouts and source-state behavior are preserved. |

## Validation

The implementation passed `pnpm check`, `pnpm lint`, `pnpm test` (**91 test files passed, 1 skipped; 446 tests passed, 2 skipped**), and `pnpm build`. The skipped cases are the pre-existing published-browser suite and are not a rate-limit bypass. `git diff --check` reported no whitespace errors.

No provider logic, Baseball-Reference matching, telemetry payload, rate-limit policy, calculated fallback semantics, or production environment configuration was changed as part of this frontend card pass.
