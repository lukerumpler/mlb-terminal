import { describe, expect, it } from "vitest";
import {
  buildBaseballReferencePlayerUrl,
  normalizeIdentityName,
  parseBaseballReferenceSearchCandidates,
  selectExactBaseballReferenceCandidate,
} from "./player-identity.js";

describe("player identity resolver", () => {
  it("normalizes accents and punctuation before exact identity comparison", () => {
    expect(normalizeIdentityName("José Ramírez")).toBe("jose ramirez");
  });

  it("accepts only canonical Baseball-Reference player paths", () => {
    expect(buildBaseballReferencePlayerUrl("ohtansh01")).toBe("https://www.baseball-reference.com/players/o/ohtansh01.shtml");
    expect(buildBaseballReferencePlayerUrl("not-a-player")).toBeNull();
  });

  it("selects an exact normalized-name search candidate instead of a partial match", () => {
    const candidates = parseBaseballReferenceSearchCandidates(`
      <a href="/players/o/ohtansh01.shtml">Shohei Ohtani</a>
      <a href="/players/o/ohtanx01.shtml">Shohei Otani</a>
    `);
    expect(selectExactBaseballReferenceCandidate(candidates, "Shohei Ohtani")?.id).toBe("ohtansh01");
  });
});
