import { describe, it, expect, afterEach } from "vitest";
import { getScoreboard } from "../client/src/api/ncaa.js";

// Same regression class as test/ncaa-defensive-json.test.jsx and
// test/mlb-defensive-transport.test.jsx, found during the §29 audit:
// ncaa()'s fetch(url) call had no try/catch of its own at all — a raw
// transport failure (offline, DNS, CORS) propagated straight out with a
// browser-authored .message like "Failed to fetch", and OtherPages.jsx
// shows err.message to the user verbatim for this call path
// (`setError(err.message || 'Could not load college baseball data.')`),
// same as the non-JSON-body case already covered.

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockTransportFailure() {
  global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
}

describe("ncaa() — raw transport failure handling", () => {
  it("throws a clean, readable Error instead of the raw browser fetch error", async () => {
    mockTransportFailure();
    try {
      await getScoreboard("2026/05");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Failed to fetch/);
      expect(err.message).toMatch(/request failed/i);
      expect(err.cause).toBeInstanceOf(TypeError);
      expect(err.cause.message).toBe("Failed to fetch");
    }
  });
});
