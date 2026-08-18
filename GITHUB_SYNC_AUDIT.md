# GitHub and Shared-Main Synchronization Audit

**Review date:** August 17, 2026  
**Decision:** Retain the current shared-project implementation; do not replace it with the older GitHub tree.

The managed synchronization restarted the local project against its canonical shared remote. The current shared `main` resolved to `fbe0d47`, while the separately linked GitHub repository, `lukerumpler/mlb-terminal`, resolved to `ffb803e`. GitHub’s `ffb803e` merge has `aa73d31` as its first parent, which explains the reported local/GitHub mismatch: the two histories evolved through different release paths rather than representing a simple unpushed local commit.[1]

| Area reviewed | GitHub reference at `ffb803e` | Current shared project | Reconciliation decision |
|---|---|---|---|
| Release lineage | Merge of verified intelligence and Savant mapping repairs | Later shared release sequence through `fbe0d47` | Preserve the shared release history; do not overwrite it with an older branch tree. |
| Savant field aliases | Adds fallback aliases for barrel rate and hard-hit rate | Includes the same aliases, plus the current percentile-row implementation | Retained in the shared project. |
| Intelligence calculations | Adds verified win-pace and Pythagorean calculations with daily caching | Includes the endpoint, tests, MLB JSON-only response handling, and Savant cache coverage | Retained in the shared project. |
| Player search and profiles | Earlier profile behavior | Adds accessible name search, direct profile opening, Favorites, recent-history handoff, and arrow-key result navigation | Preserve the shared project’s newer behavior. |
| Validation baseline | GitHub merge recorded 90 test files and 418 tests | Current shared project passes 101 test files and 490 tests, plus type and production-build checks | Use the shared project as the stronger validated baseline. |

The comparison found 45 differing application, server, or test paths. That divergence is expected after independent releases and makes a wholesale file replacement unsafe. The current project already includes the key verified GitHub safeguards that were reviewed: Savant alias normalization, JSON-only MLB proxy rejection, intelligence calculations, and daily-cache coverage. It also contains later Team Overview, affiliate-workflow, Favorites, and keyboard-accessibility work that would be at risk from a broad GitHub merge.

> **Outcome:** The current shared `main` is the best compatible combined release state. The GitHub history was used as a reference source, and its relevant safeguards are already present or superseded locally. No destructive reset, forced update, or automated overwrite was performed.

## Validation

The synchronized local project passed TypeScript validation, a production build, and the complete regression suite: **101 test files and 490 tests**.

## References

[1]: https://github.com/lukerumpler/mlb-terminal/commit/ffb803e6c417897dfad0dbfa95d898468edab4f7 "GitHub commit ffb803e — Merge verified intelligence and Savant mapping fixes"
