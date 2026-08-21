# Selected Branch Code-Improvement Recommendations — August 21, 2026

## Selected Base

The branch inventory found **one active candidate**: local `main` and `origin/main` point to the same current commit. There are no feature branches to rank or merge. Therefore, `main` is the selected and strongest branch by default: it contains the current validated Team News/visual-context release, the prior full-site debugging work, and the current managed deployment.

## Attached Recommendation Disposition

The attached UI-review recommendations have been incorporated below as a maintained improvement record. Items already completed in the active SKIP build are recorded as such rather than being duplicated. Items that require a verified population or new upstream data remain explicitly deferred.

| Attached item | Disposition on selected `main` | Recommended next action |
|---|---|---|
| A. Oversized Front Office Read space | **Complete** | The briefing is now a compact persistent strip, with content-driven height and no former large dead zone. Retain the density regression tests. |
| B. Briefing-to-detail gap and stretched Team Leaders panel | **Complete** | The supporting-analysis separation and decision-row alignment were already corrected; Team Leaders remains content-sized. Retain the responsive checks. |
| C. Front Office Evaluation empty weaknesses, scoped methodology, and unexplained raw scale | **Actionable** | Add an explicit threshold-aware zero-item weakness state; ensure the active grade alone owns the visible methodology; replace or label any compact raw denominator. No new baseball data is required. |
| 1. Reuse `ScoreRing` for overall grades | **Review before implementation** | Re-audit current score surfaces first. Apply only where a stable, documented score scale exists; do not decorate unavailable or illustrative grades as a hard measured score. |
| 2. Duplicate team-grade breakdowns | **Complete / monitor** | The current Overview separates Team Leaders from Front Office Evaluation. Preserve a single source of truth if another grade summary is added. |
| 3. Team Leader portraits | **Complete** | Stable roster IDs now drive verified player portraits with safe initials fallbacks. |
| 4. Inline prospect rank movement | **Actionable after snapshot-contract audit** | Reuse the existing eFV movement snapshot only if the same dated population covers the target table row; otherwise show no movement marker. |
| 5. Defensive OAA field map | **Feasible, planned** | Render the existing per-position OAA contract spatially and label it **Defensive value by position (OAA)**, never as a starter/backup depth chart. |
| 6. Visual distinction for true percentiles | **Partially complete; extend carefully** | Executive markers already render only for documented MLB comparison populations. Audit Player Profile percentile components and apply the gradient-dot treatment only where `percentile()` uses a real, documented population. |
| 7. MLB-wide sortable leaderboard | **Separate project** | Confirm full-pool and column coverage first, then extend the existing League sorting pattern with pagination. Do not promise unsupported columns. |
| 8. Trending players with seven-day deltas | **Deferred for data integrity** | Do not build until a verified, dated per-player delta source is available. |
| 9. Benchmark series on Team Strength radar | **Feasible, planned** | Compute league-average axes from the existing 30-team aggregate pool, use a dashed benchmark series, and label the population. |
| 10. League-wide Statcast spotlight | **Blocked by item 7** | Build only from a verified league-wide leaderboard, never from a team aggregate. |

## Applied Selected-Branch Optimization

The first selected-branch optimization is now a **short transparent negative cache** for the sourced Team News route. When all configured upstream feeds fail and no verified stale snapshot exists, the route records an explicit `unavailable` state for 60 seconds. Reopening the News workspace during that window no longer re-fans out to every provider. The route returns no headlines, labels the condition as unavailable, and exposes an `X-News-Cache: NEGATIVE` response marker; a stale verified snapshot still takes priority whenever one exists.

> The current managed SKIP build is the implementation target. The unrelated legacy static prototype described in the attachment is not part of this branch-selection or optimization plan.

## Validation Record

The selected `main` branch passed type checking, linting, the supported full Vitest suite with 129 passing files and 599 passing tests, and the production build. The only skipped suite remains the environment-unavailable published-browser E2E test. Desktop and 375-pixel mobile review confirmed the latest Team identity context, Team News workspace control, compact executive briefing, source-status text, and data controls remain readable after the optimization.
