# Controlled Production Load-Test Results

**Timestamp:** 2026-08-18 05:50:33 UTC  
**Target:** `https://mlb-terminal.vercel.app`  
**Protocol:** 12 serial requests per endpoint, 500 ms between requests. The maximum sampling intensity was 20 requests per 10 seconds per sampled endpoint, below the application’s 30 requests per 10 seconds rate-limit threshold.

| Endpoint | Requests | Successful 2xx | p50 latency | p95 latency | Minimum | Maximum |
|---|---:|---:|---:|---:|---:|---:|
| `/api/health` | 12 | 12/12 | 145.5 ms | 230.7 ms | 94.4 ms | 230.7 ms |
| `/api/fangraphs-models?team=LAD&season=2026` | 12 | 12/12 | 98.5 ms | 191.2 ms | 61.3 ms | 191.2 ms |
| `/api/intelligence-calculations?season=2026&mode=all` | 12 | 12/12 | 99.1 ms | 206.6 ms | 74.7 ms | 206.6 ms |

## Interpretation

The current optimized production release returned a 2xx response for every sampled request and did not trigger a 429 response. These figures measure edge-to-response completion from the test environment after the release. They do not establish a direct before-versus-after latency delta because an equivalent pre-release latency trace was not captured. The previously established request-flow improvement remains valid: the normal Team Profile path replaces up to 12 player-scoped Savant pitch requests with one roster-filtered request and defers two redundant league-summary calls.

The raw per-request observations are stored in `production-safe-load-test-2026-08-18T05-50-33Z.csv` beside this report.
