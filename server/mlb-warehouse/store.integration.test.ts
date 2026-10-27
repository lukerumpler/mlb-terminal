/**
 * Integration tests for the Drizzle store against a REAL MySQL/MariaDB server.
 * The unit tests use an in-memory store; this file is what proves the actual
 * SQL (upserts, transactions, locking) behaves.
 *
 * Skipped unless MLB_TEST_DATABASE_URL is set, e.g.
 *   MLB_TEST_DATABASE_URL=mysql://skip:skip@127.0.0.1:3306/skip pnpm test server/mlb-warehouse/store.integration
 * The target database must already have migration 0005 applied. Its mlb_*
 * tables are TRUNCATED by these tests - never point this at real data.
 */
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  mlbGames,
  mlbIngestionState,
  mlbPitches,
  mlbPlateAppearances,
  mlbPlayers,
} from "../../drizzle/schema.js";
import { ingestGame, runIngestion } from "./ingest.js";
import { parseGameFeed } from "./parse.js";
import { createDrizzleWarehouseStore } from "./store.js";

const url = process.env.MLB_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../test/fixtures/mlb-gumbo-sample.json"
    ),
    "utf8"
  )
);

const feedFor = (gamePk: number) => {
  const f = structuredClone(fixture);
  f.gamePk = gamePk;
  f.gameData.game.pk = gamePk;
  return f;
};

/** Deterministic Fisher-Yates so a failing shuffle is reproducible. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

suite("Drizzle warehouse store (real database)", () => {
  let pool: mysql.Pool;
  let db: ReturnType<typeof drizzle>;
  let store: ReturnType<typeof createDrizzleWarehouseStore>;

  beforeAll(() => {
    pool = mysql.createPool({ uri: url!, connectionLimit: 16 });
    db = drizzle(pool);
    store = createDrizzleWarehouseStore(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    for (const t of [
      "mlb_pitches",
      "mlb_plate_appearances",
      "mlb_players",
      "mlb_games",
      "mlb_ingestion_state",
    ]) {
      await pool.query(`TRUNCATE TABLE ${t}`);
    }
  });

  const ok = (pk: number) => (u: string) =>
    u.includes(`/game/${pk}/feed/live`)
      ? Promise.resolve(feedFor(pk))
      : Promise.reject(new Error(`unexpected url ${u}`));

  it("round-trips a game and re-ingesting replaces rather than duplicates", async () => {
    const expected = parseGameFeed(feedFor(900001));
    await store.registerGames([
      { gamePk: 900001, season: 2026, officialDate: "2026-06-01" },
    ]);

    const first = await ingestGame(900001, {
      store,
      fetchJson: ok(900001),
      now: () => new Date(),
    });
    expect(first.ok).toBe(true);

    const count = async () =>
      Number(
        (
          await db
            .select({ n: sql<number>`count(*)` })
            .from(mlbPitches)
            .where(eq(mlbPitches.gamePk, 900001))
        )[0].n
      );
    expect(await count()).toBe(expected.pitches.length);

    await store.requeueComplete({ season: 2026, sinceDate: "2026-01-01" });
    const second = await ingestGame(900001, {
      store,
      fetchJson: ok(900001),
      now: () => new Date(),
    });
    expect(second.ok).toBe(true);
    expect(await count()).toBe(expected.pitches.length);

    const [state] = await db
      .select()
      .from(mlbIngestionState)
      .where(eq(mlbIngestionState.gamePk, 900001));
    expect(state.status).toBe("complete");
    expect(state.pitchCount).toBe(expected.pitches.length);
    expect(state.error).toBeNull();
  });

  it("keeps a previously refreshed game retryable after it later fails", async () => {
    // A game that is refreshed repeatedly (recent-games correction window)
    // must not exhaust its retry budget just by succeeding.
    await store.registerGames([
      { gamePk: 900002, season: 2026, officialDate: "2026-06-01" },
    ]);
    const deps = { store, fetchJson: ok(900002), now: () => new Date() };
    for (let i = 0; i < 6; i++) {
      expect((await ingestGame(900002, deps)).ok).toBe(true);
      await store.requeueComplete({ season: 2026, sinceDate: "2026-01-01" });
    }

    const failing = {
      store,
      fetchJson: () => Promise.reject(new Error("MLB API 503")),
      now: () => new Date(),
    };
    expect((await ingestGame(900002, failing)).ok).toBe(false);

    const work = await store.listWork({
      season: 2026,
      maxAttempts: 5,
      staleBefore: new Date(Date.now() - 30 * 60_000),
      limit: 10,
    });
    expect(work.map(w => w.gamePk)).toContain(900002);
  });

  it("requeueFailed makes exhausted games workable again, and only those", async () => {
    await store.registerGames([
      { gamePk: 900010, season: 2026, officialDate: "2026-06-01" },
      { gamePk: 900011, season: 2026, officialDate: "2026-06-01" },
      { gamePk: 900012, season: 2025, officialDate: "2025-06-01" },
    ]);
    const boom = {
      store,
      fetchJson: () => Promise.reject(new Error("MLB API 503")),
      now: () => new Date(),
    };
    for (const pk of [900010, 900012])
      for (let i = 0; i < 5; i++) await ingestGame(pk, boom);
    const work = () =>
      store
        .listWork({
          season: 2026,
          maxAttempts: 5,
          staleBefore: new Date(Date.now() - 1800_000),
          limit: 10,
        })
        .then(w => w.map(x => x.gamePk));
    expect(await work()).toEqual([900011]); // 900010 exhausted its attempts

    expect(await store.requeueFailed({ season: 2026 })).toBe(1); // not the 2025 game
    expect((await work()).sort()).toEqual([900010, 900011]);
    const [other] = await db
      .select()
      .from(mlbIngestionState)
      .where(eq(mlbIngestionState.gamePk, 900012));
    expect(other.status).toBe("failed");
  });

  it("markProcessing is an atomic claim: exactly one of many racing workers wins", async () => {
    await store.registerGames([
      { gamePk: 900020, season: 2026, officialDate: "2026-06-01" },
    ]);
    const now = new Date();
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => store.markProcessing(900020, now))
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const [row] = await db
      .select()
      .from(mlbIngestionState)
      .where(eq(mlbIngestionState.gamePk, 900020));
    expect(row.status).toBe("processing");
    expect(row.attemptCount).toBe(1); // the losers must not bump attempts
  });

  it("two concurrent runs ingest each game once and report the overlap as skipped", async () => {
    const pks = [900030, 900031, 900032, 900033, 900034, 900035];
    await store.registerGames(
      pks.map(gamePk => ({ gamePk, season: 2026, officialDate: "2026-06-01" }))
    );
    const fetched: number[] = [];
    const fetchJson = (u: string) => {
      const pk = Number(u.match(/\/game\/(\d+)\/feed/)![1]);
      fetched.push(pk);
      return new Promise<any>(r => setTimeout(() => r(feedFor(pk)), 15));
    };
    const run = () =>
      runIngestion(
        { season: 2026, skipDiscovery: true, concurrency: 3 },
        { store, fetchJson }
      );
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.failed + b.failed).toBe(0);
    expect(a.succeeded + b.succeeded).toBe(pks.length);
    expect(a.skipped + b.skipped).toBeGreaterThan(0);
    expect(fetched.sort()).toEqual(pks); // no game fetched twice
    const [{ n }] = (await pool
      .query("select count(*) as n from mlb_games")
      .then(([r]) => r)) as any[];
    expect(Number(n)).toBe(pks.length);
  });

  it("a later feed missing optional player fields does not erase known ones", async () => {
    const full = parseGameFeed(feedFor(900040));
    const pid = full.players.find(
      p => p.bats && p.throws && p.birthDate
    )!.mlbId;
    await store.registerGames([
      { gamePk: 900040, season: 2026, officialDate: "2026-06-01" },
      { gamePk: 900041, season: 2026, officialDate: "2026-06-01" },
    ]);
    await ingestGame(900040, {
      store,
      fetchJson: ok(900040),
      now: () => new Date(),
    });
    const sparse = feedFor(900041);
    const entry = sparse.gameData.players[`ID${pid}`];
    delete entry.batSide;
    delete entry.pitchHand;
    delete entry.birthDate;
    await ingestGame(900041, {
      store,
      fetchJson: () => Promise.resolve(sparse),
      now: () => new Date(),
    });
    const [row] = await db
      .select()
      .from(mlbPlayers)
      .where(eq(mlbPlayers.mlbId, pid));
    const want = full.players.find(p => p.mlbId === pid)!;
    expect(row.bats).toBe(want.bats);
    expect(row.throws).toBe(want.throws);
    expect(row.birthDate).toBe(want.birthDate);
  });

  it("registerGames keeps status but follows a rescheduled date", async () => {
    await store.registerGames([
      { gamePk: 900050, season: 2026, officialDate: "2026-06-01" },
    ]);
    await ingestGame(900050, {
      store,
      fetchJson: ok(900050),
      now: () => new Date(),
    });
    await store.registerGames([
      { gamePk: 900050, season: 2026, officialDate: "2026-07-15" },
    ]);
    const stateOf = async () =>
      (
        await db
          .select()
          .from(mlbIngestionState)
          .where(eq(mlbIngestionState.gamePk, 900050))
      )[0];
    const afterRegister = await stateOf();
    expect(afterRegister.status).toBe("complete"); // never reset by discovery
    expect(afterRegister.officialDate).toBe("2026-07-15");
  });

  it("saves many overlapping games concurrently without deadlocking", async () => {
    const GAMES = 12;
    const ROUNDS = 4;
    for (let round = 0; round < ROUNDS; round++) {
      const parsed = Array.from({ length: GAMES }, (_, i) => {
        const p = parseGameFeed(feedFor(910000 + round * 100 + i));
        // Real games list overlapping players in different orders.
        return { ...p, players: shuffled(p.players, round * 100 + i + 1) };
      });
      const results = await Promise.allSettled(
        parsed.map(p => store.saveGame(p, new Date()))
      );
      const failures = results.filter(
        r => r.status === "rejected"
      ) as PromiseRejectedResult[];
      expect(
        failures.map(f => String(f.reason?.message ?? f.reason).slice(0, 120))
      ).toEqual([]);
    }
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(mlbGames);
    expect(Number(n)).toBe(GAMES * ROUNDS);
    const players = await db
      .select({ n: sql<number>`count(*)` })
      .from(mlbPlayers);
    expect(Number(players[0].n)).toBe(parseGameFeed(feedFor(1)).players.length);
  });

  it("stores plate appearances with base-out state and replaces them on re-ingest", async () => {
    await store.registerGames([
      { gamePk: 900100, season: 2026, officialDate: "2026-06-01" },
    ]);
    const first = await ingestGame(900100, {
      store,
      fetchJson: ok(900100),
      now: () => new Date(),
    });
    expect(first.ok).toBe(true);

    const readRows = () =>
      db
        .select()
        .from(mlbPlateAppearances)
        .where(eq(mlbPlateAppearances.gamePk, 900100))
        .orderBy(asc(mlbPlateAppearances.atBatIndex));
    const rows = await readRows();
    expect(rows).toHaveLength(8);
    expect(rows.map(r => [r.outsBefore, r.outsAfter])).toEqual(
      parseGameFeed(feedFor(900100)).plateAppearances.map(r => [
        r.outsBefore,
        r.outsAfter,
      ])
    );
    expect(rows[3]).toMatchObject({
      halfInning: "top",
      paEventType: "walk",
      basesBefore: 1,
      basesAfter: 3,
      runsOnPlay: 0,
      earnedRunsOnPlay: 0,
      isComplete: true,
    });
    expect(rows[7]).toMatchObject({ basesAfter: 7, battingTeamId: 147 });

    // A corrected feed with one plate appearance fewer must not leave the old row behind.
    const shorter = feedFor(900100);
    shorter.liveData.plays.allPlays.pop();
    await store.requeueComplete({ season: 2026, sinceDate: "2026-01-01" });
    const second = await ingestGame(900100, {
      store,
      fetchJson: u =>
        u.includes("/game/900100/feed/live")
          ? Promise.resolve(shorter)
          : Promise.reject(new Error(`unexpected url ${u}`)),
      now: () => new Date(),
    });
    expect(second.ok).toBe(true);
    expect(await readRows()).toHaveLength(7);
  });

  it("keeps unknown values as NULL, not 0", async () => {
    await store.registerGames([
      { gamePk: 900101, season: 2026, officialDate: "2026-06-01" },
    ]);
    const feed = feedFor(900101);
    delete feed.liveData.plays.allPlays[2].result.awayScore;
    await ingestGame(900101, {
      store,
      fetchJson: u =>
        u.includes("/game/900101/feed/live")
          ? Promise.resolve(feed)
          : Promise.reject(new Error(`unexpected url ${u}`)),
      now: () => new Date(),
    });
    const [row] = await db
      .select()
      .from(mlbPlateAppearances)
      .where(
        and(
          eq(mlbPlateAppearances.gamePk, 900101),
          eq(mlbPlateAppearances.atBatIndex, 2)
        )
      );
    expect(row.runsOnPlay).toBeNull();
    expect(row.earnedRunsOnPlay).toBeNull();
  });

  it("runIngestion works end to end against the real store", async () => {
    const pks = [920001, 920002, 920003];
    const fetchJson = async (u: string) => {
      if (u.includes("/schedule?")) {
        return u.includes("startDate=2026-06-01")
          ? {
              dates: [
                {
                  date: "2026-06-01",
                  games: pks.map(gamePk => ({
                    gamePk,
                    officialDate: "2026-06-01",
                    status: { codedGameState: "F", detailedState: "Final" },
                  })),
                },
              ],
            }
          : { dates: [] };
      }
      const pk = Number(/game\/(\d+)\/feed/.exec(u)![1]);
      return feedFor(pk);
    };
    const report = await runIngestion(
      { season: 2026, concurrency: 3 },
      { store, fetchJson }
    );
    expect(report.failures).toEqual([]);
    expect(report.succeeded).toBe(3);
    expect(report.status).toMatchObject({ complete: 3, failed: 0, pending: 0 });
  });
});
