import { and, eq, sql } from "drizzle-orm";
import { apiCacheTelemetry } from "../drizzle/schema";
import { getDb } from "./db";

export const CACHE_OUTCOMES = ["durable-hit", "stale-hit", "upstream-miss"] as const;
export type CacheOutcome = typeof CACHE_OUTCOMES[number];

type ProviderCounterMap = Record<string, Record<CacheOutcome, number>>;
const memoryCounters: Record<string, ProviderCounterMap> = {};
const writeInFlight = new Map<string, Promise<unknown>>();

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function outcomeBucket(provider: string, day: string) {
  memoryCounters[day] ||= {};
  memoryCounters[day][provider] ||= {
    "durable-hit": 0,
    "stale-hit": 0,
    "upstream-miss": 0,
  };
  return memoryCounters[day][provider];
}

export function recordCacheOutcome(provider: string, outcome: CacheOutcome, now = Date.now()) {
  if (!provider || !CACHE_OUTCOMES.includes(outcome)) return;
  const day = utcDay(now);
  const bucket = outcomeBucket(provider, day);
  bucket[outcome] += 1;
  if (process.env.VITEST || !process.env.DATABASE_URL) return;

  const telemetryKey = `${provider}:${outcome}:${day}`;
  if (writeInFlight.has(telemetryKey)) return;
  const request = (async () => {
    const db = await getDb();
    if (!db) return;
    await db.insert(apiCacheTelemetry).values({
      telemetryKey,
      provider,
      outcome,
      day,
      count: 1,
    }).onDuplicateKeyUpdate({
      set: { count: sql`${apiCacheTelemetry.count} + 1` },
    });
  })().catch(error => {
    console.warn("[CacheHealth] telemetry write failed:", error instanceof Error ? error.message : String(error));
  });
  writeInFlight.set(telemetryKey, request);
  void request.finally(() => {
    if (writeInFlight.get(telemetryKey) === request) writeInFlight.delete(telemetryKey);
  });
}

export async function readCacheHealth(now = Date.now()) {
  const day = utcDay(now);
  const result: ProviderCounterMap = {};
  const db = process.env.VITEST ? null : await getDb();
  if (db) {
    try {
      const rows = await db.select().from(apiCacheTelemetry).where(eq(apiCacheTelemetry.day, day));
      for (const row of rows) {
        const bucket = outcomeBucket(row.provider, day);
        bucket[row.outcome as CacheOutcome] = Number(row.count) || 0;
      }
    } catch (error) {
      console.warn("[CacheHealth] telemetry read failed:", error instanceof Error ? error.message : String(error));
    }
  }
  for (const [provider, bucket] of Object.entries(memoryCounters[day] || {})) {
    result[provider] = {
      "durable-hit": bucket["durable-hit"] || 0,
      "stale-hit": bucket["stale-hit"] || 0,
      "upstream-miss": bucket["upstream-miss"] || 0,
    };
  }
  return { day, providers: result };
}

export function __resetCacheHealthForTests() {
  for (const day of Object.keys(memoryCounters)) delete memoryCounters[day];
  writeInFlight.clear();
}
