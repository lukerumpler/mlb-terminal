# Visual verification notes

The desktop Overview screenshot shows the global data freshness indicator in the top bar as `DATA 0/7 · PENDING` before upstream responses arrive. The Franchise CBT Trend panel now displays a `2022–2026` badge and a visible `History` selector set to `5 seasons`, with the existing source-loading status preserved. Team logo, panel spacing, and the financial trend controls remain aligned.

The mobile Overview screenshot shows the indicator updating to `DATA 2/7 · Just now` after successful feed responses. It stays compact and readable in the top bar without overlapping the SKIP layout. The existing mobile overview remains free of visible horizontal overflow; the selector sits below the first mobile fold with the chart panel, so its desktop placement and focused regression tests cover the control while the live preview confirms the global status behavior.

The dev server also reports a stale baseline-browser-mapping advisory, which is a dependency-maintenance notice rather than an application error. Existing upstream MLB timeout messages remain handled by the app’s unavailable/loading states.
