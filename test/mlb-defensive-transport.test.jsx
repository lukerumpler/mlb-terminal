import { describe, it, expect, afterEach } from "vitest";
import { mlb } from "../client/src/api/mlb.js";

// Same regression class as test/mlb-defensive-json.test.jsx, found during
// the §29 audit: mlb() had a defensive fix for a 200 response with a
// non-JSON body, but the fetch() call itself was never given the same
// treatment. A raw transport failure (offline, DNS, CORS — fetch() itself
// rejecting) has a browser-authored .message like "Failed to fetch", and
// when there's no stale cache to fall back on, that raw message was
// rethrown as-is and shown to the user verbatim (e.g.
// DataSourceStatusCenter's retry banner via retryProvider('mlb') ->
// getTodaysGames() -> mlb(), with no catch of its own in between).

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockTransportFailure() {
  global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
}

describe("mlb() — raw transport failure handling", () => {
  it("throws a clean, readable Error instead of the raw browser fetch error", async () => {
    mockTransportFailure();
    try {
      await mlb("/test/transport-failure-path", {}, { cache: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Failed to fetch/);
      expect(err.message).toMatch(/request failed/i);
      // Debugging still has access to what actually happened.
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
    const controller = new AbortController();
    controller.abort();
    await expect(
      mlb("/test/aborted-path", {}, { cache: false, signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
