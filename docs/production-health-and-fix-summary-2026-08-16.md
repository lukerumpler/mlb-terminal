# Baseball Intelligence Platform — Production Health and Fix Summary Preview

**Date:** August 16, 2026  
**Merged main commit:** `ffb803e6c417897dfad0dbfa95d898468edab4f7`  
**Health scope:** MLB proxy, Baseball Savant proxy, FanGraphs model proxy, backend intelligence calculations, cache behavior, and recent UI/data-integrity fixes.

## Executive summary

The merged application code passed the independent validation suite: **90 test files and 418 tests**, with TypeScript and production-build checks also passing. The managed Manus deployment is serving the Express API correctly. Representative MLB, intelligence-calculation, and Savant requests returned JSON, and the intelligence endpoint returned its expected daily-cache provenance.

The separate Vercel production deployment reports a successful build, but its API paths currently return the Vercel HTML application shell instead of JSON. The repository’s Vercel configuration is a static Vite deployment with no rewrites or serverless mappings for the Express API. Therefore, Vercel build status is green while API health at that Vercel hostname is not green. This is a deployment-routing issue, not evidence that the MLB or Savant parsers are failing.

## Production probe matrix

| Target | Result | Evidence |
|---|---|---|
| Vercel production deployment | **Build success, API routing unhealthy** | `/api/mlb`, `/api/intelligence-calculations`, and `/api/savant` returned HTML `<!DOCTYPE html>` application-shell content. |
| Managed Manus `/api/mlb?path=/teams/119` | **Healthy** | HTTP 200 JSON from MLB Stats API proxy. |
| Managed Manus intelligence endpoint | **Healthy** | HTTP 200 JSON, `X-Provider-Cache: DAILY`, provenance `calculated-from-verified-standings`. |
| Savant `expected_statistics` | **Healthy cached response** | HTTP 200 JSON, `X-Provider-Cache: HIT`, cached freshness. |
| Savant `statcast_leaderboard` | **Healthy cached response** | HTTP 200 JSON, `X-Provider-Cache: HIT`, cached freshness. |
| Savant `oaa` | **Healthy live response** | HTTP 200 JSON, `X-Provider-Cache: MISS`, live freshness. |
| Savant `team_exit_velocity` for LAD | **Honest empty result** | HTTP 200 JSON empty array; no fabricated values. |
| Invalid raw Savant leaderboard path | **Correct validation failure** | HTTP 400 JSON with the valid endpoint list. |

## Recent bug fixes

The FanGraphs model pipeline now uses a fixed **once-per-UTC-day refresh gate** with in-flight request coalescing. Same-day requests reuse cached data or stale data rather than repeatedly contacting FanGraphs. Provider-blocked and stale-local states are exposed explicitly instead of leaking raw transport errors.

The Baseball-Reference contract fallback now has per-player UTC-day caching, failure-attempt tracking, and in-flight coalescing. It is not retried repeatedly when the provider is blocked or unavailable.

The Overview page now loads the MLB parent team before rendering affiliate-dependent content, avoids defaulting silently to a minor-league affiliate, humanizes affiliate errors, and keeps Savant/FanGraphs provider names visually separated from their status badges.

The unsupported playoff-odds simulation was removed. Playoff odds remain unavailable when no verified official provider value is reachable. FanGraphs WAR definitions remain provider-reported and are not replaced with fabricated or incompatible MLB estimates.

PlayersPage Savant fields now use a shared alias helper for Sweet Spot %, Barrel %, and Hard Hit %. The helper supports known column variants, preserves legitimate zeroes, and leaves values unavailable when no verified field exists. The fix covers both the percentile profile and the Live Performance Inputs panel.

## Performance and resilience improvements

The MLB proxy forwards raw query strings so special `hydrate` parameters containing parentheses and commas are preserved. It also uses route-aware timeouts, warm-instance caching, stale-while-revalidate behavior, failure cooldowns, and in-flight request coalescing.

Savant responses are cached for the daily refresh window, with bounded stale snapshots available during upstream trouble. HTML responses are rejected before CSV parsing and are not stored as valid data. FanGraphs browser snapshots persist successful responses locally for up to seven days during provider failures, with explicit stale-local provenance.

The intelligence-calculation endpoint derives projected wins, projected losses, run differential, and Pythagorean win percentage from verified MLB standings inputs. These values are labeled as calculated MLB intelligence and are never presented as official FanGraphs odds or WAR.

## Validation evidence

The latest focused proxy and UI checks passed **23/23**. The independent PR-head validation passed **90 test files and 418 tests**, TypeScript, and production build. The final merge commit is `ffb803e6c417897dfad0dbfa95d898468edab4f7`.

## Main outstanding issue

Before treating the Vercel hostname as a fully healthy production API deployment, the Vercel project needs an Express/serverless routing configuration or the application must use the managed Manus server deployment as its production API origin. The current static Vite configuration serves the frontend shell for `/api/*` paths.

## Report status

This is a preview report based on direct post-merge probes, repository configuration, GitHub deployment records, and independent test results. Vercel runtime-log retrieval was unavailable through the configured connector because project discovery returned no accessible project and the runtime-error query returned HTTP 403. GitHub deployment status reported the Vercel build as successful.
