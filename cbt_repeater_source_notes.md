# CBT repeater-tier source notes

Reference date: 2026 season.

## Official MLB source

Source: [MLB Competitive Balance Tax glossary](https://www.mlb.com/glossary/transactions/competitive-balance-tax)

The official glossary lists the 2026 CBT threshold as $244 million. It defines the base consecutive-year rates as 20% for the first year over the threshold, 30% for the second consecutive year, and 50% for the third consecutive year or more. It also describes surcharge bands: $20 million to $40 million over the threshold carries a 12% surcharge; $40 million to $60 million carries a 42.5% surcharge in the first year and 45% in each consecutive year after; and $60 million or more carries a 60% surcharge. The penalty level resets after a season below the threshold.

## Spotrac source

Source: [Spotrac 2026 MLB Team Tax Tracker](https://www.spotrac.com/mlb/tax)

Spotrac supplies team tax payroll, tax-space, estimated tax-bill, and threshold fields for the public tracker. The page notes that its tax figures are payroll-based estimates. The current public response does not expose a verified consecutive-year tax history, so SKIP must display repeater history as unavailable rather than assume a first-, second-, or third-year rate.

## Implementation constraint

The multi-year model may calculate CBT exposure and overage when verified player AAV and team tax payroll are present. Estimated tax is intentionally null when repeater history is unavailable. Projection assumptions are shown in the UI and PDF: 3% annual AAV growth and 3% annual team payroll growth. These are model assumptions, not official club forecasts.
