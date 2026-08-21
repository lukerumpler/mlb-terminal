# Low-Data Request Budget Validation — 2026-08-21

Desktop verification confirms that the initial Team Overview remains readable after non-essential provider work was deferred. The bottom ticker remains present with the official MLB source treatment and no layout shift.

At 375px, the revised top-level workspace, compact executive strip, and fixed ticker fit without visible horizontal overflow. The ticker remains legible at the bottom of the viewport. Its deliberately slow continuous motion is controlled in code, while the reduced-motion stylesheet disables both the ticker scroll and live beacon.

The audit also identified and deferred two high-cost initial paths: the large Baseball Savant OAA leaderboard is now requested only in Performance, while the multi-season financial history is requested only in Operations. Global cache telemetry now refreshes every five minutes normally and every ten minutes in Low Data Mode. The MLB ticker uses adaptive official-data intervals rather than a fixed 90-second poll.
