import { describe, expect, it } from "vitest";
import {
  currentMlbSeason,
  EARLIEST_SUPPORTED_SEASON,
  isPlausibleSeason,
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

describe("isPlausibleSeason", () => {
  const now = new Date("2026-10-06T00:00:00Z");

  it("accepts integer seasons from 1901 through next season", () => {
    for (const season of [1901, 2008, 2024, 2026, 2027]) {
      expect(isPlausibleSeason(season, { now }), String(season)).toBe(true);
    }
  });

  it("rejects values that are out of range or not integers", () => {
    for (const season of [
      1900,
      0,
      -1,
      2028,
      9999,
      1e9,
      2026.5,
      Number.NaN,
      Infinity,
    ]) {
      expect(isPlausibleSeason(season, { now }), String(season)).toBe(false);
    }
  });

  it("does not coerce strings or other types; callers parse first", () => {
    for (const value of ["2026", null, undefined, [2026], {}]) {
      expect(isPlausibleSeason(value, { now })).toBe(false);
    }
  });

  it("honours a custom floor and follows the calendar", () => {
    expect(isPlausibleSeason(2007, { min: 2008, now })).toBe(false);
    expect(isPlausibleSeason(2008, { min: 2008, now })).toBe(true);
    expect(
      isPlausibleSeason(2028, { now: new Date("2027-03-01T00:00:00Z") })
    ).toBe(true);
  });
});
