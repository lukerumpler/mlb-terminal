# Selective Optimization Handoff Review

## Decision Record

The three supplied handoffs were compared with the current shared SKIP release rather than merged or applied wholesale. The branch audit’s player-profile sequence protection and core-first rendering were already present in the current implementation, so no duplicate migration was performed. The player-profile report identified one remaining compatible improvement: optional Baseball Savant leaderboard requests now receive the same `AbortSignal` as the active profile selection. A new selection or unmount can therefore cancel queued or in-flight optional requests, while the existing sequence token remains the final safeguard against stale UI commits.

The ScoreRing handoff was implemented as a **reversible presentation preview only**. Adding `?evaluationView=score-ring` to the Team Overview URL swaps the Overall grade tile within the existing Front Office Evaluation card for a restrained circular readout. The default experience remains the existing grade-first display. The preview reuses the canonical Front Office grade rows, weighted `4.30` scale, calculation-detail copy, and active-detail state; it adds no parallel data request, alternative baseball model, invented value, dashboard shell, or persistent end-user toggle.

| Recommendation | Decision | Implementation or rationale |
|---|---|---|
| Branch-wide integration from historical audits | Not merged wholesale | Current shared work supersedes the stale branches; compatible prior safeguards were already present. |
| Core-first profile rendering and sequence token | Retained | Existing behavior remains unchanged and covered by current regression tests. |
| Cancel stale optional profile work | Implemented | Savant leaderboard helper now receives and honors the profile `AbortSignal`; optional results cannot publish after cancellation. |
| ScoreRing redesign | Implemented as preview only | Query parameter isolates a light, editorial variation inside the current evaluation card. |
| New scoring model | Rejected | The ring normalizes the already canonical `overallRating / 4.30` only for visual display and retains the grade and original scale. |
| Runtime feature flags and production RUM | Deferred | No approved data-retention policy, endpoint contract, sampling plan, or rollout owner exists. Implementing telemetry before those controls would add unnecessary data collection. |

## Integrity and Accessibility Rules

The ScoreRing renders `—` and an explicit unavailable explanation when there is no defensible overall grade. It does not treat missing inputs as zero. When one or more category grades are unavailable, the preview carries a visible partial-coverage label. The ring’s accessible label includes the team, grade, original scale, normalized visual score when valid, coverage status, and source statement. Existing grade controls remain native buttons, use the same calculation details, and close on Escape with focus returned to the triggering control.

## Validation

Focused coverage exercises the ScoreRing’s query isolation, grade-and-scale consistency, unavailable state, accessible calculation detail, Escape behavior, and optional-Savant abort propagation. Full validation after implementation passed formatting, TypeScript, **113 test files / 535 tests**, and the production build.

## Review Link

Use the standard Team Overview route for the grade-first baseline. Add `?evaluationView=score-ring` to review the contained ScoreRing variation with the same team data.
