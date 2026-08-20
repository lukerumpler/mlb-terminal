# Vercel Production Configuration Inventory

The Vercel deployment uses two groups of variables.

## Required server-side variables

| Variable | Purpose | Required for |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string used by Drizzle and uptime-monitor persistence | Database-backed API routes and scheduled checks |
| `JWT_SECRET` | Session-cookie signing and verification | OAuth and authenticated API flows |
| `VITE_APP_ID` | Manus OAuth application identifier | OAuth callback and session creation |
| `OAUTH_SERVER_URL` | Manus OAuth verification service URL | Authenticated request verification |
| `OWNER_OPEN_ID` | Project-owner identity used by protected operations | Owner-aware server logic |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API base URL | Storage, data, and platform integrations |
| `BUILT_IN_FORGE_API_KEY` | Server-side bearer credential for the built-in API | Storage, data, and platform integrations |
| `ALLOWED_ORIGIN` | CORS allow-list for browser requests; use the production frontend origin(s) | Cross-origin API calls |

## Required browser-facing variables

| Variable | Purpose |
|---|---|
| `VITE_OAUTH_PORTAL_URL` | Browser login portal URL |
| `VITE_FRONTEND_FORGE_API_URL` | Browser-accessible built-in API URL, if frontend integrations are used |
| `VITE_FRONTEND_FORGE_API_KEY` | Browser integration credential, if required by the enabled frontend features |
| `VITE_APP_TITLE` | Production document/application title |
| `VITE_APP_LOGO` | Production application logo URL |

Analytics can use the existing `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` values when the Vercel Analytics integration is enabled; these are not substitutes for Vercel’s project-level Analytics switch.

## Verification status

The production Vercel root `https://mlb-terminal.vercel.app/` returned HTTP 200 with `text/html`. The same deployment returned HTTP 404 for `https://mlb-terminal.vercel.app/api/health` during this session, so the Vercel serverless API and authenticated flows are **not claimed as verified**. The user previously deferred Vercel secret entry, Analytics enablement, custom-domain confirmation, and authenticated-flow testing to the Mac Command Center workflow. The managed deployment and its heartbeat are separate and are active.

## Deployment smoke test

The repository now includes `test/vercel-deployment-smoke.test.ts` and the `pnpm test:smoke` command. It checks that `/api/health` returns the expected JSON contract, `/api/trpc/auth.me` serves the anonymous tRPC response, and `/api/mlb?path=%2Fteams%2F119` reaches the MLB serverless route without returning a frontend 404. The request timeout is configurable with `VERCEL_SMOKE_TIMEOUT_MS`.

GitHub Actions can run the same test through `.github/workflows/vercel-smoke.yml`. Trigger it manually with a `base_url` input, or define the repository variable `VERCEL_SMOKE_BASE_URL`; otherwise it targets `https://mlb-terminal.vercel.app`. A deployment whose API routes are not yet configured will fail the smoke test rather than silently passing.
