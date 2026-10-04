import { describe, expect, it } from "vitest";
import {
  currentMlbSeason,
  EARLIEST_SUPPORTED_SEASON,
  isSupportedSeason,
} from "./season";

describe("currentMlbSeason", () => {
  it("treats January as the previous season's offseason", () => {
    expect(currentMlbSeason(new Date("2027-01-01T00:00:00Z"))).toBe(2026);
    expect(currentMlbSeason(new Date("2027-01-31T23:59:59Z"))).toBe(2026);
    expect(currentMlbSeason(new Date("2027-02-01T00:00:00Z"))).toBe(2027);
    expect(currentMlbSeason(new Date("2026-10-03T00:00:00Z"))).toBe(2026);
    expect(currentMlbSeason(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
  });
});

describe("isSupportedSeason", () => {
  const oct2026 = new Date("2026-10-03T00:00:00Z");
  const jan2027 = new Date("2027-01-15T00:00:00Z");
  const feb2027 = new Date("2027-02-15T00:00:00Z");

  it("accepts the earliest season through one past the current", () => {
    expect(isSupportedSeason(EARLIEST_SUPPORTED_SEASON, oct2026)).toBe(true);
    expect(isSupportedSeason(2026, oct2026)).toBe(true);
    expect(isSupportedSeason(2027, oct2026)).toBe(true);
    expect(isSupportedSeason("2026", oct2026)).toBe(true);
  });

  it("rejects out-of-range and non-integer values", () => {
    for (const bad of [2023, 2028, 2026.5, "abc", NaN, null, undefined, ""]) {
      expect(isSupportedSeason(bad, oct2026), String(bad)).toBe(false);
    }
  });

  it("moves with the calendar instead of a fixed 2030 ceiling", () => {
    expect(isSupportedSeason(2028, jan2027)).toBe(false);
    expect(isSupportedSeason(2028, feb2027)).toBe(true);
    expect(isSupportedSeason(2029, feb2027)).toBe(false);
  });
});
