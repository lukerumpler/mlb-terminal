# Branch Integration Audit and Selective Optimization

**Repository:** `lukerumpler/mlb-terminal`
**Production baseline at review start:** `1265bf2`
**Reviewed:** 2026-08-18

## Decision standard

Each live branch was compared with the production baseline for ancestry, divergence, commit scope, data/provenance compatibility, and testability. Branches were not merged wholesale merely because their commit messages described useful work. Where a small, independently valuable change remained absent from production, it was ported into the current codebase with current tests and current data contracts preserved.

| Branch | Head at review | Divergence from baseline | Decision | Rationale |
|---|---:|---:|---|---|
| `manus/c89f9939` | `a565323` | 1 ahead / 71 behind | Do not merge | An old synchronization checkpoint spanning more than 150 files from a substantially stale base. Its implementation has been superseded by later provider, identity, cache, UI, and release work. |
| `manus/roster-insights-fallback-93c8481f` | `93c7069` | 3 ahead / 22 behind | Selectively integrate | Its full branch is stale, but it contained two still-relevant safety improvements: finite numeric parsing for local roster fallbacks and rejection of semantically empty AI insight arrays. Both were ported into current `server/routers.ts` with expanded regressions. |
| `manus/validated-skip-release-32b68149` | `266e875` | 2 ahead / 1 behind | Do not merge | The open review branch contains an outdated repository-wide rewrite, including removal/replacement of deployment artifacts, broad dependency and schema churn, and deletion of release evidence. It is unsuitable for a production merge. |
| `manus/verified-intelligence-0ebef536` | `9b895d6` | 1 ahead / 23 behind | Selectively integrate | The historical branch’s core-first Player Profile rendering idea remains valuable. It was adapted to the current loader while retaining current provider identity, provenance, and late-load safeguards. |

## Integrated improvements

### Safe roster-insights fallback

The local fallback now treats blank values, malformed numeric strings, `Infinity`, and `NaN` as unavailable. It uses a verified direct run differential when present, otherwise derives a differential only when both verified runs-scored and runs-allowed values are finite. It also treats a schema-valid AI response with both insight arrays empty as unusable and returns the explicitly labelled local verified fallback instead.

> This prevents a provider failure or incomplete model response from being presented as a neutral or evidence-based baseball conclusion.

### Core-first Player Profile rendering

The Player Profile now publishes a source-aware core snapshot after official profile and season data resolve, while optional Baseball Savant and game-by-game boxscore enrichment continues in the background. The page replaces its full skeleton with the official profile and displays an explicit status notice during enrichment. The message clarifies that temporary blanks are neither unavailable data nor estimates. Existing selection-sequence checks still prevent a slower prior player request from overwriting the newer selection.

## Validation

| Check | Result |
|---|---:|
| Focused selected-change tests | 17 passed |
| TypeScript | `pnpm check` passed |
| Full regression suite | **91 files passed; 1 skipped. 451 tests passed; 2 skipped.** |
| Production build | `pnpm build` passed |

No changes were made to the exact-name Baseball-Reference mapping, telemetry payloads, rate-limit behavior, provider contracts, or calculated-metric labels.
