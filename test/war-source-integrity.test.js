import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overview = readFileSync(resolve(process.cwd(), "client/src/pages/OverviewPage.jsx"), "utf8");
const prospectCard = readFileSync(resolve(process.cwd(), "client/src/components/ProspectCard.jsx"), "utf8");
const prospects = readFileSync(resolve(process.cwd(), "client/src/pages/ProspectsPage.jsx"), "utf8");
const knowledge = readFileSync(resolve(process.cwd(), "client/src/pages/KnowledgePage.jsx"), "utf8");
const intelligence = readFileSync(resolve(process.cwd(), "client/src/pages/OtherPages.jsx"), "utf8");

describe("WAR source-integrity contracts", () => {
  it("uses only a verified Team WAR response or explicit unavailability", () => {
    expect(overview).toContain("const teamWarValue = hasProviderTeamWar ? providerTeamWar.toFixed(1) : 'Unavailable';");
    expect(overview).toContain("const teamWarHeadlineLabel = 'Team WAR';");
    expect(overview).not.toContain("WAR Proxy");
    expect(overview).not.toContain("team-war-proxy-verification");
  });

  it("labels prospect WAR as a SKIP five-year estimate rather than a live player value", () => {
    expect(prospectCard).toContain("SKIP Five-Year Estimate");
    expect(prospectCard).toContain("not a live player WAR value");
    expect(prospects).toContain("Sort: 5-yr WAR estimate");
    expect(prospects).toContain("5-yr WAR est. · ETA");
    expect(knowledge).toContain("internal five-year scouting estimates, not live player WAR values");
  });

  it("labels trade net WAR as a fixed historical dataset", () => {
    expect(intelligence).toContain('badge="fixed historical netWAR"');
    expect(intelligence).toContain('label="Historical netWAR"');
    expect(intelligence).toContain("Fixed dataset of real trades");
  });
});
