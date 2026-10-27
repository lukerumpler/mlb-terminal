/**
 * Real-database test for the snapshot upsert. Skipped unless
 * MLB_TEST_DATABASE_URL is set; the target must already have migration 0007
 * applied and its mlb_season_stat_snapshots table is TRUNCATED.
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mlbSeasonStatSnapshots } from "../../drizzle/schema.js";
import { runSnapshot } from "./seasonStats.js";
import { createDrizzleSeasonStatStore } from "./seasonStatsStore.js";

const url = process.env.MLB_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const D1 = new Date("2026-10-25T15:00:00Z");
const D2 = new Date("2026-10-26T15:00:00Z");

const feed = (hits: number) => async (u: string) => {
  const group = new URL(u).searchParams.get("group");
  const splits =
    group === "hitting"
      ? [
          {
            player: { id: 1 },
            team: { id: 147 },
            stat: { hits, hitByPitch: 0, avg: ".281" },
          },
        ]
      : [
          {
            player: { id: 2 },
            team: { id: 111 },
            stat: {
              wins: hits === 100 ? 0 : hits === 103 ? 1 : 2,
              inningsPitched: "10.1",
            },
          },
        ];
  return {
    stats: [
      { splits: splits.slice(Number(new URL(u).searchParams.get("offset"))) },
    ],
  };
};

suite("season-stat snapshot store (real database)", () => {
  let conn: mysql.Connection;
  let db: ReturnType<typeof drizzle>;
  beforeAll(async () => {
    conn = await mysql.createConnection(url!);
    db = drizzle(conn);
  });
  afterAll(async () => conn?.end());
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE mlb_season_stat_snapshots`);
  });

  it("inserts, replaces same-day, and adds a row the next day", async () => {
    const store = createDrizzleSeasonStatStore(db);
    const r1 = await runSnapshot(
      { season: 2026, now: D1 },
      { fetchJson: feed(100), store }
    );
    expect(r1.groups.map(g => g.inserted)).toEqual([1, 1]);
    const r2 = await runSnapshot(
      { season: 2026, now: D1 },
      { fetchJson: feed(103), store }
    );
    expect(r2.groups.map(g => [g.inserted, g.updated])).toEqual([
      [0, 1],
      [0, 1],
    ]);
    await runSnapshot(
      { season: 2026, now: D2 },
      { fetchJson: feed(104), store }
    );
    const rows = await db.select().from(mlbSeasonStatSnapshots);
    expect(rows).toHaveLength(4);
    const h = rows
      .filter(r => r.statGroup === "hitting")
      .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    expect(h.map(r => r.hits)).toEqual([103, 104]);
    expect(h[0].hitByPitch).toBe(0); // true zero survives the round trip
    expect(h[0].sacFlies).toBeNull();
  });
});
