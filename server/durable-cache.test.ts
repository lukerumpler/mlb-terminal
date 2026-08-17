import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import { readDurableCache, updateDurableCacheMetadata, writeDurableCache } from "./durable-cache";

function makeDb({ rows = [] as unknown[] } = {}) {
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    })),
  }));
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  }));
  return { insert, update, select };
}

describe("durable API cache", () => {
  beforeEach(() => {
    getDb.mockReset();
  });

  it("fails open when the database is unavailable", async () => {
    getDb.mockResolvedValue(null);
    await expect(readDurableCache("missing-db")).resolves.toBeNull();
    await expect(writeDurableCache({
      cacheKey: "missing-db",
      source: "test",
      data: { ok: true },
      freshUntil: new Date(),
      staleUntil: new Date(),
    })).resolves.toBe(false);
  });

  it("reads and parses a stored JSON payload", async () => {
    const db = makeDb({ rows: [{
      cacheKey: "mlb:abc",
      source: "MLB Stats API",
      payload: JSON.stringify({ value: 0 }),
      freshUntil: new Date("2026-08-16T22:00:00Z"),
      staleUntil: new Date("2026-08-16T23:00:00Z"),
      lastAttemptDay: null,
      failureUntil: null,
    }] });
    getDb.mockResolvedValue(db);
    await expect(readDurableCache("mlb:abc")).resolves.toMatchObject({
      cacheKey: "mlb:abc",
      source: "MLB Stats API",
      data: { value: 0 },
    });
  });

  it("upserts JSON payload and refresh metadata", async () => {
    const db = makeDb();
    getDb.mockResolvedValue(db);
    const freshUntil = new Date("2026-08-16T22:00:00Z");
    const staleUntil = new Date("2026-08-16T23:00:00Z");
    await expect(writeDurableCache({
      cacheKey: "savant:abc",
      source: "Baseball Savant",
      data: { zero: 0 },
      freshUntil,
      staleUntil,
      lastAttemptDay: "2026-08-16",
    })).resolves.toBe(true);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("updates failure metadata without replacing the cached payload", async () => {
    const db = makeDb();
    getDb.mockResolvedValue(db);
    await expect(updateDurableCacheMetadata("fangraphs:abc", {
      lastAttemptDay: "2026-08-16",
      failureUntil: new Date("2026-08-16T22:05:00Z"),
    })).resolves.toBe(true);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

