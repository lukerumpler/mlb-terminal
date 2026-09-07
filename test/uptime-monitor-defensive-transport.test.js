import { describe, it, expect, afterEach } from "vitest";
import { getUptimeMonitorDashboard } from "../client/src/api/uptimeMonitor.js";

// Same regression class as test/mlb-defensive-transport.test.jsx and
// test/ncaa-defensive-transport.test.jsx (§29 audit): getUptimeMonitorDashboard
// had a friendly message for a non-ok HTTP status, but fetch() itself
// failing (offline/DNS/CORS) and a malformed 200 body both propagated raw
// browser-authored errors. UptimeMonitorPage renders error.message directly
// into its "Monitor unavailable" panel with no fallback text of its own, so
// either raw error used to be shown to the user verbatim.

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("getUptimeMonitorDashboard() — raw error handling", () => {
  it("wraps a raw transport failure in a friendly, readable message", async () => {
    global.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    try {
      await getUptimeMonitorDashboard(7);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).not.toMatch(/Failed to fetch/);
      expect(err.message).toMatch(/uptime monitor request failed/i);
      expect(err.cause).toBeInstanceOf(TypeError);
      expect(err.cause.message).toBe("Failed to fetch");
    }
  });

  it("wraps a malformed (non-JSON) 200 response in a friendly message", async () => {
    global.fetch = () => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
    });
    try {
      await getUptimeMonitorDashboard(7);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err.message).not.toMatch(/Unexpected token/);
      expect(err.message).toMatch(/unreadable response/i);
      expect(err.cause).toBeInstanceOf(SyntaxError);
    }
  });

  it("still gives a clean message for a non-ok HTTP status (unchanged behavior)", async () => {
    global.fetch = () => Promise.resolve({ ok: false, status: 503 });
    await expect(getUptimeMonitorDashboard(7)).rejects.toThrow("Uptime monitor request failed (503)");
  });

  it("still resolves normally on a healthy response", async () => {
    global.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ targets: [] }) });
    await expect(getUptimeMonitorDashboard(7)).resolves.toEqual({ targets: [] });
  });
});
