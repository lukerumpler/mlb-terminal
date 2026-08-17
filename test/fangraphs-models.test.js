import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseFanGraphsModelHtml,
  parseFanGraphsAggregateWarHtml,
  isFanGraphsProviderBlockedResponse,
} from "../server/api/fangraphs-models.js";

// Resolved relative to this file rather than a hardcoded absolute path, so
// the test runs the same in any checkout (CI, a fresh clone, another
// contributor's machine) instead of only inside one specific sandbox.
const __dirname = dirname(fileURLToPath(import.meta.url));
const overviewSource = readFileSync(
  resolve(__dirname, "../client/src/pages/OverviewPage.jsx"),
  "utf8"
);

describe("FanGraphs model source adapter", () => {
  it("parses team playoff odds and team WAR when the upstream exposes HTML tables", () => {
    const oddsHtml =
      "<table><tr><th>Team</th><th>Playoff Odds</th><th>Projected Wins</th><th>Projected Losses</th></tr><tr><td>LAD</td><td>87.5%</td><td>95.4</td><td>66.6</td></tr></table>";
    const warHtml =
      "<table><tr><th>Team</th><th>WAR</th><th>Off WAR</th><th>Def WAR</th></tr><tr><td>LAD</td><td>42.7</td><td>29.1</td><td>8.4</td></tr></table>";
    const result = parseFanGraphsModelHtml({ oddsHtml, warHtml }, "LAD", 2026);
    expect(result.playoffOdds).toBe(87.5);
    expect(result.teamWar).toBe(42.7);
    expect(result.source).toBe("FanGraphs");
    expect(result.season).toBe(2026);
    expect(result.advancedMetrics.projectedWins).toBe(95.4);
    expect(result.advancedMetrics.projectedLosses).toBe(66.6);
    expect(result.advancedMetrics.offenseWar).toBe(29.1);
    expect(result.advancedMetrics.defenseWar).toBe(8.4);
  });

  it("parses current nickname rows and abbreviated FanGraphs projection headers", () => {
    const oddsHtml = "<table><tr><th>Team</th><th>W</th><th>L</th><th>W%</th><th>Proj W</th><th>Proj L</th><th>Make Playoffs</th></tr><tr><td>Dodgers</td><td>74</td><td>51</td><td>.592</td><td>96.9</td><td>65.1</td><td>100.0%</td></tr></table>";
    const warHtml = "<table><tr><th>Team</th><th>WAR</th><th>Off WAR</th><th>Def WAR</th></tr><tr><td>Dodgers</td><td>42.7</td><td>29.1</td><td>8.4</td></tr></table>";

    const result = parseFanGraphsModelHtml({ oddsHtml, warHtml }, "LAD", 2026);

    expect(result.playoffOdds).toBe(100);
    expect(result.teamWar).toBe(42.7);
    expect(result.advancedMetrics).toMatchObject({
      projectedWins: 96.9,
      projectedLosses: 65.1,
      offenseWar: 29.1,
      defenseWar: 8.4,
    });
  });

  it("parses aggregate batting and pitching WAR by header name and computes total WAR", () => {
    const battingHtml =
      "<table><tr><th>Team</th><th>WAR</th></tr><tr><td>Los Angeles Dodgers</td><td>24.3</td></tr><tr><td>New York Yankees</td><td>21.1</td></tr></table>";
    const pitchingHtml =
      "<table><tr><th>Team</th><th>WAR</th></tr><tr><td>Los Angeles Dodgers</td><td>18.1</td></tr><tr><td>New York Yankees</td><td>17.2</td></tr></table>";
    const result = parseFanGraphsAggregateWarHtml(
      { battingHtml, pitchingHtml },
      2026
    );
    expect(result.teams).toContainEqual({
      team: "Los Angeles Dodgers",
      battingWAR: 24.3,
      pitchingWAR: 18.1,
      totalWAR: 42.4,
    });
    expect(result.teams).toContainEqual({
      team: "New York Yankees",
      battingWAR: 21.1,
      pitchingWAR: 17.2,
      totalWAR: 38.3,
    });
  });

  it("classifies Cloudflare challenge bodies as provider-blocked but not ordinary 403 pages", () => {
    expect(isFanGraphsProviderBlockedResponse(403, '<title>Just a moment...</title> Cloudflare challenge')).toBe(true);
    expect(isFanGraphsProviderBlockedResponse(403, '<html>Access denied</html>')).toBe(false);
    expect(isFanGraphsProviderBlockedResponse(502, '<title>Just a moment...</title>')).toBe(false);
  });

  it("returns null model values when the source markup is blocked or changed", () => {
    const result = parseFanGraphsModelHtml(
      { oddsHtml: "<html>challenge</html>", warHtml: "" },
      "LAD",
      2026
    );
    expect(result.playoffOdds).toBeNull();
    expect(result.teamWar).toBeNull();
    expect(result.advancedMetrics.projectedWins).toBeNull();
  });
});

describe("Overview model freshness and retry contract", () => {
  it("renders model freshness metadata and exposes a retry action for live-feed errors", () => {
    expect(overviewSource).toContain("getTeamModelSources");
    expect(overviewSource).toContain("FanGraphs");
    expect(overviewSource).toContain("retrieved");
    expect(overviewSource).toContain("stale-local");
    expect(overviewSource).toContain("local cached");
    expect(overviewSource).toContain("provider-blocked");
    expect(overviewSource).toContain("provider blocked by upstream protection");
    expect(overviewSource).toContain("setMlbRetryToken");
    expect(overviewSource).toContain(">RETRY</button>");
  });
});
