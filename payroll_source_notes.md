# Payroll and Luxury-Tax Source Notes

Verified 2026 public source pages on 2026-08-14:

- Spotrac 2026 MLB Team Tax Tracker: https://www.spotrac.com/mlb/tax
  - Page title: 2026 MLB Team Tax Tracker.
  - Describes a real-time view of 2026 team tax totals and estimated tax space.
  - Public table fields include Tax Payroll, Space, Estimated Tax Bill, Total, Active, Injured, Retained, and Minor.
  - The page states that tax figures are based on payroll data only and that outside revenue sources are adjusted after the regular season when available.
  - The displayed 2026 CBT threshold is $244,000,000.

- Spotrac 2026 MLB Team Salary Payroll Tracker: https://www.spotrac.com/mlb/payroll/_/year/2026
  - Page title: 2026 MLB Team Salary Payroll Tracker.
  - Public table fields include Total Payroll, Allocations, Active, Injured, Retained, and Buried.
  - Team links expose club-level values for all 30 MLB teams.

Implementation decision: use a source-labeled, server-side proxy to fetch and parse Spotrac's public team payroll/tax tables, with cached results and explicit unavailable states if the page structure or upstream request fails. Do not treat a missing field as zero and do not fabricate team financial values.
