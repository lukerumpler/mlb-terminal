# SKIP Production-Readiness Remediation Record

**Date:** 2026-08-17  
**Scope:** The active Manus project at `/home/ubuntu/skip-baseball`, its managed Manus deployment, and the linked Vercel frontend project. This record intentionally separates verified project facts from configuration that must be completed in the relevant hosting dashboard.

## Verified fixes in this remediation pass

| Release-gate area | Verified result | Evidence |
| --- | --- | --- |
| Published Overview E2E targeting | CI now requires `SKIP_LIVE_URL`, so a CI run cannot silently test the local fallback domain instead of the intended deployment candidate. Local developer runs retain the managed Manus URL as a convenience fallback. | `test/helpers/publishedOverviewTarget.js` and `test/published-overview-target.test.js` |
| Vercel preview validation | The protected Vercel preview passed both published Overview assertions when accessed with a temporary authorized preview URL. The direct URL is protected by Vercel SSO, so unauthenticated checks correctly cannot treat its redirect page as a working dashboard. | Controlled browser test on 2026-08-17 |
| Player-advanced proxy CORS | Corrected the handler to call `applyCors(req, res)`. The prior one-argument call could crash before the proxy’s preflight response was created. The new regression checks a production allowlisted `OPTIONS` request. | `server/api/player-advanced.js` and `server/api/player-advanced.test.ts` |
| Runtime dependency security | Production audit results improved from **1 critical and 21 high** advisories to **0 critical, 0 high, 0 moderate, and 0 low**. Direct packages were updated and only audited patch-level transitive resolutions were overridden. | `pnpm exec pnpm audit --prod --json` on 2026-08-17 |
| pnpm resolution configuration | Moved overrides and the existing Wouter patch declaration from the ignored manifest `pnpm` field to `pnpm-workspace.yaml`. The project declares pnpm 10.18.0, the release used to confirm the workspace settings are applied. | `pnpm-workspace.yaml`, `package.json`, and regenerated `pnpm-lock.yaml` |

## Production deployment and configuration evidence

The primary managed Manus deployment continues to be the appropriate API host because it carries the durable cache, stale fallback, and once-per-UTC-day provider-refresh guarantees. The linked Vercel project should remain a **frontend deployment** unless its stateful provider/cache architecture is deliberately redesigned.

| Item | Verified state | Release implication |
| --- | --- | --- |
| Latest Vercel deployment | `dpl_4biY6PVjL8A9HJ2MxZZAxXK5hjab` is `READY`, but has `target: null`, so it is a preview rather than a production promotion. | It cannot represent the public release. |
| Latest Vercel production deployment | `dpl_2ugGouJUcpsrvcpuJ8EWVur7Ak45`, commit `ffb803e6`, is the latest observed deployment with `target: production`. | It does not include this remediation pass. |
| Vercel project state | The project reports `live: false`; custom domains include `lukerumpler.com` and `www.lukerumpler.com`. | A new production promotion is still required after the reviewed code is exported and accepted. |
| Manus API CORS probe | A GET to the deployed Manus `/api/cache-health` endpoint from the `https://mlb-terminal.vercel.app` origin returned no `Access-Control-Allow-Origin` header. The server appropriately returned `Vary: Origin`. | A browser-hosted Vercel frontend is **not currently authorized** to read that Manus API response. |
| CORS implementation | The API allowlist reflects only origins found in `ALLOWED_ORIGIN`, uses `Vary: Origin`, and fails closed in production when the origin is not allowlisted. | The code is ready; the production allowlist must contain the final frontend origins. |

## Required closure steps before public promotion

> These steps are intentionally not automated here because they change hosting configuration or publish a public deployment. They must be completed only after the final frontend domain is chosen and the reviewed code is promoted through GitHub.

1. Complete the GitHub-main compatibility review. The new release gate correctly halted because GitHub main advanced from the accepted `ffb803e6` baseline to `f7f45a5`; that range includes broader identity, fallback, Vercel-entrypoint, and release-hardening changes. Do not update the accepted baseline until those changes are reviewed against this managed project.
2. Set the Manus production `ALLOWED_ORIGIN` secret to the final Vercel frontend origin or an explicit comma-separated allowlist of final origins. Do not use `*` in production.
3. Set Vercel’s production `VITE_API_BASE` to the HTTPS Manus API origin. The client’s shared origin helper then directs Vercel-browser API calls to Manus while preserving same-origin calls in the managed Manus deployment.
4. Export or merge the verified remediation code to the GitHub branch that is intended for release, then trigger a new **production** Vercel frontend deployment. Confirm the deployment has `target: production` and its commit includes this remediation.
5. Run the published Overview E2E suite with `SKIP_LIVE_URL` set to the exact production candidate. The CI guard now makes this target declaration mandatory.
6. Confirm the deployed Manus API returns the expected `Access-Control-Allow-Origin` header for the final Vercel origin, then re-run a browser data-load smoke test covering Overview and Player Profile.

## Residual non-blocking engineering items

The current install warns that `@builder.io/vite-plugin-jsx-loc@0.1.1` advertises compatibility through Vite 5 while the project uses Vite 7. This is a **development-time peer warning**, not a production audit advisory. It should be resolved through a separately tested plugin update, replacement, or explicit removal rather than a last-minute production release change.

The local pnpm executable supplied by the environment remains older than the project-declared pnpm 10.18.0. Release and CI jobs must honor the `packageManager` field or execute the project-local pnpm version so the lockfile’s overrides and patch mappings are applied consistently. pnpm documents that dependency `overrides` belong in `pnpm-workspace.yaml` at the workspace root.[1]

## References

[1]: https://pnpm.io/10.x/settings "pnpm 10.x settings: workspace-level dependency overrides"
