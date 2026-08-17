import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("playoff odds integrity", () => {
  it("keeps provider odds preferred and labels the verified-standings fallback as a calculated proxy", () => {
    const apiSource = readProjectFile("client/src/api/mlb.js");
    const overviewSource = readProjectFile("client/src/pages/OverviewPage.jsx");

    expect(apiSource).not.toContain("getSkipPlayoffOddsEstimate");
    expect(apiSource).not.toContain("SKIP estimate");
    expect(overviewSource).not.toContain("skipPlayoffEstimate");
    expect(overviewSource).not.toContain("simulationCount");
    expect(overviewSource).toContain("Provider unavailable");
    expect(overviewSource).toContain("MLB Stats API");
    expect(overviewSource).toContain("FanGraphs");
    expect(overviewSource).toContain("MLB Stats API · calculated");
    expect(overviewSource).toContain("calculated playoff proxy");
    expect(overviewSource).toContain("not official or FanGraphs odds");
    expect(overviewSource).toContain("pythagorean expected wins above a 48-win replacement baseline");
  });
});
