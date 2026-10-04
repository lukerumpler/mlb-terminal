# Historical CBT trend source notes

## Sources reviewed

- MLB official CBT glossary: https://www.mlb.com/glossary/transactions/competitive-balance-tax
  - 2024 CBT threshold: $237M.
  - 2025 CBT threshold: $241M.
  - 2026 CBT threshold: $244M.
  - First year over threshold: 20% base tax; second consecutive year: 30%; third-plus consecutive year: 50%.
  - Surcharge bands begin at $20M over threshold; MLB glossary lists $20M–$40M, $40M–$60M, and $60M+ bands.
  - Consecutive-year penalty resets when a club falls below the threshold for a season.

- Spotrac season-specific MLB tax tracker: https://www.spotrac.com/mlb/tax/_/year/2025
- Spotrac current MLB tax tracker: https://www.spotrac.com/mlb/tax
- Spotrac season-specific MLB payroll tracker: https://www.spotrac.com/mlb/payroll/_/year/2026
  - Search results confirm season-specific tax tracker URL format `/mlb/tax/_/year/{season}` and payroll tracker URL format `/mlb/payroll/_/year/{season}`.
  - The SKIP server proxy now requests the explicit season-specific Spotrac tax URL instead of relabeling the current page.

- Historical example for validation context: True Blue LA / Associated Press reporting on Dodgers 2025 CBT: https://www.truebluela.com/dodgers-payroll/108038/dodgers-payroll-competitive-balance-tax-2025
  - Reports 2025 Dodgers CBT payroll $417,341,608, tax $169,375,768, threshold $241M, and historical 2013–2025 franchise rows.
  - This is an external historical article, not a universal hardcoded dataset for every club; SKIP should show unavailable states when a season-specific Spotrac response is unavailable.

## Modeling constraint

Historical franchise trend charts must plot only season rows returned by the season-specific proxy. Missing years remain unavailable rather than being imputed or fabricated. Repeater history remains unknown unless the source explicitly provides consecutive-year status; the MLB CBT threshold/rate rules are shown as source-backed context, not as a fabricated historical tier.
