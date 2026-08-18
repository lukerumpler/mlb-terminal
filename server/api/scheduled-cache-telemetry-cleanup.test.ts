import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, cleanupExpiredCacheTelemetry } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  cleanupExpiredCacheTelemetry: vi.fn(),
}));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("../cache-health", async importOriginal => ({
  ...(await importOriginal<typeof import("../cache-health")>()),
  cleanupExpiredCacheTelemetry,
}));

import { scheduledCacheTelemetryCleanup } from "./scheduled-cache-telemetry-cleanup";
import { retentionCutoffDay } from "../cache-health";

function response() {
  const payload = { statusCode: 200, body: null as unknown };
  return {
    payload,
    status(code: number) { payload.statusCode = code; return this; },
    json(body: unknown) { payload.body = body; return this; },
  };
}

describe("scheduled cache telemetry cleanup", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
    cleanupExpiredCacheTelemetry.mockReset();
  });

  it("uses a strict UTC cutoff that preserves exactly 30 days", () => {
    expect(retentionCutoffDay(new Date("2026-08-16T12:00:00.000Z").getTime())).toBe("2026-07-17");
  });

  it("rejects non-cron callers", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = response();
    await scheduledCacheTelemetryCleanup({} as never, res as never);
    expect(res.payload.statusCode).toBe(403);
    expect(cleanupExpiredCacheTelemetry).not.toHaveBeenCalled();
  });

  it("returns an auditable cleanup result for cron callers", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cleanup-task" });
    cleanupExpiredCacheTelemetry.mockResolvedValue({ cutoffDay: "2026-07-17", deletedRows: 12 });
    const res = response();
    await scheduledCacheTelemetryCleanup({} as never, res as never);
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body).toEqual(expect.objectContaining({ ok: true, retentionDays: 30, cutoffDay: "2026-07-17", deletedRows: 12 }));
  });

  it("returns 500 so Heartbeat can retry database failures", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cleanup-task" });
    cleanupExpiredCacheTelemetry.mockRejectedValue(new Error("database unavailable"));
    const res = response();
    await scheduledCacheTelemetryCleanup({} as never, res as never);
    expect(res.payload.statusCode).toBe(500);
    expect(res.payload.body).toEqual(expect.objectContaining({ error: "database unavailable" }));
  });
});
