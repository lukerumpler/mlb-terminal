# SKIP Baseball Intelligence Terminal — Reliability and Affiliate Workflow Release

## Summary

This release hardens SKIP's baseball data-delivery paths and refines the Team Overview to Minor League workflow. It prioritizes verified MLB parent-team context, protects the interface from provider instability, and makes affiliate exploration clearer and less network-intensive. No statistical values are fabricated: unavailable or source-gap data remains explicit.

## What Changed

### Data correctness and source resilience

- Normalized MLB and MiLB team-stat fields so core OPS, HR, ERA, strikeout, and expected-stat cards use the correct verified fields when present.
- Improved Baseball Savant team filtering and provenance handling so global leaderboard rows do not appear as team-specific data.
- Added stale-if-error schedule fallback behavior and visible cached provenance for temporary MLB Stats API failures.
- Kept FanGraphs, Baseball-Reference, and other provider gaps visibly unavailable when their upstream response is blocked, empty, or rate-limited.

### Team Overview and Minor League workflow

- Made the selected MLB parent club the default Team Overview context on initial load, team changes, recent history, and stale selection events.
- Replaced the always-visible affiliate selector with an explicit **Minor League** workflow so affiliate requests occur only when requested.
- Removed MLB parent-club rows, duplicate rows, and malformed major-league rows from affiliate lists through centralized normalization.
- Added dynamic affiliate classification filters for levels such as Triple-A, Double-A, High-A, Single-A, and other levels returned by the verified source.
- Added sortable affiliate standings by win percentage, win-loss record, games back, and team name, with reversible ordering and deterministic tie-breaking.

### Performance and interaction reliability

- Deferred affiliate standings and schedule requests until their corresponding tabs are opened, reducing unnecessary initial mobile and desktop network work.
- Protected selection flows against late affiliate responses after the user changes MLB teams.
- Preserved parent-team content independently of affiliate loading, error, cached, or source-gap states.
- Improved loading, unavailable, and source-provenance feedback while retaining the low-data-friendly default view.

## Validation

| Validation | Result |
| --- | --- |
| Full regression suite | 101 test files and 480 passing tests |
| Targeted Team Overview / affiliate coverage | Parent selection, normalization, filters, request deferral, sorting, stale-response safety, loading, schedule, standings, and unavailable states covered |
| Type validation | `pnpm check` passed |
| Production build | `pnpm build` passed |
| Responsive review | Mobile parent-first Overview reviewed |

## Deployment Notes

- The release was published through the managed project release process because repository credentials are intentionally unavailable to terminal Git commands.
- The validated product baseline is `29b3a367`; the release audit and validation tracking commit is `d422e88`.
- The live deployment remains source-aware: a provider outage produces an explicit cached, unavailable, or coverage-gap state rather than invented data.

## Reviewer Checklist

- [ ] Confirm the MLB parent club remains selected until a user explicitly opens Minor League controls.
- [ ] Confirm the affiliate selector excludes the MLB parent club and includes only verified minor-league teams.
- [ ] Confirm level filtering and standings sorting behave correctly on desktop and mobile.
- [ ] Confirm schedule and standings requests occur when their tabs are opened.
- [ ] Confirm provider failures remain visibly unavailable or cached with provenance.
