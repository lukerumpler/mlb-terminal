/**
 * Integration tests for the read-side queries against a REAL MySQL/MariaDB
 * server. Skipped unless MLB_TEST_DATABASE_URL is set (same contract and same
 * TRUNCATE warning as store.integration.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestGame } from "./ingest.js";
import { parseGameFeed } from "./parse.js";
import { createMlbWarehouseQueries } from "./queries.js";
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

const PK = 920001;

suite("MLB warehouse read queries (real database)", () => {
  let pool: mysql.Pool;
  let q: ReturnType<typeof createMlbWarehouseQueries>;
  const expected = parseGameFeed(feedFor(PK));

  beforeAll(async () => {
    pool = mysql.createPool({ uri: url!, connectionLimit: 4 });
    const db = drizzle(pool);
    const store = createDrizzleWarehouseStore(db);
    q = createMlbWarehouseQueries(db);
    for (const t of [
      "mlb_pitches",
      "mlb_players",
      "mlb_games",
      "mlb_ingestion_state",
    ])
      await pool.query(`TRUNCATE TABLE ${t}`);
    await store.registerGames([
      {
        gamePk: PK,
        season: expected.game.season,
        officialDate: expected.game.officialDate,
      },
      {
        gamePk: PK + 1,
        season: expected.game.season,
        officialDate: expected.game.officialDate,
      },
    ]);
    const r = await ingestGame(PK, {
      store,
      fetchJson: async () => feedFor(PK),
      now: () => new Date(),
    });
    expect(r.ok).toBe(true);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("getGame returns the stored game, and null for an unknown one", async () => {
    expect((await q.getGame(PK))?.gamePk).toBe(PK);
    expect(await q.getGame(1)).toBeNull();
  });

  it("getGamePitches pages without gaps or overlap and clamps page size", async () => {
    const total = expected.pitches.length;
    const p1 = await q.getGamePitches(PK, { page: 1, pageSize: 10 });
    const p2 = await q.getGamePitches(PK, { page: 2, pageSize: 10 });
    const all = await q.getGamePitches(PK, { pageSize: 10_000 });
    expect(p1.pitches).toHaveLength(Math.min(10, total));
    expect(all.pageSize).toBe(250); // clamped
    const key = (p: any) => `${p.atBatIndex}-${p.eventIndex}`;
    expect([...p1.pitches, ...p2.pitches].map(key)).toEqual(
      all.pitches.slice(0, p1.pitches.length + p2.pitches.length).map(key)
    );
    expect(all.pitches).toHaveLength(total);
  });

  it("getPlayerArsenal totals match the stored pitches for that pitcher", async () => {
    const pitcherId = expected.pitches[0].pitcherId;
    const season = expected.game.season;
    const arsenal = await q.getPlayerArsenal(pitcherId, season);
    const classified = expected.pitches.filter(
      p => p.pitcherId === pitcherId && p.skipPitchType != null
    );
    expect(arsenal.reduce((n, a) => n + a.pitches, 0)).toBe(classified.length);
    for (const a of arsenal) expect(typeof a.pitches).toBe("number");
  });

  it("getPlayerPitches filters by date range", async () => {
    const pitcherId = expected.pitches[0].pitcherId;
    const season = expected.game.season;
    const inRange = await q.getPlayerPitches(pitcherId, season, {
      from: expected.game.officialDate,
      to: expected.game.officialDate,
    });
    const outOfRange = await q.getPlayerPitches(pitcherId, season, {
      from: "2099-01-01",
    });
    expect(inRange.pitches.length).toBeGreaterThan(0);
    expect(outOfRange.pitches).toHaveLength(0);
  });

  it("getTeamGames finds the game from either side", async () => {
    const { homeTeamId, awayTeamId, season } = expected.game;
    expect(
      (await q.getTeamGames(homeTeamId, season)).map(g => g.gamePk)
    ).toContain(PK);
    expect(
      (await q.getTeamGames(awayTeamId, season)).map(g => g.gamePk)
    ).toContain(PK);
  });

  it("getIngestionStatus counts every status, including empty ones", async () => {
    const s = await q.getIngestionStatus(expected.game.season);
    expect(s).toEqual({ pending: 1, processing: 0, complete: 1, failed: 0 });
  });
});
