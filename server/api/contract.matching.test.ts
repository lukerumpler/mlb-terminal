import { describe, expect, it } from "vitest";
import { isAcceptableMatch, normalizeName } from "./contract.js";

describe("contract player-name matching", () => {
  it("normalizes diacritics before comparing names", () => {
    expect(normalizeName("José Ramírez")).toBe("jose ramirez");
    expect(normalizeName("O'Neil")).toBe("oneil");
  });

  it("requires an exact match for short names", () => {
    expect(isAcceptableMatch("judge", "jones", 3)).toBe(false);
    expect(isAcceptableMatch("judge", "judge", 0)).toBe(true);
  });

  it("allows only a small, length-scaled distance for longer names", () => {
    expect(isAcceptableMatch("shohei ohtani", "shohei ohtani", 0)).toBe(true);
    expect(isAcceptableMatch("shohei ohtani", "shohei ohtan", 1)).toBe(true);
    expect(isAcceptableMatch("shohei ohtani", "completely different", 14)).toBe(false);
  });
});
