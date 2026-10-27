/*
Our goal is to make sure a server instance only retries Baseball-Reference for a snapshot that it made itself. When an instance
starts up it can load yesterday's-style snapshot that ANOTHER instance saved in our database. If that snapshot is missing
Baseball-Reference we must not retry on its behalf, because every new instance doing that would multiply the requests we send to
Baseball-Reference. Only the instance that made the partial snapshot spends its own daily retry budget.

To solve this we are going to:
  1. Pretend we are a real server (not a test run) so the database cache is used, and fake the database to hold a snapshot that has FanGraphs only
  2. Replace the internet with a fake fetch that writes down every address we ask for
  3. Ask for the WAR numbers twice, 31 minutes apart, and check the first answer came from the database
  4. Cross-check that we never asked Baseball-Reference, even though it was missing and the retry gap had passed
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Section A: Our fake database

const { readDurableCache, writeDurableCache } = vi.hoisted(() => ({
  readDurableCache: vi.fn(),                                    // Stands in for "read what another instance saved"
  writeDurableCache: vi.fn(async () => undefined),              // Stands in for "save what we found"
}));
vi.mock("../durable-cache", () => ({ readDurableCache, writeDurableCache }));

import { __resetFanGraphsProviderStateForTests, loadAggregateWar } from "./fangraphs-models.js";

const SEASON = 2026;

function partialSnapshot() {
  /*
  Our "partialSnapshot" is a function that builds the snapshot another instance would have saved. It has FanGraphs
  but not Baseball-Reference, and it stays fresh until the next UTC midnight.
  */
  const fanGraphs = { found: true, season: SEASON, teams: [{ team: "SDP", totalWAR: 36 }], source: "FanGraphs", freshness: "live" };
  return {
    data: {
      ...fanGraphs,
      providerSnapshots: { fanGraphs, baseballReference: null },
      statuses: { batting: "live", pitching: "live", baseballReference: "upstream-unavailable" },
    },
    freshUntil: "2026-10-13T00:00:00.000Z",
    staleUntil: "2026-10-20T00:00:00.000Z",
  };
}


// Section B: Our checks

describe("a snapshot that another instance made is never retried on its behalf", () => {
  const urls: string[] = [];                                    // Every address our code asks for

  beforeEach(() => {
    __resetFanGraphsProviderStateForTests();
    urls.length = 0;
    readDurableCache.mockReset();
    readDurableCache.mockResolvedValue(partialSnapshot());
    vi.stubEnv("NODE_ENV", "production");                       // Act like a real server so the database cache is used
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      urls.push(String(input));                                 // Write down what we were asked for
      return new Response("ok", { status: 200 });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves the saved snapshot and never asks Baseball-Reference, even after the retry gap", async () => {
    const first = await loadAggregateWar(SEASON);
    expect(first.cache).toBe("DURABLE-HIT");                    // The first answer came from the database
    expect(first.data.providerSnapshots.baseballReference).toBeNull();

    vi.setSystemTime(new Date("2026-10-12T10:31:00Z"));         // 31 minutes later, past the 30 minute gap
    const second = await loadAggregateWar(SEASON);
    expect(second.cache).toBe("HIT");                           // Now it is in memory, still the same snapshot
    expect(urls).toEqual([]);                                   // We never asked any website
    expect(writeDurableCache).not.toHaveBeenCalled();           // And we saved nothing
  });
});
