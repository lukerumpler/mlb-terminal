import { eq } from "drizzle-orm";
import { apiResponseCache } from "../drizzle/schema";
import { getDb } from "./db";

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type DurableCacheRecord = {
  cacheKey: string;
  source: string;
  data: unknown;
  freshUntil: Date;
  staleUntil: Date;
  lastAttemptDay?: string | null;
  failureUntil?: Date | null;
};

const durableReadInFlight = new Map<string, Promise<DurableCacheRecord | null>>();

export async function readDurableCache(cacheKey: string) {
  if (!cacheKey) return null;
  const existing = durableReadInFlight.get(cacheKey);
  if (existing) return existing;
  const request = (async () => {
    const db = await getDb();
    if (!db) return null;
    try {
      const rows = await db
        .select()
        .from(apiResponseCache)
        .where(eq(apiResponseCache.cacheKey, cacheKey))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const data = JSON.parse(row.payload);
      return {
        cacheKey: row.cacheKey,
        source: row.source,
        data,
        freshUntil: row.freshUntil,
        staleUntil: row.staleUntil,
        lastAttemptDay: row.lastAttemptDay,
        failureUntil: row.failureUntil,
      } satisfies DurableCacheRecord;
    } catch (error) {
      console.warn("[DurableCache] Read failed:", describeError(error));
      return null;
    }
  })();
  durableReadInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (durableReadInFlight.get(cacheKey) === request) durableReadInFlight.delete(cacheKey);
  }
}

export async function writeDurableCache(record: DurableCacheRecord) {
  if (!record?.cacheKey || record.data === undefined) return false;
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(apiResponseCache).values({
      cacheKey: record.cacheKey,
      source: record.source,
      payload: JSON.stringify(record.data),
      freshUntil: record.freshUntil,
      staleUntil: record.staleUntil,
      lastAttemptDay: record.lastAttemptDay ?? null,
      failureUntil: record.failureUntil ?? null,
    }).onDuplicateKeyUpdate({
      set: {
        source: record.source,
        payload: JSON.stringify(record.data),
        freshUntil: record.freshUntil,
        staleUntil: record.staleUntil,
        lastAttemptDay: record.lastAttemptDay ?? null,
        failureUntil: record.failureUntil ?? null,
      },
    });
    return true;
  } catch (error) {
    console.warn("[DurableCache] Write failed:", describeError(error));
    return false;
  }
}

export async function updateDurableCacheMetadata(cacheKey: string, metadata: Pick<DurableCacheRecord, "lastAttemptDay" | "failureUntil">) {
  if (!cacheKey) return false;
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(apiResponseCache)
      .set({
        ...(metadata.lastAttemptDay !== undefined ? { lastAttemptDay: metadata.lastAttemptDay } : {}),
        ...(metadata.failureUntil !== undefined ? { failureUntil: metadata.failureUntil } : {}),
      })
      .where(eq(apiResponseCache.cacheKey, cacheKey));
    return true;
  } catch (error) {
    console.warn("[DurableCache] Metadata update failed:", describeError(error));
    return false;
  }
}

export async function __resetDurableCacheForTests() {
  // Test callers should use a unique cache key. This helper intentionally does
  // not delete production rows because cache data is shared application state.
}
