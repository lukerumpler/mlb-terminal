# SKIP · Scouting Knowledge & Intelligence Platform

A Bloomberg-terminal-inspired baseball intelligence platform for scouting, prospect evaluation, and roster decisions — live MLB stats, MiLB prospect tracking, Statcast/Savant leaderboards, and SKIP's own decision-score models in one dashboard.

## Features

- **Overview** — daily front-office briefing: standings, team strength radar, front-office evaluation grades, and operational alerts
- **Players / Prospects** — searchable player and prospect databases with advanced filters, comparison tools, and organization roster directories
- **AMD+** — SKIP's proprietary swing-precision leaderboard (timing, contact, vertical components)
- **Draft / League / Intelligence** — draft trend tracking, cross-team league comparisons, and live leader/model panels
- **Scouting Notes** — offline-first note-taking with background sync and voice-to-text
- **Feed** — trade rumors, transactions, and news aggregated across multiple sources with freshness tracking
- **Follow List** — a personal watchlist of players and teams
- **Live Score Ticker** — real-time score updates with pull-to-refresh on mobile
- **Data Source Status Center** — transparency panel showing the live/cached/stale state of every upstream provider
- **Command palette & recent history** — fast keyboard-driven navigation across the whole terminal
- **Ballpark weather, defensive OAA field maps, pitch shape/contact heatmaps** — supplementary scouting visualizations
- **About the builder** — a profile/bio page on the live deployment (`/about`); not currently part of this repo's tracked source — see [Deployment Model](#deployment-model)

## Tech Stack

| Layer | Stack |
| --- | --- |
| Client | React 19, Vite 7, Tailwind CSS 4, Radix UI / shadcn, Recharts, Framer Motion, wouter |
| Server | Express 4, tRPC 11, Zod, Drizzle ORM |
| Testing | Vitest, Testing Library, Playwright (E2E) |
| Deployment | Manus-managed release (canonical/live) + Vercel via this repo (mirror) — see [Deployment Model](#deployment-model) |

## Project Structure

```
client/       React SPA — pages/, components/, api/, lib/
server/       Express app, API proxy/data handlers (server/api/), scheduled jobs
api/          Vercel serverless entry points (wraps server/ for production)
shared/       Types and utilities shared between client and server
drizzle/      Database schema and migrations
test/         Cross-cutting integration/regression tests
docs/         Architecture, deployment, data sources, testing, and resilience guides
scripts/      Release-gate, audit, and provider-health tooling
```

> **Note for contributors:** `client/src/App.tsx`, `Home.tsx`, and `main.tsx` are unused scaffold boilerplate left over from initial project setup. The real entry point is `client/src/main.jsx` → `App.jsx` (confirmed via `client/index.html`'s script tag). Work in the `.jsx` files, not the `.tsx` ones.

## Getting Started

Requires **Node 22.x** and **pnpm**.

```bash
pnpm install --frozen-lockfile

# type-check, lint, test, build
pnpm check
pnpm lint
pnpm test
pnpm build

# local dev server
pnpm dev
```

### Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Drizzle) |
| `JWT_SECRET` | Session/auth token signing |
| `OAUTH_SERVER_URL` / `OWNER_OPEN_ID` | Auth provider configuration |
| `ALLOWED_ORIGIN` | CORS allow-list |
| `USER_AGENT` | Outbound User-Agent for upstream data providers |
| `BUILT_IN_FORGE_API_KEY` / `BUILT_IN_FORGE_API_URL` | AI provider credentials (natural-language query, voice transcription) |
| `PORT` | Local dev server port |

In production these are managed via platform secrets, not `.env` files — see [`docs/deployment.md`](docs/deployment.md).

## Available Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Start the dev server (tsx watch) |
| `pnpm build` | Production build (Vite + esbuild) |
| `pnpm start` | Run the production build |
| `pnpm check` | TypeScript type-check (`tsc --noEmit`) |
| `pnpm lint` | Prettier check on core files |
| `pnpm test` | Run the Vitest suite |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm test:smoke` | Vercel deployment smoke test |
| `pnpm release:gate` | Full release gate: compare → provider health → check → lint → test → build |
| `pnpm audit:prospects` / `pnpm audit:organization-rosters` | Data coverage audits |
| `pnpm db:push` | Generate and run Drizzle migrations |

## Data Sources

SKIP never fabricates missing data — every metric carries a source-health badge (Live, Cached, Stale, or Unavailable). Core providers:

| Provider | Purpose |
| --- | --- |
| MLB Stats API | Live scores, team stats, player bios, boxscores |
| Baseball Savant | Statcast leaderboards, xwOBA/xBA/xSLG, batted-ball tracking |
| FanGraphs | Team WAR, projections, playoff probabilities |
| NCAA Stats | College baseball data |
| Lahman Database | Historical career statistics and career-gap reconciliation |
| Spotrac | Payroll, luxury tax (CBT), contract projections |

Full provenance rules, TTLs, and fallback behavior are documented in [`docs/data-sources.md`](docs/data-sources.md).

## Deployment Model

This project runs on two tracks that are **not** a simple mirror of each other:

- **Manus-managed project (canonical/live)** — published through Manus's own release process to `skipbasebal-mm6hz9ps.manus.space`. This is the source of truth for what's actually live, and it can move ahead of GitHub (e.g. the `/about` builder-profile page currently only exists here).
- **This GitHub repo** — a deliberately reconciled reference/mirror, not a push target for the managed deployment. Merges between the two are done by comparing file-by-file rather than overwriting either side, since the histories have diverged at times. See [`GITHUB_SYNC_AUDIT.md`](GITHUB_SYNC_AUDIT.md) and [`docs/BRANCH_INTEGRATION_AUDIT_2026-08-21.md`](docs/BRANCH_INTEGRATION_AUDIT_2026-08-21.md) for past reconciliation reviews. Vercel deployment config (`vercel.json`) exists for building from this repo directly, but it is a secondary path, not the canonical release.
- Automated tools without managed-project access will not have push credentials to this repo's `main` by design — see [`docs/RELEASE_WORKFLOW.md`](docs/RELEASE_WORKFLOW.md) for the intended release-gate → managed-checkpoint flow.

If you're reconciling the two, treat the managed project as canonical and compare before merging — don't force-push or bulk-overwrite either side.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — layer breakdown
- [`docs/development.md`](docs/development.md) — conventions and workflow
- [`docs/deployment.md`](docs/deployment.md) — release gate and deployment config
- [`docs/data-sources.md`](docs/data-sources.md) — provider contracts and provenance rules
- [`docs/testing.md`](docs/testing.md) — testing strategy
- [`docs/resilience.md`](docs/resilience.md) — caching, fallback, and reliability design

## License

MIT
