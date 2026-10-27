import { describe, expect, it } from "vitest";
import { clampPage, clampPageSize } from "./queries.js";

describe("pagination clamps", () => {
  it("default, clamp and truncate sane numbers", () => {
    expect(clampPageSize(undefined)).toBe(50);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(10_000)).toBe(250);
    expect(clampPageSize(12.9)).toBe(12);
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(-4)).toBe(1);
  });

  // Route handlers pass Number(req.query.page) straight through, so "abc",
  // "" (->0), "Infinity" and friends reach these functions as NaN/Infinity.
  it("never returns NaN/Infinity (which would become LIMIT NaN)", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(Number.isInteger(clampPageSize(bad))).toBe(true);
      expect(Number.isInteger(clampPage(bad))).toBe(true);
    }
    expect(clampPageSize(NaN)).toBe(50);
    expect(clampPage(NaN)).toBe(1);
  });

  it("caps page so offset arithmetic stays a safe integer", () => {
    expect(
      Number.isSafeInteger((clampPage(1e300) - 1) * clampPageSize(250))
    ).toBe(true);
  });
});
