# Combined Release Audit

**Review scope:** GitHub `main` through `9aeea29996ca681ffeec64df7beb789e2f79419b` and the synchronized shared project through `6096f4e`.  
**Decision:** Publish the combined release from the shared project, retaining its newer user-approved Team Overview and release-control work while integrating the compatible GitHub identity and Vercel hardening.

The GitHub review covered the player identity, data-loading resilience, Vercel runtime, and release-hardening changes introduced after the prior reviewed GitHub baseline. It also included the subsequent `6582c5c` provider-loading update, whose FanGraphs team-name aliases and alternate metric-header support are now merged into the shared parser. The shared branch already contained later cache-aware Team Overview behavior, clearly labeled fallback calculations, provider-health release controls, accessible player search, and organization-depth interactions. Replacing its overlapping files wholesale would have discarded those later improvements, so the combined release merges the verified behavior at the source level rather than treating either tree as an automatic winner.[1]

| GitHub improvement | Combined-release implementation | Decision |
|---|---|---|
| Strict Baseball-Reference identity resolution | Added an exact normalized-name resolver, canonical-player-page verification, in-flight de-duplication, server cache, browser cache, and explicit invalidation. | Retained and strengthened with the missing storage keys and API helper imports supplied. |
| Client-side identity reuse telemetry | Added aggregate-only browser counters for resolver, cache, direct-ID, search, invalidation, and fallback events. No player names or IDs are stored in telemetry. | Retained. |
| Vercel URL normalization and Node 22 target | Added absolute-request URL normalization to the existing TypeScript Vercel entrypoint and a Node 22 engine declaration. | Retained without adding GitHub’s generated bundle artifact. |
| All-team model and UI fallback changes | The shared release already contains newer, user-approved, clearly labeled MLB-standings fallback behavior and its associated coverage. | Shared implementation retained. |
| GitHub audit scripts and historical reports | The release gate now provides the durable source comparison and provider probes needed for the shared workflow. Historical one-off artifacts were not copied as production code. | Superseded by the shared release controls. |

> **Safety outcome:** Player identity is now accepted only when the MLB identifier, an exact normalized player name, a valid Baseball-Reference identifier, and the canonical Baseball-Reference path agree. Missing or rejected identity resolution remains explicitly unavailable; it never fabricates an alternate player match.

## Release-Gate Baseline

The GitHub baseline has advanced to `6582c5c` because this compatibility review completed and the relevant code paths were either integrated or intentionally superseded by newer shared implementations. A future GitHub advance will again return `review-required` before release.

## 2026-08-18 Branch Review

GitHub `main` advanced to `1265bf2` with an accessibility and responsive analytic-card pass. Its compatible shared-primitive improvements are integrated into the current shared release: labeled Panel and StatStrip regions, wrapping card headers and badges, named metric cells, semantic source/freshness lists, and responsive metric reflow on smaller screens. This preserves the established data contracts and source-state labels while improving scanability on narrow displays.[2]

| Candidate branch | Review result | Managed-release decision |
|---|---|---|
| `main` at `1265bf2` | One compatibility-reviewed card-accessibility and responsive-layout commit beyond the prior baseline. | Integrate the shared component and CSS improvements; advance the release-gate baseline. |
| `manus/validated-skip-release-32b68149` / PR #2 | Validated ancestor of the current shared release, but one GitHub-main commit behind and marked dirty by GitHub. | Do not merge raw. It omits newer shared Team Overview, profile, and optimization work; a fresh export should be prepared against the reviewed GitHub main instead. |
| `manus/roster-insights-fallback-93c8481f` | Its local verified fallback behavior and malformed-input protections are already present in the shared router and tests. | Superseded; do not merge again. |
| `manus/verified-intelligence-0ebef536` | Its core-first player profile hydration behavior is already represented by the current staged loading, identity state, and skeleton implementation. | Superseded; do not merge again. |
| `manus/c89f9939` | A broad, older mixed branch with documentation, schema, generated configuration, API, and UI changes; it is far behind the reviewed release. | Reject as a raw merge candidate; consider individual features only after separate source and contract review. |

> **Branch decision:** The managed shared release is the codebase to publish. Existing GitHub branches are evidence sources, not wholesale merge targets. The next GitHub export should start from the current shared release and target `main` after this reviewed baseline, rather than merging PR #2 directly.

GitHub `main` then advanced to `5095d4b`. That commit bundles the same two historical improvements from the stale roster-fallback and core-first-profile branches: finite-value roster fallback parsing with empty-model-response rejection, and non-blocking player-profile enrichment. The current shared release already contains the guarded roster fallback plus a newer staged profile loader, explicit identity confidence, and a structured progressive hydration skeleton. The GitHub implementation’s plain enrichment banner was therefore not copied; its behavior is superseded by the current user-facing implementation.[3]

## References

[1]: https://github.com/lukerumpler/mlb-terminal/commit/6582c5c25821862ac4bc1b843c344752c9af821c "GitHub main reviewed for the combined release"
[2]: https://github.com/lukerumpler/mlb-terminal/commit/1265bf224d4b71cd56bdf40f14159b132811dcbe "Analytic card accessibility and responsive layout review"
[3]: https://github.com/lukerumpler/mlb-terminal/commit/5095d4bc80a3b3a803d19bceab6ac204b374f0d7 "Roster fallback and staged player loading review"
