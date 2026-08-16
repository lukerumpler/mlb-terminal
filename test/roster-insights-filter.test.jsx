import { describe, expect, it } from "vitest";
import {
  buildRosterRows,
  rosterStatValue,
  hitterFantasyPoints,
  ROSTER_PRESETS,
  ROSTER_QUICK_FILTERS,
  formatRosterSampleLabel,
} from "../client/src/pages/OverviewPage.jsx";

const players = {
  hitting: [
    {
      id: 1,
      name: "Slugger",
      position: "1B",
      stat: { ops: ".920", homeRuns: 32, avg: ".285", plateAppearances: 320 },
    },
    {
      id: 2,
      name: "Runner",
      position: "CF",
      stat: { ops: ".760", homeRuns: 8, avg: ".310", plateAppearances: 90 },
    },
  ],
  pitching: [
    {
      id: 3,
      name: "Ace",
      position: "SP",
      stat: { era: "2.90", whip: "1.04", strikeOuts: 145, inningsPitched: 72 },
    },
    {
      id: 4,
      name: "Reliever",
      position: "RP",
      stat: { era: "3.80", whip: "1.20", strikeOuts: 62, inningsPitched: 18 },
    },
  ],
};

describe("roster insights filters", () => {
  it("provides quick filters for positions and current-performance views", () => {
    expect(ROSTER_QUICK_FILTERS.map(filter => filter.label)).toEqual([
      "All players",
      "Hitters",
      "Pitchers",
      "Recent performance",
      "Current offense",
      "Fantasy leaders",
    ]);
    expect(
      ROSTER_QUICK_FILTERS.find(filter => filter.id === "top-fantasy")
    ).toMatchObject({ sort: "fantasyPoints", minBattingPa: 50 });
  });

  it("provides the requested quick-access presets", () => {
    expect(ROSTER_PRESETS.map(preset => preset.label)).toEqual([
      "Qualified hitters",
      "Rotation candidates",
      "High-leverage arms",
    ]);
    expect(
      ROSTER_PRESETS.find(preset => preset.id === "qualified-hitters")
    ).toMatchObject({ sort: "ops", minBattingPa: 150 });
    expect(
      ROSTER_PRESETS.find(preset => preset.id === "rotation-candidates")
    ).toMatchObject({ sort: "era", minPitchingIp: 30 });
  });
  it("formats the active sample context for hitter and pitcher leader cards", () => {
    expect(formatRosterSampleLabel("hitting", 150)).toBe("150 PA+");
    expect(formatRosterSampleLabel("pitching", 30)).toBe("30 IP+");
    expect(formatRosterSampleLabel("hitting", 0)).toBe("Any PA");
  });
  it("calculates transparent hitter Fantasy Points from verified season fields", () => {
    const row = {
      stat: {
        hits: 100,
        doubles: 20,
        triples: 3,
        homeRuns: 25,
        rbi: 80,
        runs: 75,
        baseOnBalls: 45,
        stolenBases: 12,
        caughtStealing: 3,
      },
    };
    expect(hitterFantasyPoints(row)).toBe(
      100 - 20 - 3 - 25 + 20 * 2 + 3 * 3 + 25 * 4 + 80 + 75 + 45 + 12 * 2 - 3
    );
    expect(rosterStatValue(row, "fantasyPoints")).toBe(422);
    expect(
      hitterFantasyPoints({ stat: { hits: 100, homeRuns: 25 } })
    ).toBeNull();
  });

  it("filters by position and sorts hitters by a selected stat descending", () => {
    const rows = buildRosterRows(players, "all", "homeRuns");
    expect(rows.map(row => row.name)).toEqual(["Slugger", "Runner"]);
    expect(rosterStatValue(rows[0], "homeRuns")).toBe(32);
  });

  it("filters to multiple positions and sorts pitching metrics in the lower-is-better direction", () => {
    const rows = buildRosterRows(players, ["SP", "RP"], "era", 0, 0);
    expect(rows.map(row => row.name)).toEqual(["Ace", "Reliever"]);
    expect(rosterStatValue(rows[0], "era")).toBe(2.9);
  });

  it("keeps hitter and pitcher result sets separated by the selected stat family", () => {
    const rows = buildRosterRows(players, "all", "strikeOuts", 0, 30);
    expect(rows.map(row => row.name)).toEqual(["Ace"]);
  });

  it("excludes low-sample batting outliers when a PA threshold is selected", () => {
    const rows = buildRosterRows(players, [], "ops", 150, 0);
    expect(rows.map(row => row.name)).toEqual(["Slugger"]);
  });
});
