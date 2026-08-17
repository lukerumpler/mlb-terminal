# Observability and Model Fallback Audit — 2026-08-17

## Objective

This audit verifies that MLB Terminal’s user-facing workspaces load safely, adds aggregate monitoring for Baseball-Reference identity reuse, and ensures the Overview can remain useful when FanGraphs Team WAR and playoff odds are temporarily unavailable. The implementation preserves a strict distinction between **verified provider metrics** and **transparent intelligence calculations**.

## Identity-resolution telemetry

Direct Baseball-Reference reuse is now observable at two layers. The browser records aggregate, local-only counters for resolver requests, browser-registry reuse, direct-ID requests, verified direct-ID responses, invalidations, name searches, no-match responses, and transport fallbacks. It does not retain player names, MLB IDs, Baseball-Reference IDs, URLs, IP addresses, or request payloads.

The resolver also records process-level aggregate telemetry. A no-store response is available from:

```text
GET /api/player-identity?mode=metrics
```

| Metric | Definition | Operational use |
| --- | --- | --- |
| `directIdRequestRate` | Direct-ID requests ÷ resolver requests | Indicates whether verified IDs are replacing name-search traffic. |
| `browserRegistryReuseRate` | Requests explicitly sourced from browser registry ÷ direct-ID requests | Measures persistent registry reuse. |
| `serverRegistryHitRate` | Warm server-registry hits ÷ resolver requests | Measures name-search and canonical-page work avoided within a warm instance. |
| `directCanonicalVerificationRate` | Exact canonical-page validations ÷ canonical direct-ID requests | Detects stale or incorrect supplied IDs. |
| `nameSearchExactMatchRate` | Exact search matches ÷ name-search requests | Confirms strict identity matching remains conservative. |

> The endpoint is deliberately process-scoped. Serverless instances can reset independently, so it is suitable for operational diagnostics rather than cross-deployment analytics. Browser counters persist locally only and can be inspected from `skip-player-identity-telemetry-v1` without exposing identity data externally.

## Team WAR and playoff-odds behavior

The live FanGraphs request was unavailable during this audit because its daily refresh guard had already exhausted an upstream attempt. The Overview therefore used the verified MLB standings intelligence endpoint. In the audited response, the Dodgers standings inputs produced a **90.6% calculated playoff estimate** and a **51.2 pythagorean wins-above-replacement proxy**.

| Metric state | Presentation | Provenance |
| --- | --- | --- |
| FanGraphs response available | **Team WAR** and **Playoff Odds** remain the primary metrics. | FanGraphs, with existing cache/freshness status. |
| FanGraphs unavailable; MLB standings sufficient | **Playoff est** and **WAR proxy** are shown with a `Calculated` source badge. | MLB Stats API standings, calculated locally by the intelligence endpoint. |
| Neither source has sufficient input | The field remains **Unavailable**. | No estimate is fabricated. |

The fallback is intentionally limited. The playoff estimate uses deterministic standings pace and a four-win logistic uncertainty scale; it excludes schedule strength, roster projections, injuries, transactions, and Monte Carlo simulation. The WAR proxy uses pythagorean expected wins less a 48-win replacement baseline. It is **not FanGraphs Team WAR** and is labeled accordingly.

## Component and data-loading validation

| Validation layer | Result |
| --- | --- |
| Focused telemetry, registry, intelligence, Overview, and status tests | **39 passed** across 6 files. |
| TypeScript validation | **Passed** with `pnpm check`. |
| Production build | **Passed** with `pnpm build`. |
| Desktop/mobile workspace audit | **16 of 16 rendered** with visible data or an explicit safe state; no error boundary and no data request failures. Two navigation-aborted optional requests were excluded from failure counting. |
| Complete Vitest suite | **433 passed / 4 failed** across 92 files. |

The four complete-suite failures are not introduced by this work. They comprise one missing LLM-key test configuration, one existing FanGraphs cache timing expectation, and two published-site E2E tests that time out waiting on the external published deployment. The local workspace audit verified the same affiliate control and all audited workspaces render correctly.

## Repeatable checks

```bash
pnpm exec vitest run
pnpm check
pnpm build
node scripts/live-data-audit.mjs
node scripts/ui-data-audit.mjs
node scripts/player-profile-load-audit.mjs
```

The UI audit now waits for per-workspace hydration and distinguishes navigation-aborted requests from genuine data request failures. This keeps its report aligned with what a user can actually see rather than counting routine tab-change cancellations as outages.
