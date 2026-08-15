import { describe, it, expect } from "vitest";
import {
  weightedWhiffPercent,
  pitcherWhiffPopulation,
  weightedArsenalStat,
  pitcherArsenalStatPopulation,
} from "../client/src/pages/PlayersPage.jsx";

// Roadmap #2 (pitcher side): pitch_arsenal is one row per pitcher per pitch
// type, so a pitcher's overall Whiff% has to be aggregated rather than read
// off a single field. These tests exercise that aggregation directly, since
// a get-the-weighting-wrong bug here wouldn't crash anything or show up as
// a missing-data blank — it would just silently rank pitchers on a wrong
// number, which no "does it render" smoke test would catch.

describe("weightedWhiffPercent (Roadmap #2, pitcher side)", () => {
  it("returns null for no rows", () => {
    expect(weightedWhiffPercent(null)).toBeNull();
    expect(weightedWhiffPercent([])).toBeNull();
  });

  it("weights by pitch count, not a plain average of the pitch types", () => {
    // A 90/10 pitch mix where the dominant pitch has a much lower whiff%
    // than the rare one. A naive (unweighted) average of 22 and 62 would
    // give 42 — the pitches-weighted answer should sit close to the
    // dominant pitch's own number instead.
    const rows = [
      { pitches: 900, whiff_percent: 22.0 },
      { pitches: 100, whiff_percent: 62.0 },
    ];
    const result = weightedWhiffPercent(rows);
    // (900*0.22 + 100*0.62) / 1000 * 100 = 26.0
    expect(result).toBeCloseTo(26.0, 5);
    expect(result).toBeLessThan(42); // sanity check against the naive-average trap
  });

  it("skips rows missing pitches or whiff_percent rather than treating them as 0", () => {
    const rows = [
      { pitches: 500, whiff_percent: 30.0 },
      { pitches: 500 }, // no whiff_percent — must not drag the average toward 0
      { whiff_percent: 40.0 }, // no pitches — same
    ];
    expect(weightedWhiffPercent(rows)).toBeCloseTo(30.0, 5);
  });

  it("ignores non-finite/zero-pitch rows without throwing", () => {
    const rows = [
      { pitches: 0, whiff_percent: 99 },
      { pitches: "n/a", whiff_percent: 20 },
      { pitches: 200, whiff_percent: 25 },
    ];
    expect(weightedWhiffPercent(rows)).toBeCloseTo(25.0, 5);
  });
});

describe("pitcherWhiffPopulation (Roadmap #2, pitcher side)", () => {
  it("returns one aggregated number per distinct pitcher id, not per row", () => {
    const population = [
      { player_id: 1, pitches: 600, whiff_percent: 20 },
      { player_id: 1, pitches: 400, whiff_percent: 40 }, // same pitcher, 2nd pitch type
      { player_id: 2, pitches: 500, whiff_percent: 30 },
    ];
    const result = pitcherWhiffPopulation(population);
    expect(result.length).toBe(2); // 2 pitchers, not 3 rows
    // Pitcher 1: (600*0.20 + 400*0.40) / 1000 * 100 = 28.0
    expect(result).toContainEqual(expect.closeTo(28.0, 5));
  });

  it("falls back through pitcher_id / id when player_id is absent, matching PitchShapePanel/mlb.js", () => {
    const population = [
      { pitcher_id: 7, pitches: 300, whiff_percent: 25 },
      { id: 8, pitches: 300, whiff_percent: 35 },
    ];
    const result = pitcherWhiffPopulation(population);
    expect(result.length).toBe(2);
  });

  it("handles an empty or missing population without throwing", () => {
    expect(pitcherWhiffPopulation(null)).toEqual([]);
    expect(pitcherWhiffPopulation([])).toEqual([]);
  });
});

// K% (added alongside Whiff% once both were confirmed-trusted pitch_arsenal
// columns — see PlateDisciplinePercentiles' pitcher branch). These exercise
// the generic weightedArsenalStat/pitcherArsenalStatPopulation functions
// directly with field='k_percent' rather than re-testing the weighting math
// itself (already covered above) — the thing actually worth checking here
// is that the field parameter is honored and Whiff%/K% don't cross-
// contaminate when both are aggregated from the same rows.
describe("weightedArsenalStat / pitcherArsenalStatPopulation — K% (Roadmap #2, pitcher side)", () => {
  it("aggregates a different field (k_percent) independently of whiff_percent on the same rows", () => {
    const rows = [
      { pitches: 700, whiff_percent: 20.0, k_percent: 30.0 },
      { pitches: 300, whiff_percent: 50.0, k_percent: 45.0 },
    ];
    const whiff = weightedArsenalStat(rows, "whiff_percent");
    const k = weightedArsenalStat(rows, "k_percent");
    // (700*0.20 + 300*0.50) / 1000 * 100 = 29.0
    expect(whiff).toBeCloseTo(29.0, 5);
    // (700*0.30 + 300*0.45) / 1000 * 100 = 34.5
    expect(k).toBeCloseTo(34.5, 5);
    expect(k).not.toBeCloseTo(whiff, 1);
  });

  it("skips rows missing k_percent specifically, even if whiff_percent is present", () => {
    const rows = [
      { pitches: 500, whiff_percent: 20, k_percent: 25 },
      { pitches: 500, whiff_percent: 20 }, // whiff_percent present, k_percent missing
    ];
    expect(weightedArsenalStat(rows, "k_percent")).toBeCloseTo(25.0, 5);
  });

  it("groups the population by pitcher for whichever field is requested", () => {
    const population = [
      { player_id: 1, pitches: 600, k_percent: 20 },
      { player_id: 1, pitches: 400, k_percent: 40 },
      { player_id: 2, pitches: 500, k_percent: 30 },
    ];
    const result = pitcherArsenalStatPopulation(population, "k_percent");
    expect(result.length).toBe(2);
    // Pitcher 1: (600*0.20 + 400*0.40) / 1000 * 100 = 28.0
    expect(result).toContainEqual(expect.closeTo(28.0, 5));
  });

  it("the whiff_percent-fixed wrappers still match calling the generic function directly", () => {
    const rows = [
      { pitches: 400, whiff_percent: 33.0 },
      { pitches: 100, whiff_percent: 10.0 },
    ];
    expect(weightedWhiffPercent(rows)).toBeCloseTo(
      weightedArsenalStat(rows, "whiff_percent"),
      8
    );
  });
});
