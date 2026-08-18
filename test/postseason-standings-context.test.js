import { describe, expect, it } from "vitest";
import {
  buildPostseasonStandingsContext,
  formatVerifiedTimestamp,
} from "../client/src/pages/OverviewPage.jsx";

describe("postseason standings context", () => {
  it("summarizes verified division and Wild Card position without generating a probability", () => {
    const liveTeamData = {
      byAbbr: {
        LAD: { standings: { id:119, abbr:"LAD", divisionName:"NL West", w:75, l:51, pct:0.595, gb:"-", divRank:"1", wildRank:"1", l10:"7-3", streak:"W2" } },
        SDP: { standings: { id:135, abbr:"SDP", divisionName:"NL West", w:67, l:59, pct:0.532, gb:"8.0", divRank:"2", wildRank:"2", l10:"5-5", streak:"L1" } },
      },
    };
    expect(buildPostseasonStandingsContext(liveTeamData, { id:119, abbr:"LAD", div:"NL West" })).toEqual(expect.objectContaining({
      record: "75–51",
      divisionRank: "1st",
      gamesBack: "-",
      wildCardRank: "1st",
      divisionLeader: "LAD",
      divisionLeaderRecord: "75–51",
    }));
  });

  it("formats a source timestamp for the visible last-verified label", () => {
    expect(formatVerifiedTimestamp("2026-08-18T07:45:00.000Z")).toMatch(/Aug 18/);
  });
});
