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

## References

[1]: https://github.com/lukerumpler/mlb-terminal/commit/6582c5c25821862ac4bc1b843c344752c9af821c "GitHub main reviewed for the combined release"
