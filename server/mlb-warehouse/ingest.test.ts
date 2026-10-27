import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMlbFetcher,
  discoverSeasonGames,
  ingestGame,
  isValidSeason,
  liveFeedUrl,
  runIngestion,
  STALE_PROCESSING_MS,
} from "./ingest.js";
import type {
  DiscoveredGame,
  StatusSummary,
  WarehouseStore,
  WorkItem,
} from "./ingest.js";
import type { ParsedGame } from "./parse.js";

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

/** In-memory store honouring the same contract as the Drizzle implementation. */
function memoryStore() {
  type State = {
    gamePk: number;
    season: number;
    officialDate: string;
    status: "pending" | "processing" | "complete" | "failed";
    attemptCount: number;
    lastAttemptAt: Date | null;
    error: string | null;
  };
  const states = new Map<number, State>();
  const games = new Map<number, ParsedGame["game"]>();
  const pitches = new Map<number, ParsedGame["pitches"]>();
  const store: WarehouseStore = {
    async registerGames(list: DiscoveredGame[]) {
      for (const g of list) {
        if (!states.has(g.gamePk)) {
          states.set(g.gamePk, {
            ...g,
            status: "pending",
            attemptCount: 0,
            lastAttemptAt: null,
            error: null,
          });
        }
      }
    },
    async listWork({
      season,
      maxAttempts,
      staleBefore,
      limit,
    }): Promise<WorkItem[]> {
      return Array.from(states.values())
        .filter(
          s =>
            s.season === season &&
            (s.status === "pending" ||
              (s.status === "failed" && s.attemptCount < maxAttempts) ||
              (s.status === "processing" &&
                (!s.lastAttemptAt || s.lastAttemptAt < staleBefore)))
        )
        .sort(
          (a, b) =>
            a.officialDate.localeCompare(b.officialDate) || a.gamePk - b.gamePk
        )
        .slice(0, limit)
        .map(s => ({ gamePk: s.gamePk, attemptCount: s.attemptCount }));
    },
    async requeueComplete({ season, sinceDate }) {
      let n = 0;
      for (const s of Array.from(states.values())) {
        if (
          s.season === season &&
          s.status === "complete" &&
          s.officialDate >= sinceDate
        ) {
          s.status = "pending";
          n++;
        }
      }
      return n;
    },
    async requeueFailed({ season }) {
      let n = 0;
      for (const s of Array.from(states.values())) {
        if (s.season === season && s.status === "failed") {
          s.status = "pending";
          s.attemptCount = 0;
          n++;
        }
      }
      return n;
    },
    async markProcessing(gamePk, now, claim) {
      const s = states.get(gamePk)!;
      const staleBefore =
        claim?.staleBefore ?? new Date(now.getTime() - STALE_PROCESSING_MS);
      const eligible =
        s.status === "pending" ||
        (s.status === "failed" &&
          (claim?.maxAttempts === undefined ||
            s.attemptCount < claim.maxAttempts)) ||
        (s.status === "processing" &&
          (!s.lastAttemptAt || s.lastAttemptAt < staleBefore));
      if (!eligible) return false;
      s.status = "processing";
      s.attemptCount++;
      s.lastAttemptAt = now;
      return true;
    },
    async saveGame(parsed) {
      games.set(parsed.game.gamePk, parsed.game);
      pitches.set(parsed.game.gamePk, parsed.pitches); // replace, never append
      const s = states.get(parsed.game.gamePk)!;
      s.status = "complete";
      s.error = null;
    },
    async markFailed(gamePk, error) {
      const s = states.get(gamePk)!;
      s.status = "failed";
      s.error = error;
    },
    async summary(season): Promise<StatusSummary> {
      const out: StatusSummary = {
        pending: 0,
        processing: 0,
        complete: 0,
        failed: 0,
      };
      for (const s of Array.from(states.values()))
        if (s.season === season) out[s.status]++;
      return out;
    },
  };
  return { store, states, games, pitches };
}

const SEASON = 2026;
const finalGame = (gamePk: number, officialDate: string) => ({
  gamePk,
  officialDate,
  status: { codedGameState: "F", detailedState: "Final" },
});

/** Routes schedule and feed URLs to canned data; feedFail controls per-game failures. */
function makeFetch(scheduled: any[], feedFail: Set<number> = new Set()) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    const feedMatch = url.match(/\/game\/(\d+)\/feed\/live/);
    if (feedMatch) {
      const pk = Number(feedMatch[1]);
      if (feedFail.has(pk)) throw new Error(`MLB API 503 for game ${pk}`);
      return feedFor(pk);
    }
    const start = url.match(/startDate=(\d{4}-\d{2})-01/)![1];
    const games = scheduled.filter(g => g.officialDate.startsWith(start));
    return {
      dates: games.length ? [{ date: games[0].officialDate, games }] : [],
    };
  };
  return { fetchJson, calls };
}

describe("discoverSeasonGames", () => {
  it("keeps final games, skips live/postponed/scheduled ones, and dedupes", async () => {
    const { fetchJson } = makeFetch([
      finalGame(1, "2026-04-01"),
      finalGame(1, "2026-04-01"), // duplicate listing
      finalGame(2, "2026-04-02"),
      {
        gamePk: 3,
        officialDate: "2026-04-03",
        status: { codedGameState: "I", detailedState: "In Progress" },
      },
      {
        gamePk: 4,
        officialDate: "2026-04-04",
        status: { codedGameState: "F", detailedState: "Postponed" },
      },
      {
        gamePk: 5,
        officialDate: "2026-04-05",
        status: { codedGameState: "S", detailedState: "Scheduled" },
      },
    ]);
    const result = await discoverSeasonGames(SEASON, fetchJson);
    expect(result.games.map(g => g.gamePk).sort()).toEqual([1, 2]);
    expect(result.skippedNotFinal).toBe(3);
  });
});

describe("runIngestion", () => {
  const schedule = () => [
    finalGame(101, "2026-04-01"),
    finalGame(102, "2026-04-02"),
    finalGame(103, "2026-05-10"),
  ];

  it("ingests every discovered final game and reports completion", async () => {
    const mem = memoryStore();
    const { fetchJson } = makeFetch(schedule());
    const report = await runIngestion(
      { season: SEASON },
      { store: mem.store, fetchJson }
    );
    expect(report).toMatchObject({
      discovered: 3,
      attempted: 3,
      succeeded: 3,
      failed: 0,
    });
    expect(report.status.complete).toBe(3);
    expect(mem.pitches.get(101)).toHaveLength(32);
  });

  it("is resumable: a failed game is retried alone, completed games are not refetched", async () => {
    const mem = memoryStore();
    const first = makeFetch(schedule(), new Set([102]));
    const r1 = await runIngestion(
      { season: SEASON },
      { store: mem.store, fetchJson: first.fetchJson }
    );
    expect(r1).toMatchObject({ succeeded: 2, failed: 1 });
    expect(r1.failures[0]).toMatchObject({ gamePk: 102 });
    expect(r1.status).toMatchObject({ complete: 2, failed: 1 });

    const second = makeFetch(schedule());
    const r2 = await runIngestion(
      { season: SEASON },
      { store: mem.store, fetchJson: second.fetchJson }
    );
    expect(r2).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    const feedCalls = second.calls.filter(u => u.includes("/feed/live"));
    expect(feedCalls).toEqual([liveFeedUrl(102)]);
    expect(r2.status.complete).toBe(3);
  });

  it("stops retrying a game after maxAttempts", async () => {
    const mem = memoryStore();
    const failing = new Set([102]);
    for (let i = 0; i < 2; i++) {
      const { fetchJson } = makeFetch(schedule(), failing);
      await runIngestion(
        { season: SEASON, maxAttempts: 2 },
        { store: mem.store, fetchJson }
      );
    }
    const { fetchJson } = makeFetch(schedule(), failing);
    const r3 = await runIngestion(
      { season: SEASON, maxAttempts: 2 },
      { store: mem.store, fetchJson }
    );
    expect(r3.attempted).toBe(0);
    expect(r3.status.failed).toBe(1);
    expect(mem.states.get(102)!.error).toMatch(/503/);
  });

  it("does not duplicate pitches when a game is re-ingested", async () => {
    const mem = memoryStore();
    const { fetchJson } = makeFetch(schedule());
    await runIngestion({ season: SEASON }, { store: mem.store, fetchJson });
    const now = () => new Date("2026-05-11T12:00:00Z");
    const r = await runIngestion(
      { season: SEASON, refreshRecentDays: 3 },
      { store: mem.store, fetchJson, now }
    );
    expect(r.requeuedForRefresh).toBe(1); // only the 2026-05-10 game is in the window
    expect(mem.pitches.get(103)).toHaveLength(32);
  });

  it("respects the per-run limit so large backfills stay bounded", async () => {
    const mem = memoryStore();
    const { fetchJson } = makeFetch(schedule());
    const r1 = await runIngestion(
      { season: SEASON, limit: 2 },
      { store: mem.store, fetchJson }
    );
    expect(r1.attempted).toBe(2);
    const r2 = await runIngestion(
      { season: SEASON, limit: 2, skipDiscovery: true },
      { store: mem.store, fetchJson }
    );
    expect(r2.attempted).toBe(1);
    expect(r2.status.complete).toBe(3);
  });

  it("fails a game whose feed is not actually final, instead of storing it", async () => {
    const mem = memoryStore();
    const fetchJson = async (url: string) => {
      if (url.includes("/feed/live")) {
        const f = feedFor(101);
        f.gameData.status = {
          codedGameState: "I",
          detailedState: "In Progress",
        };
        return f;
      }
      return {
        dates: [
          {
            date: "2026-04-01",
            games: url.includes("startDate=2026-04")
              ? [finalGame(101, "2026-04-01")]
              : [],
          },
        ],
      };
    };
    const r = await runIngestion(
      { season: SEASON },
      { store: mem.store, fetchJson }
    );
    expect(r.failed).toBe(1);
    expect(r.failures[0].error).toMatch(/not final/);
    expect(mem.games.has(101)).toBe(false);
  });

  it("recovers games stuck in 'processing' after a crash", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    await mem.store.markProcessing(101, new Date("2026-04-01T00:00:00Z")); // died long ago
    const { fetchJson } = makeFetch([]);
    const r = await runIngestion(
      { season: SEASON, skipDiscovery: true },
      {
        store: mem.store,
        fetchJson,
        now: () => new Date("2026-04-02T00:00:00Z"),
      }
    );
    expect(r).toMatchObject({ attempted: 1, succeeded: 1 });
  });
});

describe("failure isolation", () => {
  it("ingestGame never throws, even when the store itself is failing", async () => {
    const mem = memoryStore();
    const store = {
      ...mem.store,
      markProcessing: async () => {
        throw new Error("connection reset");
      },
    };
    const { fetchJson } = makeFetch([]);
    const r = await ingestGame(101, {
      store,
      fetchJson,
      now: () => new Date(),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/connection reset/);
  });

  it("a failed schedule month does not block working the existing queue", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    const fetchJson = async (url: string) => {
      if (url.includes("/schedule?")) {
        if (url.includes("startDate=2026-07"))
          throw new Error("MLB API 500 for schedule");
        return { dates: [] };
      }
      return feedFor(Number(url.match(/game\/(\d+)\/feed/)![1]));
    };
    const r = await runIngestion(
      { season: SEASON },
      { store: mem.store, fetchJson }
    );
    expect(r.succeeded).toBe(1);
    expect(r.discoveryErrors).toHaveLength(1);
    expect(r.discoveryErrors[0]).toMatch(/2026-07/);
  });

  it("one game's unexpected crash does not abort the other games in the run", async () => {
    const mem = memoryStore();
    const flaky = {
      ...mem.store,
      saveGame: async (parsed: ParsedGame, now: Date) => {
        if (parsed.game.gamePk === 102) throw new Error("deadlock found");
        return mem.store.saveGame(parsed, now);
      },
    };
    const { fetchJson } = makeFetch([
      finalGame(101, "2026-04-01"),
      finalGame(102, "2026-04-02"),
      finalGame(103, "2026-04-03"),
    ]);
    const r = await runIngestion(
      { season: SEASON },
      { store: flaky, fetchJson }
    );
    expect(r).toMatchObject({ attempted: 3, succeeded: 2, failed: 1 });
  });
});

describe("requeueFailed", () => {
  it("lets a game that exhausted its attempts be retried on the next run", async () => {
    const mem = memoryStore();
    const failing = new Set([102]);
    const schedule = [finalGame(102, "2026-04-02")];
    for (let i = 0; i < 2; i++) {
      const { fetchJson } = makeFetch(schedule, failing);
      await runIngestion(
        { season: SEASON, maxAttempts: 2 },
        { store: mem.store, fetchJson }
      );
    }
    const stuck = makeFetch(schedule);
    expect(
      (
        await runIngestion(
          { season: SEASON, maxAttempts: 2 },
          { store: mem.store, fetchJson: stuck.fetchJson }
        )
      ).attempted
    ).toBe(0);

    expect(await mem.store.requeueFailed({ season: SEASON })).toBe(1);
    const retry = makeFetch(schedule);
    const r = await runIngestion(
      { season: SEASON, maxAttempts: 2 },
      { store: mem.store, fetchJson: retry.fetchJson }
    );
    expect(r).toMatchObject({ attempted: 1, succeeded: 1 });
  });
});

describe("createMlbFetcher", () => {
  const res = (status: number, body: unknown = {}) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response;
  const noSleep = async () => {};

  it("retries transient 5xx and 429 responses, then succeeds", async () => {
    const responses = [res(503), res(429), res(200, { ok: true })];
    const fetchImpl = async () => responses.shift()!;
    const get = createMlbFetcher({
      fetchImpl: fetchImpl as any,
      sleep: noSleep,
    });
    await expect(get("https://x/y")).resolves.toEqual({ ok: true });
    expect(responses).toHaveLength(0);
  });

  it("retries network errors (fetch rejecting)", async () => {
    let n = 0;
    const fetchImpl = async () => {
      if (n++ < 2) throw new TypeError("fetch failed");
      return res(200, { ok: 1 });
    };
    const get = createMlbFetcher({
      fetchImpl: fetchImpl as any,
      sleep: noSleep,
    });
    await expect(get("https://x/y")).resolves.toEqual({ ok: 1 });
    expect(n).toBe(3);
  });

  it("does not retry a 404 - that is a real answer, not a blip", async () => {
    let n = 0;
    const fetchImpl = async () => (n++, res(404));
    const get = createMlbFetcher({
      fetchImpl: fetchImpl as any,
      sleep: noSleep,
    });
    await expect(get("https://x/y")).rejects.toThrow(/404/);
    expect(n).toBe(1);
  });

  it("gives up after the configured number of attempts", async () => {
    let n = 0;
    const fetchImpl = async () => (n++, res(503));
    const get = createMlbFetcher({
      fetchImpl: fetchImpl as any,
      sleep: noSleep,
      attempts: 3,
    });
    await expect(get("https://x/y")).rejects.toThrow(/503/);
    expect(n).toBe(3);
  });

  it("honours Retry-After on 429", async () => {
    const waits: number[] = [];
    const limited = {
      ok: false,
      status: 429,
      headers: {
        get: (h: string) => (h.toLowerCase() === "retry-after" ? "2" : null),
      },
      json: async () => ({}),
    };
    const responses: any[] = [limited, res(200, { ok: true })];
    const get = createMlbFetcher({
      fetchImpl: (async () => responses.shift()) as any,
      sleep: async ms => void waits.push(ms),
    });
    await get("https://x/y");
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
  });
});

describe("concurrent claims", () => {
  const T0 = new Date("2026-04-02T00:00:00Z");

  it("only one of two racing workers claims a game", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    const claims = await Promise.all([
      mem.store.markProcessing(101, T0),
      mem.store.markProcessing(101, T0),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("a worker that loses the claim skips: no fetch, no store write, no failure", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    await mem.store.markProcessing(101, T0); // another worker owns it
    const { fetchJson, calls } = makeFetch([]);
    const r = await ingestGame(101, {
      store: mem.store,
      fetchJson,
      now: () => T0,
    });
    expect(r).toMatchObject({ ok: true, skipped: true });
    expect(calls).toHaveLength(0);
    expect(mem.games.has(101)).toBe(false);
    expect((await mem.store.summary(SEASON)).processing).toBe(1);
  });

  it("does not steal a live claim but does take over a stale one", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    await mem.store.markProcessing(101, T0);
    const later = new Date(T0.getTime() + 60_000);
    expect(await mem.store.markProcessing(101, later)).toBe(false);
    const muchLater = new Date(T0.getTime() + STALE_PROCESSING_MS + 1);
    expect(await mem.store.markProcessing(101, muchLater)).toBe(true);
  });

  it("respects the attempt cap when claiming a failed game", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    await mem.store.markProcessing(101, T0);
    await mem.store.markFailed(101, "boom", T0);
    expect(await mem.store.markProcessing(101, T0, { maxAttempts: 1 })).toBe(
      false
    );
    expect(await mem.store.markProcessing(101, T0, { maxAttempts: 2 })).toBe(
      true
    );
  });

  it("a store error before the claim does not mark the game failed", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
    ]);
    let markedFailed = false;
    const store = {
      ...mem.store,
      markProcessing: async () => {
        throw new Error("connection reset");
      },
      markFailed: async () => {
        markedFailed = true;
      },
    };
    const { fetchJson } = makeFetch([]);
    const r = await ingestGame(101, { store, fetchJson, now: () => T0 });
    expect(r.ok).toBe(false);
    expect(markedFailed).toBe(false);
  });

  it("run report counts skipped games separately", async () => {
    const mem = memoryStore();
    await mem.store.registerGames([
      { gamePk: 101, season: SEASON, officialDate: "2026-04-01" },
      { gamePk: 102, season: SEASON, officialDate: "2026-04-01" },
    ]);
    // Another worker grabs 101 between listWork and our claim.
    const store = {
      ...mem.store,
      listWork: async (o: any) => {
        const w = await mem.store.listWork(o);
        await mem.store.markProcessing(101, T0);
        return w;
      },
    };
    const { fetchJson } = makeFetch([]);
    const r = await runIngestion(
      { season: SEASON, skipDiscovery: true, concurrency: 1 },
      { store, fetchJson, now: () => T0 }
    );
    expect(r).toMatchObject({
      skipped: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
  });
});

describe("isValidSeason", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  it("accepts real seasons, including next year for early schedules", () => {
    for (const y of [1876, 2020, 2026, 2027])
      expect(isValidSeason(y, now)).toBe(true);
  });
  it("rejects nonsense before it reaches the MLB API", () => {
    for (const y of [0, -1, 1875, 2028, 99999, 2026.5, NaN])
      expect(isValidSeason(y, now)).toBe(false);
  });
});
