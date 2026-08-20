import { describe, expect, it } from "vitest";
import { legacyApiPaths } from "./routes";

describe("legacy API route registration", () => {
  it("keeps every original SKIP proxy path", () => {
    expect(legacyApiPaths).toEqual([
      "/api/mlb",
      "/api/ncaa",
      "/api/savant",
      "/api/feed",
      "/api/news",
      "/api/contract",
      "/api/comparison-summary",
      "/api/natural-search",
      "/api/playoffstatus-odds",
      "/api/player-advanced",
      "/api/player-identity",
    ]);
  });
});
