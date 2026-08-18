import { describe, expect, it, beforeEach } from "vitest";
import { __resetCacheHealthForTests, readCacheHealth, recordCacheOutcome } from "./cache-health";

describe("cache health telemetry", () => {
  beforeEach(() => __resetCacheHealthForTests());

  it("aggregates durable, stale, and upstream outcomes by provider", async () => {
    const now = new Date("2026-08-16T18:00:00.000Z").getTime();
    recordCacheOutcome("contract", "durable-hit", now);
    recordCacheOutcome("contract", "durable-hit", now);
    recordCacheOutcome("contract", "upstream-miss", now);
    recordCacheOutcome("team-financials", "stale-hit", now);

    await expect(readCacheHealth(now)).resolves.toMatchObject({
      day: "2026-08-16",
      providers: {
        contract: { "durable-hit": 2, "stale-hit": 0, "upstream-miss": 1 },
        "team-financials": { "durable-hit": 0, "stale-hit": 1, "upstream-miss": 0 },
      },
    });
  });

  it("keeps a new UTC day separate from the previous day", async () => {
    const previous = new Date("2026-08-16T23:59:59.000Z").getTime();
    const current = new Date("2026-08-17T00:00:01.000Z").getTime();
    recordCacheOutcome("contract", "upstream-miss", previous);
    recordCacheOutcome("contract", "durable-hit", current);

    await expect(readCacheHealth(current)).resolves.toMatchObject({
      day: "2026-08-17",
      providers: { contract: { "durable-hit": 1, "stale-hit": 0, "upstream-miss": 0 } },
    });
  });
});
