/**
 * End-to-end test of /api/mlb-warehouse against a REAL MySQL/MariaDB server:
 * handler -> getDb -> queries -> SQL. Skipped unless MLB_TEST_DATABASE_URL is
 * set. It does not TRUNCATE (it uses its own game id), but the other
 * *.integration.test.ts files do, so run DB-gated suites with
 * `--no-file-parallelism` to avoid them wiping each other's rows.
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ingestGame } from "../mlb-warehouse/ingest.js";
import { parseGameFeed } from "../mlb-warehouse/parse.js";
import { createDrizzleWarehouseStore } from "../mlb-warehouse/store.js";

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
const PK = 930001;
const feed = () => {
  const f = structuredClone(fixture);
  f.gamePk = PK;
  f.gameData.game.pk = PK;
  return f;
};

async function get(handler: any, query: Record<string, string>) {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  await handler({ method: "GET", query, headers: {} }, res);
  return { code: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

suite("/api/mlb-warehouse (real database)", () => {
  const expected = parseGameFeed(feed());
  let pool: mysql.Pool;
  let handler: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    pool = mysql.createPool({ uri: url!, connectionLimit: 2 });
    const store = createDrizzleWarehouseStore(drizzle(pool));
    await store.registerGames([
      {
        gamePk: PK,
        season: expected.game.season,
        officialDate: expected.game.officialDate,
      },
    ]);
    const r = await ingestGame(PK, {
      store,
      fetchJson: async () => feed(),
      now: () => new Date(),
    });
    expect(r.ok).toBe(true);
    handler = (await import("./mlb-warehouse.js")).default;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serves the ingested game and its pitches", async () => {
    const { code, body } = await get(handler, {
      view: "game",
      game: String(PK),
      pageSize: "5",
    });
    expect(code).toBe(200);
    expect(body.game.gamePk).toBe(PK);
    expect(body.pitches).toHaveLength(Math.min(5, expected.pitches.length));
  });

  it("404s an unknown game", async () => {
    expect((await get(handler, { view: "game", game: "1" })).code).toBe(404);
  });

  it("serves a pitcher arsenal whose totals match the rows in the database", async () => {
    const pitcherId = expected.pitches[0].pitcherId;
    const season = expected.game.season;
    const { code, body } = await get(handler, {
      view: "arsenal",
      player: String(pitcherId),
      season: String(season),
    });
    expect(code).toBe(200);
    // Count straight from the table rather than the fixture: other DB-gated
    // suites leave their own copy of the same fixture game behind.
    const [rows] = (await pool.query(
      "select count(*) as n from mlb_pitches where pitcher_id = ? and season = ? and skip_pitch_type is not null",
      [pitcherId, season]
    )) as any;
    const total = body.arsenal.reduce((n: number, a: any) => n + a.pitches, 0);
    expect(total).toBe(Number(rows[0].n));
    // pfx averages ride along so panels can compare like with like against Savant.
    expect(body.arsenal.some((a: any) => typeof a.avgPfxX === "number")).toBe(
      true
    );
    expect(body.arsenal.some((a: any) => typeof a.avgPfxZ === "number")).toBe(
      true
    );
    expect(total).toBeGreaterThanOrEqual(
      expected.pitches.filter(
        p => p.pitcherId === pitcherId && p.skipPitchType != null
      ).length
    );
  });

  it("serves team games from either side and ingestion status", async () => {
    const { homeTeamId, season } = expected.game;
    const games = await get(handler, {
      view: "team-games",
      team: String(homeTeamId),
      season: String(season),
    });
    expect(games.body.games.map((g: any) => g.gamePk)).toContain(PK);
    const status = await get(handler, {
      view: "status",
      season: String(season),
    });
    expect(status.code).toBe(200);
    expect(status.body.status.complete).toBeGreaterThanOrEqual(1);
  });
});
