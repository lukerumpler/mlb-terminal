import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVerifiedPlayoffOdds } from "../client/src/pages/OverviewPage.jsx";

const projectRoot = path.resolve(process.cwd());

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("playoff odds integrity", () => {
  it("shows an odds percentage only when the provider returns a team-specific value", () => {
    const apiSource = readProjectFile("client/src/api/mlb.js");
    const overviewSource = readProjectFile("client/src/pages/OverviewPage.jsx");

    expect(apiSource).not.toContain("getSkipPlayoffOddsEstimate");
    expect(apiSource).not.toContain("SKIP estimate");
    expect(overviewSource).not.toContain("skipPlayoffEstimate");
    expect(overviewSource).not.toContain("simulationCount");
    expect(overviewSource).toContain("Provider unavailable");
    expect(overviewSource).toContain("MLB Stats API");
    expect(overviewSource).toContain("FanGraphs");
    expect(overviewSource).toContain("Provider unavailable");
    expect(overviewSource).toContain("Playoff odds are shown only when FanGraphs returns a team-specific value");
    expect(overviewSource).toContain("Current win pace and Pythagorean pace are calculated from verified MLB standings");
    expect(overviewSource).not.toContain("calculated playoff proxy");
    expect(overviewSource).not.toContain("calculatedPlayoffOdds");
  });

  it("accepts only a finite FanGraphs percentage in the inclusive 0–100 range", () => {
    expect(resolveVerifiedPlayoffOdds(54.3)).toBe(54.3);
    expect(resolveVerifiedPlayoffOdds(0)).toBe(0);
    expect(resolveVerifiedPlayoffOdds(100)).toBe(100);
    expect(resolveVerifiedPlayoffOdds(null)).toBeNull();
    expect(resolveVerifiedPlayoffOdds('')).toBeNull();
    expect(resolveVerifiedPlayoffOdds(-0.1)).toBeNull();
    expect(resolveVerifiedPlayoffOdds(100.1)).toBeNull();
    expect(resolveVerifiedPlayoffOdds("not-a-number")).toBeNull();
  });
});
