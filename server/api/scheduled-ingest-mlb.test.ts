import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getDb, runIngestion } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getDb: vi.fn(),
  runIngestion: vi.fn(),
}));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("../db", () => ({ getDb }));
vi.mock("../mlb-warehouse/store", () => ({
  createDrizzleWarehouseStore: () => ({}),
}));
vi.mock("../mlb-warehouse/ingest", async importOriginal => ({
  ...(await importOriginal<typeof import("../mlb-warehouse/ingest")>()),
  runIngestion,
}));

import { scheduledIngestMlb } from "./scheduled-ingest-mlb";

function response() {
  const payload = { statusCode: 200, body: null as any };
  return {
    payload,
    status(code: number) {
      payload.statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload.body = body;
      return this;
    },
  };
}
const report = (over: Record<string, unknown> = {}) => ({
  season: 2026,
  discovered: 12,
  skippedNotFinal: 3,
  discoveryErrors: [],
  requeuedForRefresh: 20,
  skipped: 0,
  attempted: 30,
  succeeded: 30,
  failed: 0,
  failures: [],
  warnings: [],
  status: { pending: 0, processing: 0, complete: 400, failed: 0 },
  parserVersion: 1,
  ...over,
});

describe("scheduled MLB warehouse ingest", () => {
  beforeEach(() => {
    authenticateRequest.mockReset().mockResolvedValue({ isCron: true });
    getDb.mockReset().mockResolvedValue({});
    runIngestion.mockReset().mockResolvedValue(report());
  });

  it("rejects non-cron callers without touching the database", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    expect(res.payload.statusCode).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("answers 503 (not a crash) when no database is configured", async () => {
    getDb.mockResolvedValue(null);
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    expect(res.payload.statusCode).toBe(503);
    expect(runIngestion).not.toHaveBeenCalled();
  });

  it("runs a bounded, windowed ingest for the current season", async () => {
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    const opts = runIngestion.mock.calls[0][0];
    expect(opts.limit).toBeGreaterThanOrEqual(60);
    expect(opts.discoverSinceDays).toBeGreaterThan(0);
    expect(opts.refreshRecentDays).toBeGreaterThan(0);
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body).toMatchObject({ ok: true, succeeded: 30 });
  });

  it("reports known-empty games as status, not as a failed run", async () => {
    runIngestion.mockResolvedValue(
      report({
        failed: 1,
        failures: [
          {
            gamePk: 7,
            error:
              "Game 7 is final but produced zero pitches (incomplete feed?)",
          },
        ],
      })
    );
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body).toMatchObject({
      ok: true,
      knownEmptyGames: [7],
      actionableFailures: [],
    });
  });

  it("flags real failures and discovery errors with ok:false but still 200", async () => {
    runIngestion.mockResolvedValue(
      report({
        failed: 1,
        failures: [{ gamePk: 9, error: "MLB API 503 for game 9" }],
        discoveryErrors: ["x"],
      })
    );
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body.ok).toBe(false);
    expect(res.payload.body.actionableFailures).toEqual([
      { gamePk: 9, error: "MLB API 503 for game 9" },
    ]);
  });

  it("returns 500 when the run itself throws so Heartbeat can retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runIngestion.mockRejectedValue(new Error("database unavailable"));
    const res = response();
    await scheduledIngestMlb({} as never, res as never);
    expect(res.payload.statusCode).toBe(500);
  });
});
