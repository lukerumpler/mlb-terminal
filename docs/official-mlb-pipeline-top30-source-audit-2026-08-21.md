# Official MLB Pipeline Top-30 Source Audit

## Source availability

MLB’s public Pipeline page states that it covers **900 prospects** and can be filtered to each organization’s Top 30. The canonical aggregate page is:

- https://www.mlb.com/prospects/stats/top-prospects

Each organization also has an official public list at:

- `https://www.mlb.com/prospects/<club-slug>`

The public Dodgers list was manually expanded in-browser on 2026-08-21 and displayed ranks 1 through 30, with name, position, organization, level, estimated arrival year, age, height/weight, bats, and throws. The canonical URL was:

- https://www.mlb.com/prospects/dodgers

## Current SKIP coverage finding

The existing `PROSPECT_BATTERS` and `PROSPECT_PITCHERS` arrays contain 95 unique MLB IDs in total. The command palette and prospect workspace both draw their discoverable prospect records from these arrays. Consequently, the product currently represents a **Top-100-style snapshot**, not a verified 30-player list for every organization.

The repeatable script `pnpm audit:prospects` uses the full 30-club MLB team set and records this baseline in `artifacts/prospect-coverage-audit.json`.

## Automated-source limitation

The official page’s initial render exposes five ranked rows and a `Show Full List` control. In a user browser, selecting that control expands the remaining rows. The headless Chromium audit used by `pnpm collect:prospect-top30` receives the control click but remains at six table rows, indicating the official site does not return the expanded data to that automated context. The collector does not attempt to bypass this restriction.

Any production import must therefore use a licensed/authorized data feed, an officially documented public endpoint, or a source-approved export. Until then, the application must not claim that all 900 organization Top-30 records load internally.

## Cumulative public roster route

MLB’s official cumulative page accepts the public `type=all` filter and exposes a large all-prospect table with MLB/MiLB player IDs and current stats:

- https://www.mlb.com/prospects/stats/top-prospects?type=all&minPA=1

This route is useful for identity and current-stat enrichment. Its rendered table does not include the organization Top-30 rank or team assignment, so it cannot by itself establish the required 30-player organization membership and rank contract.

## Official MLB Stats API assessment

The official public Stats API provides the data needed to identify players and refresh organization membership. For example:

- `GET https://statsapi.mlb.com/api/v1/people/{playerId}` returns a canonical MLB player identity.
- `GET https://statsapi.mlb.com/api/v1/teams/{teamId}/roster?rosterType=fullRoster&season=2026` returns the current full organization roster.
- `GET https://statsapi.mlb.com/api/v1/teams/{teamId}/affiliates` returns the organization’s affiliated teams.

For the Dodgers, the full-roster route returned 309 player records and included the first ten verified MLB Pipeline Top-30 player IDs tested, including Josue De Paula (800543), Mike Sirota (701527), Eduardo Quintero (808234), Emil Morales (815896), and Christian Zazueta (800537). The full-roster payload does **not** contain a rank field or Top-30 designation. A direct `/api/v1/prospects?teamId=119` request returned HTTP 404.

The public Stats API documentation inventory lists roster, player, draft-prospect, affiliate, and statistical endpoints, but no organization prospect-ranking endpoint. The root documentation site itself requires an MLB login, so no additional authenticated contract should be presumed without a credential. The supported public API can therefore supply canonical IDs, statuses, organization membership, affiliates, and current stats; it cannot alone validate the ordered Top-30 ranking membership contract.

## All-organization roster verification

The repeatable command `pnpm audit:organization-rosters` tested all 30 MLB organizations against the full-roster route on 2026-08-22. Every organization returned HTTP 200 with nonempty, unique canonical player IDs after bounded transient retry. The audit observed **8,473** roster records in aggregate across the 30 organizations. Individual organization payloads ranged from **240** to **312** records.

The audit does not persist player names or IDs in its aggregate report. It records only organization abbreviation, HTTP result, record count, unique-ID count, latency, and error class. It uses three concurrent requests and a 25-second per-request timeout because successful official responses varied from approximately one to 23 seconds in the verification run.
