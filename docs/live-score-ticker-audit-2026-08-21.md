# Live-Score Ticker Audit — 2026-08-21 UTC

## Verified production facts

The public MLB proxy successfully served the current UTC schedule at the time of review. `GET /api/mlb?path=/schedule&sportId=1&date=2026-08-21&hydrate=linescore,team&language=en` returned HTTP 200 with 15 games, all in the `Scheduled` state. The upstream MLB Stats API returned the same schedule shape. This rules out a current production route or provider availability failure as the primary cause of the inactive ticker.

The ticker currently has no timed refresh. It fetches on mount and again only when browser focus or document visibility changes. Its client adapter additionally uses a 60-second local cache for the schedule request, while the server proxy applies a schedule cache policy. As a result, it cannot deliver the intended periodic live-score updates while a user remains on the application.

The component’s moving track is styled inline and depends on `@keyframes scrollx` being emitted from an unrelated App-level style block. It provides no dedicated track or content classes, no motion-reduced static layout, and no `aria-live` status semantics. This creates a fragile animation contract and makes behavior difficult to inspect or regression-test.

## Browser review limitation

The public page’s initial browser extraction displayed `Loading SKIP…`; the follow-up browser inspection timed out through the connected browser extension. The deployed API probe above succeeded independently. Local visual verification will be performed after the repair with the repository development server.

## Post-repair local visual verification

The repository development server was restored with Express 5-compatible named fallback routes and returned HTTP 200 for both the application shell and the local `/api/mlb` schedule proxy. The proxy returned 15 current schedule rows.

Headless Chromium verified the rendered ticker at 1280×720 and 390×844. At both breakpoints, the track was enabled for animation, used the `skip-ticker-scroll` keyframe, had a 90-second duration for the 15-game slate, and was wider than its clipped ticker viewport. Screenshots confirmed readable scheduled-game entries at the bottom of the desktop and mobile application layouts.
