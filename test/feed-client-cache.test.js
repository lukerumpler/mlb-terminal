import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetFeedClientStateForTests, fetchFeeds } from "../client/src/api/feed.js";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;

function newsPayload(title) {
  return {
    items: [{ id: title, text: title, handle: "mlb", sourceKey: "mlb", isoDate: "2026-08-21T12:00:00Z" }],
    status: "tier-1",
    freshness: "live",
    sourceStatuses: [{ key: "mlb", label: "MLB", ok: true, tier: 1 }],
    sources: [],
  };
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe("Intel Feed client cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00Z"));
    __resetFeedClientStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    __resetFeedClientStateForTests();
  });

  it("refreshes a response after the fresh TTL instead of serving stale content until stale expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(newsPayload("Initial report")))
      .mockResolvedValueOnce(jsonResponse(newsPayload("Refreshed report")));
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchFeeds(["mlb"], 12)).items[0].text).toBe("Initial report");
    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);

    const refreshed = await fetchFeeds(["mlb"], 12);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.items[0].text).toBe("Refreshed report");
    expect(refreshed.status).toBe("tier-1");
  });

  it("uses the stale entry only when a refresh attempt fails within the fallback window", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(newsPayload("Verified report")))
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFeeds(["mlb"], 12);
    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);

    const fallback = await fetchFeeds(["mlb"], 12);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallback.items[0].text).toBe("Verified report");
    expect(fallback.status).toBe("cached-fallback");
    expect(fallback.freshness).toBe("stale-cached");
  });
});
