# Project TODO

## Vercel API routing and uptime-monitor activation
- [ ] Create an isolated Vercel API-routing repair branch from the merged production baseline
- [x] Route `/api/*` requests to the Express serverless entry point while preserving the existing news endpoint
- [x] Add regression coverage for deployed API route reachability
- [ ] Validate, publish, and merge the deployment-routing repair
- [ ] Verify production `/api/health` and `/api/uptime-monitor` behavior after deployment
- [ ] Apply the additive uptime-monitor production database migration
- [ ] Create and persist the project-owned daily 09:00 UTC uptime-monitor Heartbeat

## Live-score ticker repair
- [x] Audit the ticker component, live-score request path, polling lifecycle, and CSS animation contract
- [x] Implement a resilient ticker data, fallback, and scroll-animation repair
- [x] Add focused regression coverage for live, final, delayed, and no-game ticker states
- [x] Restore Express 5-compatible local fallback routing so the ticker can receive visual browser verification
- [x] Make the isolated LLM retry fixture independent of injected Forge credentials for clean-suite validation
- [x] Validate and publish the ticker repair without regressing existing navigation or data contracts
