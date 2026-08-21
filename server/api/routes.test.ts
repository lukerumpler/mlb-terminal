import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("uses statically traceable handler imports for the Vercel catch-all artifact", () => {
    const source = readFileSync(
      resolve(process.cwd(), "server/api/routes.ts"),
      "utf8"
    );

    expect(source).toContain('import mlbHandler from "./mlb.js";');
    expect(source).toContain(
      'import playerIdentityHandler from "./player-identity.js";'
    );
    expect(source).not.toContain("Promise.all([\n    // The migrated handlers");
  });
});
