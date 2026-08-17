# MLB Terminal — Staging Deployment & Live Verification Report

**Date:** August 17, 2026  
**Deployment:** [Vercel staging preview](https://mlb-terminal-ofuobmge8-rumpler.vercel.app)  
**Final local commit:** `8d189c9` — `Document final staging smoke results`  
**Base checkpoint:** `16fe9ae` — `Add identity performance resilience checks`

## Outcome

The latest MLB Terminal checkpoint is deployed to a protected Vercel staging preview and passed production-like, live smoke verification against the MLB Stats API and Baseball-Reference. The deployment repair work addressed three staging-only faults encountered during validation: missing API routing, an unbundled serverless entrypoint, and frontend-only native dependencies that were loading in the API runtime. The final preview’s API health endpoint is operational, provider paths return live data, calculated fallback metrics are visibly distinguished from FanGraphs metrics, and the player profile presents the exact-name Baseball-Reference confidence state.

> **Alerting decision:** Automated email alerts and weekly summaries are explicitly deferred. No mailbox or transactional-email service was enabled, no schedule was created, and no email was sent.

## Deployment Validation

| Area | Final result | Evidence |
| --- | --- | --- |
| Vercel preview | **Ready** | `dpl_4biY6PVjL8A9HJ2MxZZAxXK5hjab` reached `READY`. |
| API startup | **Passed** | `GET /api/health` returned `200` with `{"ok":true,"service":"skip-baseball-api"}`. |
| Production build | **Passed** | `pnpm build` completed successfully. |
| Type validation | **Passed** | `pnpm check` completed successfully. |
| Bundled function check | **Passed** | Local HTTP harness loaded the generated Vercel bundle and received a successful health response. |
| Working tree | **Clean** | Final report committed at `8d189c9`. |

## Live API Smoke Results

The final smoke suite was serial and kept below the application’s configured request ceiling. It deliberately used the real external providers only for functional provider paths.

| Endpoint or flow | Result | Verification details |
| --- | --- | --- |
| MLB standings proxy | **Passed** | `200`; three standings records returned for the requested league scope. |
| MLB schedule proxy | **Passed** | `200`; one requested date returned. |
| MLB player search proxy | **Passed** | `200`; one matching player returned. |
| Baseball-Reference direct-ID path | **Passed** | `200`; canonical page verified with **exact-name** confidence and direct-ID provenance. |
| Baseball-Reference name-search path | **Passed** | `200`; resolved only through an **exact-name** search match. |
| All-team intelligence fallback | **Passed** | `200`; exactly **30** team entries returned. |
| Resolver metrics | **Passed** | Aggregate-only counters and latency summaries returned with no player names, IDs, IP addresses, or request payloads retained. |
| Rate limiter | **Passed** | Requests 1–30 returned validation `400`; request 31 returned `429` with `Retry-After: 10`; the same request returned `400` after the window elapsed. |

The live resolver smoke instance recorded one direct canonical verification and one exact-name search match, with no direct canonical rejection or error. Observed cold-path latency was **70 ms** for direct canonical verification and **93 ms** for exact-name search.

## Rendered UI Verification

The staging Overview hydrated from its initial loading state to live MLB, Baseball Savant, roster, and schedule data. When provider data was unavailable, the fallback presentation was appropriately distinct:

| UI element | Verified display behavior |
| --- | --- |
| Team WAR fallback | Displayed as **WAR proxy**, marked **Calculated**, and explicitly described as a pythagorean replacement-baseline proxy rather than FanGraphs Team WAR. |
| Playoff fallback | Displayed as **Playoff est**, marked **Calculated**, and described as a standings-pace estimate rather than official odds. |
| Projected wins and losses | Displayed as calculated MLB standings outputs, not FanGraphs projections. |
| Player data-confidence strip | Aaron Judge’s profile displayed **B-Ref ID · Exact name** beside the MLB, Savant, and Spotrac indicators. |
| Live data state | The Overview displayed verified standings, aggregates, roster rows, Statcast values, and the current schedule. |

## Deployment Repairs Included

The deployment work added a Vercel-specific API delivery path while preserving the existing application behavior.

| Change | Purpose |
| --- | --- |
| `/api/:route*` rewrite to `/api/index` | Routes legacy Express API paths through the single serverless entrypoint without overwriting the MLB proxy’s required `path` query parameter. |
| Generated `api/index.mjs` bundle | Provides a deployable serverless artifact rather than relying on unresolved TypeScript source imports. |
| API-only Express entrypoint | Reuses the existing legacy routes and health endpoint in Vercel. |
| Deferred Vite imports | Prevents Vite, Rollup, and Lightning CSS native dependencies from loading in API-only serverless requests. |
| Bundle smoke harness | Adds a repeatable local HTTP test for the generated serverless function. |

## Alerting Status

No automated email alerts are active. This preserves the explicit instruction to send **no emails for now**. The deployed `/api/player-identity?mode=metrics` endpoint and the existing rate-limit behavior remain available for manual, on-demand health checks if alerting is enabled later.

## Key Commits

| Commit | Summary |
| --- | --- |
| `16fe9ae` | Identity performance resilience checks. |
| `01c5935` | Vercel legacy API routing repair. |
| `0a620ab` | Bundled Vercel API entrypoint. |
| `d77eedd` | API-only serverless initialization repair. |
| `00dee7c` | Deferred Vite dependencies from API bundle. |
| `33050ed` | Preserved the MLB proxy `path` query in the Vercel rewrite. |
| `8d189c9` | Final staging smoke record and no-email decision. |

## Notes for Review

The staging preview is protected by Vercel Authentication. The deployment is therefore suitable for authenticated staging review rather than public production traffic. No change was made to production aliases or domains.
