# Data repair and UI optimization verification

Desktop Overview verification shows the live aggregate status returning to `LIVE MLB DATA` when the MLB Stats API resolves. Team W-L, win percentage, runs scored, runs allowed, run differential, OPS, home runs, ERA, WHIP, batting average, strikeouts, stolen bases, leaders, front-office evaluation, and the strength radar render with source-backed values. The Team Leaders panel clearly identifies a cached roster snapshot with an age label rather than presenting stale values as live.

Unavailable model-dependent values such as Team WAR and playoff odds are now compact dashes with contextual labels/tooltips instead of repeated wrapped `Source gap` text. The overall rating cards use compact dashes for unavailable defense, depth, and future value while preserving the verified offense, pitching, and baserunning grades.

At 375px, the Overview remains readable and vertically ordered. Team aggregate values fit without horizontal overflow, compact unavailable states do not wrap into noisy text blocks, the team selector and live-status badge remain reachable, and the bottom ticker stays visible. Initial loading now uses small skeleton placeholders for team aggregate metrics, while cached leader data remains visible when available.
