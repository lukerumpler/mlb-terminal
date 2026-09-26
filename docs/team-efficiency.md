# Salary-to-WAR efficiency implementation

## Endpoint

The normalized endpoint is:

```text
GET /api/team-efficiency?team=SD&season=2026&payrollBasis=payroll
```

A league comparison can request up to 30 canonical team abbreviations:

```text
GET /api/team-efficiency?teams=SD,LAD,NYY&season=2026&payrollBasis=payroll
```

Supported payroll bases are `payroll`, `active`, `taxPayroll`, and `totalTaxPayroll`. The endpoint joins Spotrac payroll with the existing FanGraphs aggregate WAR loader, which falls back to Baseball-Reference when FanGraphs cannot provide a verified aggregate row.

## Derived fields

The service calculates only transparent derived metrics from provider-published inputs. When both provider rows match the same team and season, the displayed team WAR is a simple unweighted blend:

```text
Blended WAR = (FanGraphs fWAR + Baseball-Reference bWAR) / 2
```

The original fWAR and bWAR values remain in the response. If only one provider is available, that provider's value is used and the response carries a warning; it is never mislabeled as a two-provider blend.

Defensive WAR is averaged only when both sources publish comparable team-level defensive WAR fields:

```text
Defensive blend = (FanGraphs defensive WAR + Baseball-Reference defensive WAR) / 2
```

Because the two systems use different inputs and defensive frameworks, the UI labels the defensive result as a comparable blend and reports it as unavailable when both fields are not present. It does not manufacture a defensive value from incompatible or player-level data.

The service calculates the salary efficiency metrics from the blended total when available:

```text
Dollars per WAR = payroll USD / total WAR
WAR per $100M = total WAR / payroll USD * 100,000,000
```

A value is unavailable when either input is missing, zero, non-numeric, or from a mismatched season. Missing values are never converted to zero or infinity.

## Provenance

Every row includes the payroll basis, payroll provider and URL, both WAR provider values when available, the methodology (`Blended fWAR/bWAR average`, `fWAR`, or `bWAR/rWAR`), retrieval timestamps, freshness, fallback status, warnings, and `calculationVersion: salary-war-v2-blended-fwar-bwar`. The UI preserves the original provider values and labels the blended result explicitly.

## Server cache

The endpoint uses in-process request coalescing, a five-minute fresh cache by default, and a 24-hour stale window. If `DATABASE_URL` is configured, the normalized record is also written to the project durable cache. The defaults can be changed without code changes:

| Environment variable | Default | Meaning |
|---|---:|---|
| `TEAM_EFFICIENCY_FRESH_SECONDS` | `300` | Fresh in-process/durable TTL |
| `TEAM_EFFICIENCY_STALE_SECONDS` | `86400` | Maximum stale fallback window |
| `TEAM_FINANCIALS_FRESH_SECONDS` | `1800` | Shared Spotrac page and financial snapshot TTL |
| `TEAM_FINANCIALS_STALE_SECONDS` | `21600` | Financial stale window |

Spotrac payroll and tax pages are deduplicated across simultaneous league comparison requests so the comparison view does not issue a separate page download for every team.

## Client behavior

`fetchTeamEfficiency` caches a response for five minutes in memory and saves a successful record in browser local storage for up to seven days. When the browser is offline or a request fails, the panel may show the local record as `stale-cached` with an explicit warning. Offline data is never presented as live.

`TeamEfficiencyOverviewPanel` is mounted in the Overview Briefing view. `TeamEfficiencyComparisonView` is mounted in the League view with sortable dollars-per-WAR and WAR-per-$100M columns. Incomplete rows remain visible but are not ranked ahead of complete rows.

## Production follow-up

Before public release, configure durable cache storage, add scheduled refresh telemetry for `/api/team-efficiency`, document provider terms of use, test every payroll basis against current Spotrac markup, and add end-to-end tests for offline local-storage recovery in the browser.
