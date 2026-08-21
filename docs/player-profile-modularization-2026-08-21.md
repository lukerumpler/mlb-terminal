# Player Profile Workflow Modularization — August 21, 2026

## Purpose

The Player Profile page contained presentation, playlist persistence, Statcast-adjacent handedness aggregation, boxscore filtering, saved presets, reconciliation, and data-quality export logic in one large module. This refactor moves cohesive workflows into focused feature modules without changing the page’s verified-data states, accessibility labels, local persistence behavior, or public helper exports.

| Feature module | Responsibility | Compatibility approach |
|---|---|---|
| `features/player-profile/media.js` | Source-safe MLB/YouTube discovery, URL validation, and browser playlist persistence. | Existing helper names remain re-exported from `PlayersPage.jsx`. |
| `features/player-profile/PlayerMediaPanel.jsx` | The video playlist and verified clip interface. | The page delegates its existing media panel slot to this component. |
| `features/player-profile/handedness.js` | Left/right-handed split aggregation. | Existing `buildHandednessComparison` export remains available from the page. |
| `features/player-profile/boxscore.js` | Boxscore rate formatting, filtering, sorting, preset storage, pagination size, and recent-game series construction. | Existing page-level utility exports remain stable for callers and tests. |
| `features/player-profile/PlayerBoxscorePanels.jsx` | Reconciliation, boxscore loading/unavailable states, filter controls, presets, and pagination UI. | Existing `ReconciliationPanel` and `BoxscoreSplitPanel` exports remain available from the page. |

The page container now remains responsible for search, staged player loading, cancellation, favorite records, derived profile data, and composition of feature panels. The extracted modules own their focused interaction and data-transformation contracts.

## Validation

Focused Player Profile tests passed for media playlists, race-condition guards, staged loading, boxscore filtering, reconciliation, metric helpers, and PDF/tax integrations. Direct feature-module regression coverage verifies source-safe media destinations, embeddable URL validation, handedness zero preservation, and boxscore filter/page behavior. The supported full Vitest suite passed with 128 files and 589 tests; the environment-unavailable published-browser E2E suite remains skipped. Type checks, linting, and the production build passed.
