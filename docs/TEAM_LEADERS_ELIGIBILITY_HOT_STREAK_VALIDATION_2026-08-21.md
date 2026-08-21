# Team Leaders Eligibility and Hot-Streak Validation — 2026-08-21

The desktop Team Overview shows the new rate-stat thresholds directly in the stat labels, including `AVG · 50 PA+`, `OPS · 50 PA+`, and `ERA · 10 IP+`. The source-backed roster card retains compact rows and distinct batting and pitching sections.

At 375px mobile width, the Team Leaders card remains within the viewport without page-level horizontal overflow. The thresholds remain readable beside their rate-stat labels, leader names retain their profile action, and the compact card rhythm preserves batting-to-pitching separation. The 14-day hot-streak section is implemented as a single-column responsive grid at this breakpoint and is withheld with an explicit unavailable message whenever verified recent rows are absent.
