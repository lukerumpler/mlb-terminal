import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, warmSavantCache } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  warmSavantCache: vi.fn(),
}));

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./savant.js", () => ({ warmSavantCache }));

import { scheduledSavantRefresh } from "./scheduled-savant-refresh";

function response() {
  const payload = { statusCode: 200, body: null as unknown };
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

describe("scheduled Savant refresh", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
    warmSavantCache.mockReset();
  });

  it("rejects non-cron callers without warming a provider cache", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const res = response();

    await scheduledSavantRefresh({} as never, res as never);

    expect(res.payload.statusCode).toBe(403);
    expect(warmSavantCache).not.toHaveBeenCalled();
  });

  it("warms the current Savant cache once for a trusted scheduled caller", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "savant-daily" });
    warmSavantCache.mockResolvedValue(undefined);
    const res = response();

    await scheduledSavantRefresh({} as never, res as never);

    expect(warmSavantCache).toHaveBeenCalledTimes(1);
    expect(warmSavantCache).toHaveBeenCalledWith("2026");
    expect(res.payload.statusCode).toBe(200);
    expect(res.payload.body).toEqual({ ok: true, refreshed: "savant", policy: "nightly-utc" });
  });

  it("returns a retryable error when the scheduled provider warm-up fails", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "savant-daily" });
    warmSavantCache.mockRejectedValue(new Error("provider unavailable"));
    const res = response();

    await scheduledSavantRefresh({} as never, res as never);

    expect(res.payload.statusCode).toBe(500);
    expect(res.payload.body).toEqual(expect.objectContaining({ error: "provider unavailable" }));
  });
});
