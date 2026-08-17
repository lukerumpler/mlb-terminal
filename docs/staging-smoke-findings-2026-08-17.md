# Staging smoke findings — 2026-08-17

The Vercel preview deployment `dpl_FpXrurgoitw1E3X46YekGLN2Qrhs` reached `READY` at `https://mlb-terminal-1z9gbqpg9-rumpler.vercel.app`.

The preview is protected by Vercel Authentication. A temporary share link was used solely for smoke verification. The rendered SKIP workspace loaded successfully, but the Overview showed `DATA 0/7 · PENDING` and unavailable data tiles.

A direct staging request to `/api/mlb?path=%2Fstandings&leagueId=103&season=2026&standingsTypes=regularSeason` returned Vercel `404: NOT_FOUND`. This is a staging routing failure, not an MLB-provider response and not a rate-limit event. The repository currently has an Express-backed `api/index.ts` serverless entrypoint and legacy routes that include `/api/mlb`, but `vercel.json` contains no rewrite mapping `/api/*` requests to that entrypoint. The next step is to add the targeted Vercel rewrite, redeploy the preview, and repeat the live provider smoke checks.
