# Project TODO

## Vercel API routing and uptime-monitor activation
- [ ] Create an isolated Vercel API-routing repair branch from the merged production baseline
- [x] Route `/api/*` requests to the Express serverless entry point while preserving the existing news endpoint
- [x] Add regression coverage for deployed API route reachability
- [x] Replace legacy route runtime imports with static handler imports so Vercel includes every dependency in the catch-all artifact
- [ ] Validate, publish, and merge the deployment-routing repair
- [ ] Verify production `/api/health` and `/api/uptime-monitor` behavior after deployment
- [ ] Replace the dedicated uptime function's Express type dependency with a minimal serverless request/response contract and confirm its public production invocation
- [ ] Apply the additive uptime-monitor production database migration
- [ ] Create and persist the project-owned daily 09:00 UTC uptime-monitor Heartbeat

## Prospect coverage and discoverability
- [ ] Verify that each MLB team’s top 30 prospects load and can be found through the application search paths; remediate any data, caching, or UI gaps with regression coverage
- [x] Validate official MLB API endpoints for exact organization Top-30 membership, ranks, player IDs, and current minor-league status before relying on them for the prospect workspace
- [x] Implement an official-MLB-API-backed all-team organization player directory with clear non-Top-30 labeling, search coverage, cache/error states, and regression tests

## Regression-gate maintenance
- [x] Restore the LLM retry test's isolated Forge configuration so the clean suite can validate HTTP 412 no-retry behavior without injected credentials

## Live-score ticker repair
- [x] Audit the ticker component, live-score request path, polling lifecycle, and CSS animation contract
- [x] Implement a resilient ticker data, fallback, and scroll-animation repair
- [x] Add focused regression coverage for live, final, delayed, and no-game ticker states
- [x] Restore Express 5-compatible local fallback routing so the ticker can receive visual browser verification
- [x] Make the isolated LLM retry fixture independent of injected Forge credentials for clean-suite validation
- [x] Validate and publish the ticker repair without regressing existing navigation or data contracts
