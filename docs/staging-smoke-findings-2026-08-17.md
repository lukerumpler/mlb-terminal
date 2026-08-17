# Staging smoke findings — 2026-08-17

The Vercel preview deployment `dpl_FpXrurgoitw1E3X46YekGLN2Qrhs` reached `READY` at `https://mlb-terminal-1z9gbqpg9-rumpler.vercel.app`.

The preview is protected by Vercel Authentication. A temporary share link was used solely for smoke verification. The rendered SKIP workspace loaded successfully, but the Overview showed `DATA 0/7 · PENDING` and unavailable data tiles.

A direct staging request to `/api/mlb?path=%2Fstandings&leagueId=103&season=2026&standingsTypes=regularSeason` returned Vercel `404: NOT_FOUND`. This is a staging routing failure, not an MLB-provider response and not a rate-limit event. The repository currently has an Express-backed `api/index.ts` serverless entrypoint and legacy routes that include `/api/mlb`, but `vercel.json` contains no rewrite mapping `/api/*` requests to that entrypoint. The next step is to add the targeted Vercel rewrite, redeploy the preview, and repeat the live provider smoke checks.

## Routing repair retest

After adding the `/api/:path*` rewrite to `/api/index` and redeploying preview `dpl_9Mwy2WmP4vmKk3xFVmUWRfA69c88`, the same `/api/mlb` request no longer returned a route-level `404`. It instead returned Vercel `500 FUNCTION_INVOCATION_FAILED`, confirming that the rewrite reaches the Express serverless function but that the function crashes during initialization or request handling. The next diagnostic step is Vercel runtime-error inspection; no sustained-rate-limit test has been run against this preview.

## Runtime crash diagnosis and repair

Vercel runtime logs identified `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/app' imported from /var/task/api/index.js`. The original TypeScript function entry was emitted with an unresolved source import rather than a deployable bundle.

The repair replaces that entry with a production-build step that bundles `server/vercel.ts` (an API-only Express entrypoint) into `api/index.mjs`. A local HTTP smoke harness imported the generated bundle and verified `GET /api/health` returned `200 {"ok":true,"service":"skip-baseball-api"}`. The OAuth initialization warning during this local probe reflects an intentionally absent OAuth environment variable and did not prevent API initialization or the successful health response.

## Bundled-entry retest

Preview `dpl_2FdFZikj3oRq8ChGxQ8GMy4zZjJS` reached `READY`, but `GET /api/health` returned Vercel `500 FUNCTION_INVOCATION_FAILED`. Because this lightweight endpoint does not contact a provider, the failure remains an application-function initialization defect rather than a data-provider, registry, or rate-limiter condition. Runtime logs for this deployment are required before further changes.

## API-only bundle correction

The final preview’s runtime logs showed that the health request eagerly loaded Vite, which attempted to load the unavailable optional native package `@rollup/rollup-linux-x64-gnu`. `server/app.ts` now imports the Vite/rollup frontend helper only inside the `serveFrontend` branch. The Vercel handler creates the app with `serveFrontend=false`, so this dependency is not loaded on API requests.

A clean `pnpm build`, `pnpm check`, and the generated-bundle HTTP health probe all passed locally after the change. The remaining external verification is a replacement Vercel preview followed by the MLB, identity, intelligence, and UI smoke paths.

## API-only retest result

Preview `dpl_Xz9Cp6zndg68DmyciAmc2aVpS6oe` reached `READY`, but its `GET /api/health` smoke request still returned Vercel `500 FUNCTION_INVOCATION_FAILED`. This confirms that another eagerly imported runtime dependency remains in the generated API bundle. The UI’s loading state is therefore a consequence of serverless initialization failure; no live provider or rate-limit verification is valid until this health route succeeds.

## Deferred Vite import correction

The remaining initialization error came from `server/_core/vite.ts`, whose static Vite and configuration imports still caused Lightning CSS to load when the bundled module was evaluated. Those imports are now variable-path dynamic imports inside `setupVite`, a branch that the Vercel API handler never invokes.

A clean build regenerated `api/index.mjs`; TypeScript validation and the local HTTP health probe passed. The generated API artifact contains no static `vite` or `lightningcss` import reference, which is the required precondition for the next Vercel health-route retest.

## Successful API initialization

Preview `dpl_8AToLfbqrY1zHC2AATt7cQXAFL7q` is the first staging deployment whose API health route returns `200 {"ok":true,"service":"skip-baseball-api"}`. This confirms the Vercel rewrite, bundled entrypoint, and deferred frontend dependencies now permit API initialization. Live provider smoke checks may now proceed without treating application crashes as provider failures.

## Initial live provider smoke results

A serial seven-request final-preview smoke suite respected the application limiter and produced no `429` response. The direct Baseball-Reference identity path returned `200`, `found=true`, `confidence=exact-name`, and direct canonical-page provenance. The strict exact-name Baseball-Reference search path also returned `200`, `found=true`, `confidence=exact-name`, and exact-search provenance. Aggregate telemetry reported two resolver requests, one direct-ID request, one verified canonical page, one exact search match, zero direct rejections or errors, and no name, identifier, IP address, or payload retention.

`/api/intelligence-calculations?mode=all&season=2026` returned `200` with exactly 30 team entries. The client-side calculated-status counter from this live response was zero for the present dataset; this does not change the endpoint’s availability or the required labeling behavior when fallback metrics are returned.

The three attempted MLB proxy routes returned `400`, so their error payloads must be inspected before counting them as successful provider checks. This is not a rate-limit condition and did not affect the independently successful identity or intelligence routes.

## MLB proxy query preservation correction

The MLB proxy error payload was `Invalid path parameter`. The staging rewrite used the capture name `:path*`, and Vercel exposed that capture as a `path` query parameter, overwriting the proxy’s intended `path=/standings` (and equivalent) query input with the route segment `mlb`. The rewrite capture is now `:route*`, preserving the client-supplied MLB path query.

A clean production build and TypeScript validation passed after this configuration-only correction. The next preview will repeat the serial live MLB smoke suite together with the already successful identity and intelligence routes.
