import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
const queries = {
  getIngestionStatus: vi.fn(),
  getPlayerArsenal: vi.fn(),
  getPlayerPitches: vi.fn(),
  getGame: vi.fn(),
  getGamePitches: vi.fn(),
  getTeamGames: vi.fn(),
};
vi.mock("../db.ts", () => ({ getDb: () => getDb() }));
vi.mock("../mlb-warehouse/queries.ts", () => ({
  createMlbWarehouseQueries: () => queries,
}));

// @ts-expect-error JavaScript handler has no separate declaration file.
import handler from "./mlb-warehouse.js";

function call(query: Record<string, unknown>, method = "GET") {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  return handler({ method, query, headers: {} }, res).then(() => res);
}
const body = (res: any) => res.json.mock.calls[0][0];
const code = (res: any) => res.status.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockResolvedValue({});
});

describe("/api/mlb-warehouse", () => {
  it("returns a clean 503 'unavailable' when no database is configured", async () => {
    getDb.mockResolvedValue(null);
    const res = await call({ view: "status", season: "2026" });
    expect(code(res)).toBe(503);
    expect(body(res)).toMatchObject({
      available: false,
      reason: "database-not-configured",
    });
    expect(queries.getIngestionStatus).not.toHaveBeenCalled();
  });

  it("returns 503 (not 500) when the query fails, e.g. migration not applied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queries.getIngestionStatus.mockRejectedValue(
      new Error("Table mlb_games doesn't exist")
    );
    const res = await call({ view: "status", season: "2026" });
    expect(code(res)).toBe(503);
    expect(body(res).reason).toBe("warehouse-query-failed");
  });

  it("returns 503 when the database layer fails to initialize", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDb.mockRejectedValue(new Error("driver exploded"));
    const res = await call({ view: "status", season: "2026" });
    expect(code(res)).toBe(503);
    expect(body(res).reason).toBe("warehouse-init-failed");
  });

  it("rejects bad input before touching the database", async () => {
    const bad: Record<string, unknown>[] = [
      {},
      { view: "drop-tables" },
      { view: "arsenal", season: "2026" },
      { view: "arsenal", player: "abc", season: "2026" },
      { view: "arsenal", player: "-5", season: "2026" },
      { view: "arsenal", player: "1e3", season: "2026" },
      { view: "arsenal", player: "123", season: "1800" },
      { view: "arsenal", player: ["1", "2"], season: "2026" },
      { view: "pitches", player: "1", season: "2026", from: "yesterday" },
      { view: "pitches", player: "1", season: "2026", to: "2026-02-31x" },
      { view: "pitches", player: "1", season: "2026", pageSize: "9999" },
      { view: "game", game: "0" },
    ];
    for (const query of bad) {
      const res = await call(query);
      expect(code(res), JSON.stringify(query)).toBe(400);
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects non-GET and answers OPTIONS", async () => {
    expect(code(await call({ view: "status", season: "2026" }, "POST"))).toBe(
      405
    );
    expect(code(await call({}, "OPTIONS"))).toBe(204);
  });

  it("serves ingestion status", async () => {
    queries.getIngestionStatus.mockResolvedValue({
      pending: 1,
      processing: 0,
      complete: 9,
      failed: 2,
    });
    const res = await call({ view: "status", season: "2026" });
    expect(code(res)).toBe(200);
    expect(body(res)).toMatchObject({
      available: true,
      view: "status",
      season: 2026,
      status: { complete: 9, failed: 2 },
    });
    expect(queries.getIngestionStatus).toHaveBeenCalledWith(2026);
  });

  it("serves a pitcher arsenal and flags the horizontal-break caveat", async () => {
    queries.getPlayerArsenal.mockResolvedValue([
      { pitchType: "Four-Seam Fastball", pitches: 10 },
    ]);
    const res = await call({
      view: "arsenal",
      player: "476454",
      season: "2026",
    });
    expect(code(res)).toBe(200);
    expect(queries.getPlayerArsenal).toHaveBeenCalledWith(476454, 2026);
    expect(body(res).arsenal).toHaveLength(1);
    expect(body(res).fieldNotes.avgHB).toMatch(/do not mix/);
    expect(body(res).fieldNotes.avgPfxX).toMatch(/unconfirmed/);
  });

  it("passes date window and paging through for player pitches", async () => {
    queries.getPlayerPitches.mockResolvedValue({
      page: 2,
      pageSize: 25,
      pitches: [],
    });
    const res = await call({
      view: "pitches",
      player: "5",
      season: "2026",
      from: "2026-04-01",
      to: "2026-04-30",
      page: "2",
      pageSize: "25",
    });
    expect(code(res)).toBe(200);
    expect(queries.getPlayerPitches).toHaveBeenCalledWith(5, 2026, {
      from: "2026-04-01",
      to: "2026-04-30",
      page: 2,
      pageSize: 25,
    });
  });

  it("returns 404 for an unknown game and the game plus pitches for a known one", async () => {
    queries.getGame.mockResolvedValueOnce(null);
    expect(code(await call({ view: "game", game: "1" }))).toBe(404);
    expect(queries.getGamePitches).not.toHaveBeenCalled();

    queries.getGame.mockResolvedValueOnce({ gamePk: 631220 });
    queries.getGamePitches.mockResolvedValue({
      page: 1,
      pageSize: 50,
      pitches: [{}],
    });
    const res = await call({ view: "game", game: "631220" });
    expect(code(res)).toBe(200);
    expect(body(res).game.gamePk).toBe(631220);
    expect(body(res).pitches).toHaveLength(1);
  });

  it("serves team games", async () => {
    queries.getTeamGames.mockResolvedValue([{ gamePk: 1 }]);
    const res = await call({
      view: "team-games",
      team: "147",
      season: "2026",
      limit: "10",
    });
    expect(code(res)).toBe(200);
    expect(queries.getTeamGames).toHaveBeenCalledWith(147, 2026, 10);
  });
});
