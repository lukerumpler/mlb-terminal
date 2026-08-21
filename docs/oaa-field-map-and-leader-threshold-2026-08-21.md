# OAA Field Map, Selected Methodology, and Team Leaders Threshold — August 21, 2026

## Live Briefing Verification

The current Team Overview at the managed preview URL was inspected on August 21, 2026. The Team Leaders header displays **148 PA min** for a 77–51 club: `ceil(33% × 3.5 PA/game × 128 games) = 148`. The same threshold is shown on AVG and OPS leader rows. The Front Office Evaluation shows an explicit zero-item weaknesses message and the current active **Overall methodology** only; it does not display the former combined multi-grade methodology paragraph.

The Performance workspace will be validated separately for the position-level OAA field map. The map is required to show only returned Baseball Savant OAA values and an explicit unavailable state otherwise.

## Live Performance Verification

The Performance workspace was inspected with the live preview. The Position Breakdown panel presents verified roster player-count coverage separately from the new OAA field map. In this live response, Baseball Savant returned no position-level OAA rows; the map correctly reported that per-position OAA was unavailable and did **not** convert roster depth into defensive values. This confirms the required data-integrity guardrail. Component regression coverage separately verifies the field layout and aggregation path when valid returned OAA rows exist.

At the 375-pixel breakpoint, the Team workspace controls remained readable and the compact Front Office Read strip maintained its hierarchy. The Team Leaders and Front Office Evaluation panels follow the established single-column responsive layout below the captured workspace controls; their value and methodology text use existing wrapping rules without a fixed-width dependency.
