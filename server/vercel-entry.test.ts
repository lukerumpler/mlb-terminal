import { describe, expect, it } from "vitest";
import { normalizeServerlessRequestUrl } from "../api/index";

describe("Vercel API entrypoint", () => {
  it("normalizes absolute serverless request URLs to the Express path and query", () => {
    const request = { url: "https://skipbasebal-mm6hz9ps.manus.space/api/mlb?path=%2Fteams%2F119" } as Request;
    normalizeServerlessRequestUrl(request);
    expect(request.url).toBe("/api/mlb?path=%2Fteams%2F119");
  });
});
