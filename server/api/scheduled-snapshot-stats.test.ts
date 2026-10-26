import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getDb, runSnapshot } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getDb: vi.fn(),
  runSnapshot: vi.fn(),
}));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("../db", () => ({ getDb }));
vi.mock("../mlb-warehouse/seasonStatsStore", () => ({
  createDrizzleSeasonStatStore: () => ({}),
}));
vi.mock("../mlb-warehouse/seasonStats", () => ({ runSnapshot }));

import { scheduledSnapshotStats } from "./scheduled-snapshot-stats";

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
const report = (ok = true) => ({
  season: 2026,
  snapshotDate: "2026-10-26",
  ok,
  groups: [],
  definitionVersion: 1,
});

describe("scheduled season-stat snapshot", () => {
  beforeEach(() => {
    authenticateRequest.mockReset().mockResolvedValue({ isCron: true });
    getDb.mockReset().mockResolvedValue({});
    runSnapshot.mockReset().mockResolvedValue(report());
  });

  it("rejects non-cron callers without touching the database", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = response();
    await scheduledSnapshotStats({} as never, res as never);
    expect(res.payload.statusCode).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
    expect(runSnapshot).not.toHaveBeenCalled();
  });

  it("503s when no database is configured", async () => {
    getDb.mockResolvedValue(null);
    const res = response();
    await scheduledSnapshotStats({} as never, res as never);
    expect(res.payload.statusCode).toBe(503);
    expect(res.payload.body.ok).toBe(false);
  });

  it("returns the report with 200 even when a group failed", async () => {
    runSnapshot.mockResolvedValue(report(false));
    const res = response();
    await scheduledSnapshotStats({} as never, res as never);
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body.ok).toBe(false);
  });

  it("500s only on an unexpected throw", async () => {
    runSnapshot.mockRejectedValue(new Error("boom"));
    const res = response();
    await scheduledSnapshotStats({} as never, res as never);
    expect(res.payload.statusCode).toBe(500);
    expect(res.payload.body.error).toBe("boom");
  });
});
