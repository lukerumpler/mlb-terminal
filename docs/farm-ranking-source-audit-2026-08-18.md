# Farm-Ranking Source Audit — 2026-08-18

## Decision

The Depth grade may use the dated **MLB Pipeline 2026 in-season Farm System Rankings** as a public, organization-level input. The ranking was published on August 16, 2026 and lists all 30 MLB organizations.

**Source:** [MLB Pipeline — Ranking every MLB farm system, 1-30](https://www.mlb.com/news/in-season-farm-system-rankings-2026)

## Baseball America

Baseball America’s public 2026 Top 100 page describes its prospect-ranking methodology, eligibility, industry-input process, and use of its Top 30 work. The accessible page did not expose a complete Baseball America farm-system ranking table or licensed ranking values for application use.

**Permitted use in SKIP:** methodology-reference attribution only.

**Not used in SKIP:** subscription-only Baseball America ranking values, scraped or inferred ranks, or any fabricated equivalent.

**Source:** [Baseball America — 2026 Top 100 MLB Prospects](https://www.baseballamerica.com/rankings/2026-top-100-prospects/)

## Depth Formula

When both inputs exist, SKIP blends **60% verified current-season roster coverage** and **40% MLB Pipeline’s dated farm-system percentile**. If the roster feed is unavailable, the public MLB Pipeline input can stand alone and remains explicitly dated. If neither is available, Depth remains unavailable.

## Playoff Odds Integrity

Primary odds remain a team-specific FanGraphs value. The interface accepts a percentage only if it is finite and within 0–100. The current application also provides clearly labeled source timing and a separately labeled secondary verified postseason-probability source when the primary value is absent; it does not show a generated playoff estimate.
