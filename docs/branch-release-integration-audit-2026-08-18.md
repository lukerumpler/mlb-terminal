# Branch and Release Integration Audit — August 18, 2026

**Reviewed source:** `lukerumpler/mlb-terminal` GitHub `main` at `64213f281ba65ae9dc2e12e3ca9341c6aeb5c015`.  
**Canonical release candidate:** shared-project `main` at `4c116db868608a111861355de50162ff97336508`.  
**Decision:** Retain the canonical shared-project implementation. Do not perform a raw branch merge. Advance the release-gate reference after the validation gate passes.

## Why a raw merge is unsafe

The linked GitHub tree and the managed project have evolved through different release histories. The review compared the five GitHub-main commits after the previously accepted `5095d4b` reference, all non-main GitHub branches, and the corresponding canonical application paths. Of 243 production, test, and release-control files compared between GitHub `main` and the canonical release candidate, **225 are byte-identical**. The remaining differences are deliberate reconciliations rather than missing work: the canonical project includes the later PlayoffStatus source route, non-fabricated playoff-odds behavior, FanGraphs provider-update provenance, expanded staged Player Profile loading, and the recently added one-request Savant failure guard.

> The canonical shared project is therefore the integration target. GitHub branches serve as evidence for feature-level reconciliation, not as trees that can be overwritten onto the managed release.

## GitHub-main compatibility review

| Reviewed area | Canonical reconciliation | Decision |
| --- | --- | --- |
| Roster-insights local fallback | The canonical router rejects empty, blank, non-finite, and malformed values and returns transparent verified-context fallback states. Its regression suite also covers request coalescing and inclusive thresholds. | Retained; GitHub-main behavior is present or strengthened. |
| Player Profile core-first hydration | The canonical loader publishes a core snapshot immediately, then separately hydrates important and optional sources. It preserves request sequencing, abort handling, identity confidence, and the structured loading experience. | Retained; the older branch’s simpler callback implementation is superseded. |
| Playoff probability | GitHub-main exposes a calculated logistic proxy. The canonical project intentionally omits that synthetic percentage, validates FanGraphs values as finite bounded data, and adds a separately sourced PlayoffStatus result. | Canonical behavior retained to avoid presenting an invented probability as data. |
| Provider provenance | The canonical FanGraphs parser additionally exposes the upstream provider’s update text. | Canonical enhancement retained. |
| Player-scoped Savant retry policy | Canonical main prevents a failed current-season pitch-level request from immediately causing a duplicate prior-season request, while preserving the valid-empty-response fallback. | Canonical reliability fix retained. |

## Non-main branch decisions

| Branch | Relationship to GitHub `main` at review | Review result | Release decision |
| --- | --- | --- | --- |
| `manus/validated-skip-release-8b15663` | 0 commits ahead; 1 commit behind | Contains no unique code beyond GitHub `main`. | Do not merge. |
| `manus/roster-insights-fallback-93c8481f` | 3 commits ahead; 28 commits behind | Its empty-provider and malformed-metric safeguards are already present in the canonical router and tests. | Superseded; do not merge again. |
| `manus/verified-intelligence-0ebef536` | 1 commit ahead; 29 commits behind | Its core-first profile loading is already represented by the canonical staged loader and progressive hydration UI. | Superseded; do not merge again. |
| `feature/uptime-monitor-dashboard` | 1 commit ahead; 5 commits behind | Adds an uptime dashboard, a new database schema, self-probes, and a scheduled handler, but it does not provision or persist a valid Heartbeat job for the schedule owner. Its migration was authored against an older schema and its fixed production URLs would require independent configuration and monitoring policy review. | Reject as a raw merge candidate; revisit only as a separately planned operational feature. |

## Release-gate baseline decision

The source-comparison baseline now records GitHub `main` at `64213f2` as reviewed. Future GitHub-main changes will return `review-required` until a new compatibility review is completed. This update certifies reconciliation only; the release remains conditional on the automated source comparison, provider checks, type check, formatting check, regression suites, production build, and controlled browser verification.

## Public-domain smoke observations

At 2026-08-18, `https://www.lukerumpler.com/` responded with the expected **SKIP · Scouting Knowledge & Intelligence Platform** title and a populated Los Angeles Dodgers Team Command Center. The initial public route displayed current team-context values, source-aware unavailable playoff odds, a team-WAR value, navigation, selector controls, and export actions without a visible application failure. The public Talent workspace also opened successfully and exposed player search, accessible quick-access player buttons, the player/prospects/draft-board tabs, and the declared MLB Stats API search source. These checks verify public rendering and primary navigation only; they do not replace the automated contract and regression coverage.

## References

[1]: https://github.com/lukerumpler/mlb-terminal/commit/64213f281ba65ae9dc2e12e3ca9341c6aeb5c015 "GitHub main reviewed for this release"
[2]: https://github.com/lukerumpler/mlb-terminal/commit/209b88e617f778990a18699c8b3466c5e0ef560e "Uptime-monitor branch reviewed as a deferred operational feature"
[3]: https://github.com/lukerumpler/mlb-terminal/commit/93c7069d2cd19899d4abcbff580b2389ed79f4d8 "Roster-insights fallback branch reviewed as superseded"
[4]: https://github.com/lukerumpler/mlb-terminal/commit/9b895d6de75709390a81c734a7802a502909216d "Player core-first loading branch reviewed as superseded"
