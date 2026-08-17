# Staging smoke findings — 2026-08-17

The Vercel preview deployment `dpl_FpXrurgoitw1E3X46YekGLN2Qrhs` reached `READY` at `https://mlb-terminal-1z9gbqpg9-rumpler.vercel.app`.

The preview is protected by Vercel Authentication. A temporary share link was used solely for smoke verification. The rendered SKIP workspace loaded successfully, but the Overview showed `DATA 0/7 · PENDING` and unavailable data tiles.

A direct staging request to `/api/mlb?path=%2Fstandings&leagueId=103&season=2026&standingsTypes=regularSeason` returned Vercel `404: NOT_FOUND`. This is a staging routing failure, not an MLB-provider response and not a rate-limit event. The repository currently has an Express-backed `api/index.ts` serverless entrypoint and legacy routes that include `/api/mlb`, but `vercel.json` contains no rewrite mapping `/api/*` requests to that entrypoint. The next step is to add the targeted Vercel rewrite, redeploy the preview, and repeat the live provider smoke checks.

## Routing repair retest

After adding the `/api/:path*` rewrite to `/api/index` and redeploying preview `dpl_9Mwy2WmP4vmKk3xFVmUWRfA69c88`, the same `/api/mlb` request no longer returned a route-level `404`. It instead returned Vercel `500 FUNCTION_INVOCATION_FAILED`, confirming that the rewrite reaches the Express serverless function but that the function crashes during initialization or request handling. The next diagnostic step is Vercel runtime-error inspection; no sustained-rate-limit test has been run against this preview.

## Runtime crash diagnosis and repair

Vercel runtime logs identified `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/app' imported from /var/task/api/index.js`. The original TypeScript function entry was emitted with an unresolved source import rather than a deployable bundle.

The repair replaces that entry with a production-build step that bundles `server/vercel.ts` (an API-only Express entrypoint) into `api/index.mjs`. A local HTTP smoke harness imported the generated bundle and verified `GET /api/health` returned `200 {"ok":true,"service":"skip-baseball-api"}`. The OAuth initialization warning during this local probe reflects an intentionally absent OAuth environment variable and did not prevent API initialization or the successful health response.
