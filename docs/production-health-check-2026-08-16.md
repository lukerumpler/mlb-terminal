# Production Health Check — 2026-08-16

## Deployment identity

GitHub PR #1 was merged at 2026-08-16T19:40:28Z with merge commit `ffb803e6c417897dfad0dbfa95d898468edab4f7`. GitHub `main` points to that same commit.

GitHub deployment records show a deployment for the merged SHA `ffb803e6c417897dfad0dbfa95d898468edab4f7` in the `Production` environment, deployment ID `5934706308`, updated at 2026-08-16T19:41:12Z. The immediately preceding preview deployment for PR head `f855dcc3c7a36fbeca1e6b0b3a11f2df2a069f3c` was deployment ID `5934672512`.

A prior Production deployment at `aa73d314e2e417ed4b95f8624f48aa004e31c654` was deployment ID `5913199255` from 2026-08-14. The post-merge production deployment therefore corresponds to the merged main commit, not the prior main revision.

Source: GitHub repository deployment records at https://api.github.com/repos/lukerumpler/mlb-terminal/deployments and PR page https://github.com/lukerumpler/mlb-terminal/pull/1.

## Initial production probe findings

The merged Vercel Production deployment reports `success`, but direct requests to representative API paths such as `/api/mlb?path=/teams/119`, `/api/intelligence-calculations?teamId=119&season=2026`, and `/api/savant?...` returned HTTP 200 HTML application-shell content after redirects, beginning with `<!DOCTYPE html>`, rather than JSON or Savant CSV.

The repository’s `vercel.json` declares `"framework": "vite"` and `"outputDirectory": "dist/public"`; it has no API rewrites or serverless-function mappings for the Express routes. The package build produces both `dist/public` and a bundled `dist/index.js`, but the Vercel deployment is configured as a static Vite deployment. Therefore the GitHub/Vercel deployment check can be green while the production API proxies are not reachable at that Vercel hostname. The local Express server and Manus WebDev deployment are separate runtime paths.

This is a deployment-routing issue, not evidence that the MLB/Savant proxy parsers are failing. It must be fixed in the Vercel deployment configuration or by using the managed Manus server deployment before production API health can be considered green.

## Endpoint probe results

The merged Vercel production hostname `https://mlb-terminal-hdgpsyv61-rumpler.vercel.app` returned the Vercel HTML application shell for representative `/api/mlb`, `/api/intelligence-calculations`, and `/api/savant` requests after redirects. Those paths did not return JSON or Savant data.

The managed Manus deployment `https://skipbasebal-mm6hz9ps.manus.space` served the Express API correctly. `/api/mlb?path=/teams/119` returned HTTP 200 JSON. `/api/intelligence-calculations?teamId=119&season=2026` returned HTTP 200 JSON with `X-Provider-Cache: DAILY` and `provenance: calculated-from-verified-standings`. Valid Savant endpoints also returned HTTP 200 JSON: `expected_statistics` and `statcast_leaderboard` were cached hits, `oaa` was a live miss, and `team_exit_velocity` was a cached empty array. The invalid raw leaderboard path returned a correct HTTP 400 endpoint-validation response.

The Vercel runtime-error MCP query was unavailable with the authenticated project listing (403 / no project returned), so runtime-log verification for the Vercel project could not be completed through that connector. GitHub deployment status still reports the merged Production deployment as successful.
