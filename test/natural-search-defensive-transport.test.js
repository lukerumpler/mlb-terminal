import { describe, it, expect, afterEach } from "vitest";
import { routeNaturalLanguageSearch } from "../client/src/api/naturalSearch.js";

// Same regression class as the other *-defensive-transport test files
// (§29 audit): routeNaturalLanguageSearch() already guarded the
// response.json() parse (`.catch(() => ({}))`) and the non-ok HTTP status,
// but fetch() itself failing (offline/DNS/CORS) had no guard at all. This
// one's a fifth confirmed-live instance — CommandPalette's ⌘K AI search
// renders error.message directly into a role="alert" banner
// (`setAiMessage(error?.message || '...')`).

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("routeNaturalLanguageSearch() — raw transport failure handling", () => {
  it("wraps a raw transport failure in a friendly, readable message", async () => {
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    try {
      await routeNaturalLanguageSearch("how good is the padres bullpen");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Failed to fetch/);
      expect(err.message).toMatch(/could not reach the server/i);
      expect(err.cause).toBeInstanceOf(TypeError);
      expect(err.cause.message).toBe("Failed to fetch");
    }
  });

  it("still rethrows AbortError as-is rather than wrapping it", async () => {
    global.fetch = () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    };
    await expect(
      routeNaturalLanguageSearch("how good is the padres bullpen")
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("still gives a clean message for a non-ok HTTP status (unchanged behavior)", async () => {
    global.fetch = () => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Search backend is unavailable." }),
    });
    await expect(
      routeNaturalLanguageSearch("how good is the padres bullpen")
    ).rejects.toThrow("Search backend is unavailable.");
  });

  it("still resolves normally on a healthy response", async () => {
    global.fetch = () => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ intent: "team-stat", tab: "overview" }),
    });
    await expect(
      routeNaturalLanguageSearch("how good is the padres bullpen")
    ).resolves.toEqual({ intent: "team-stat", tab: "overview" });
  });
});
