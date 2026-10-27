# Baseball scraper integration

The standalone Python scraper is not embedded as a second runtime. `mlb-terminal` already has the correct server-side boundary at `/api/fangraphs-models?mode=aggregate&season=YYYY`, so the fallback is implemented in that route.

## Runtime chain

1. Request FanGraphs batting and pitching aggregate WAR pages in parallel.
2. Parse both responses into the existing `teams[]` contract: `team`, `battingWAR`, `pitchingWAR`, and `totalWAR`.
3. If FanGraphs returns no usable total-WAR rows, request Baseball-Reference `team_compare.cgi` for the same season.
4. Parse only explicit team-linked WAR rows and return `source: "Baseball-Reference"`, `fallback: true`, and `statuses.teamWar: "fallback-live"`.
5. Reuse the existing in-memory, durable, daily-attempt, stale-cache, and request-coalescing behavior.
6. The browser adapter keeps the provider source and the Overview labels the Team WAR badge with the actual provider.

Baseball Savant remains a supplemental provider through the existing `/api/savant` route. It is not used as a WAR substitute because Statcast metrics are not the same WAR measure.

## Local verification

```bash
pnpm test -- test/baseball-reference-fallback.test.js test/mlb-provider-client-cache.test.js
pnpm check
pnpm build
```

## Important attribution boundary

Baseball-Reference fallback rows contain aggregate total WAR only. They do not claim batting WAR or pitching WAR components, so those fields remain `null`. Any downstream UI must preserve that distinction rather than splitting total WAR into invented components.
