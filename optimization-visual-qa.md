# Optimization Visual QA — 2026-08-14

## Desktop (1280 × 720)

The terminal shell, sidebar, breadcrumb, data-freshness badge, and Overview hierarchy render coherently. The page correctly shows verified MLB values while FanGraphs, Savant, venue, and payroll-dependent values remain explicitly unavailable or loading rather than being filled with guesses. The top metric strip is dense at the right edge; the Team WAR cell appears visually clipped against the viewport boundary and should be checked for a min-width or grid-overflow issue.

## Mobile (375 × 812)

The compact header and menu button work, the breadcrumb remains visible, team selection is usable, and the affiliate panel stacks into a readable card. The narrow view intentionally keeps the lower ticker fixed. The metric strip is horizontally scrollable/overflowing rather than collapsing into an unreadable wall, but it would benefit from an explicit accessible scroll affordance and stricter clipping control. No fabricated data appeared; unavailable values stayed labeled as unavailable.

## Runtime note

The preview logged an expected local AI-provider fallback (`AI insights response was empty`) and rendered the local verified fallback rather than failing the Overview page. A Baseline browser-mapping freshness warning is tooling noise, not an application data error.

## Post-fix verification

After adding the `overview-team-metrics` guard, the top Overview metric row no longer pushes the desktop content boundary and mobile shows a contained, horizontally scrollable metric row. The affiliate card remains within the viewport and readable. The lower aggregate stat strip still has a dense rightmost Team WAR cell near the desktop edge; it is a separate stat strip and should be treated as a follow-up only if its parent grid is confirmed to overflow. No new visual regressions were observed.
