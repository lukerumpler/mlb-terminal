import { describe, it, expect } from "vitest";
import { aggregateZoneWhiffs, hasZoneWhiffData } from "../client/src/pages/PlayersPage.jsx";

// Real Statcast Search fields (baseballsavant.mlb.com/csv-docs): `zone`
// (1-9 in-zone, 11-14 the four outside corners) and `description` (e.g.
// 'swinging_strike', 'foul', 'hit_into_play'). No alt-name guessing here —
// same reasoning as contact-heatmap.test.jsx's fixtures.
const swing = (zone, description) => ({ zone, description });

describe("aggregateZoneWhiffs (Roadmap #3 upgrade — real zone-level Whiff%)", () => {
  it("counts swings and whiffs per zone correctly", () => {
    const rows = [
      swing(5, "swinging_strike"),
      swing(5, "foul"),
      swing(5, "hit_into_play"),
      swing(1, "swinging_strike_blocked"),
    ];
    expect(aggregateZoneWhiffs(rows)).toEqual({
      5: { swings: 3, whiffs: 1 },
      1: { swings: 1, whiffs: 1 },
    });
  });

  it("skips rows with no numeric zone rather than guessing or dropping the whole dataset", () => {
    const rows = [
      swing(5, "foul"),
      { description: "foul" },
      swing(null, "swinging_strike"),
    ];
    expect(aggregateZoneWhiffs(rows)).toEqual({ 5: { swings: 1, whiffs: 0 } });
  });

  it("only counts real swinging-strike descriptions as whiffs, not fouls or balls in play", () => {
    const rows = [
      swing(2, "foul"),
      swing(2, "hit_into_play"),
      swing(2, "foul_tip"),
    ];
    expect(aggregateZoneWhiffs(rows)).toEqual({ 2: { swings: 3, whiffs: 0 } });
  });

  it("handles null, undefined, or empty input without throwing", () => {
    expect(aggregateZoneWhiffs(null)).toEqual({});
    expect(aggregateZoneWhiffs(undefined)).toEqual({});
    expect(aggregateZoneWhiffs([])).toEqual({});
  });

  it("handles a realistic mixed sample across in-zone and outside-corner zones", () => {
    const rows = [
      swing(1, "foul"),
      swing(1, "swinging_strike"),
      swing(1, "hit_into_play"),
      swing(11, "swinging_strike"),
      swing(11, "swinging_strike"),
      swing(14, "hit_into_play"),
    ];
    const result = aggregateZoneWhiffs(rows);
    expect(result[1]).toEqual({ swings: 3, whiffs: 1 });
    expect(result[11]).toEqual({ swings: 2, whiffs: 2 });
    expect(result[14]).toEqual({ swings: 1, whiffs: 0 });
  });
});

// §29 data-provenance sweep: the "Plate Discipline" panel's badge used to
// hardcode "Live Savant" regardless of whether contactPoints actually had
// any plottable data — including on a Savant fetch failure, where the
// panel body was already honestly showing "No per-zone Statcast swing data
// available for this player yet." hasZoneWhiffData() is the single check
// both the badge and ZoneWhiffGrid's body now share, so they can't
// disagree about whether there's real data to show.
describe("hasZoneWhiffData (backs the Plate Discipline panel's provenance badge)", () => {
  it("is true when there's at least one usable zone-level swing", () => {
    expect(hasZoneWhiffData([swing(5, "foul")])).toBe(true);
  });

  it("is false for null, undefined, or an empty array", () => {
    expect(hasZoneWhiffData(null)).toBe(false);
    expect(hasZoneWhiffData(undefined)).toBe(false);
    expect(hasZoneWhiffData([])).toBe(false);
  });

  it("is false when every row is missing zone data, even though the array itself is non-empty", () => {
    // The exact edge case a naive `contactPoints.length > 0` check would
    // get wrong: rows are present, but none of them carry usable zone
    // data, so ZoneWhiffGrid renders its empty state regardless.
    expect(hasZoneWhiffData([{ description: "foul" }, { zone: null, description: "swinging_strike" }])).toBe(false);
  });
});
