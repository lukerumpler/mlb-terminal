import { describe, expect, it } from "vitest";
import {
  ALL_TEAMS,
  inningsToOuts,
  normalizeSplit,
  runSnapshot,
  snapshotKey,
  toInt,
  toRate,
} from "./seasonStats.js";
import type { SeasonStatSnapshotRow, SeasonStatStore } from "./seasonStats.js";

function memoryStore() {
  const rows = new Map<string, SeasonStatSnapshotRow>();
  const store: SeasonStatStore = {
    async upsertSnapshots(batch) {
      let inserted = 0;
      let updated = 0;
      for (const r of batch) {
        const k = snapshotKey(r);
        rows.has(k) ? updated++ : inserted++;
        rows.set(k, r); // same-day rerun replaces the row
      }
      return { inserted, updated };
    },
  };
  return { rows, store };
}

const split = (
  playerId: number,
  teamId: number | null,
  stat: any,
  numTeams = 1
) => ({
  player: { id: playerId },
  ...(teamId === null ? {} : { team: { id: teamId } }),
  numTeams,
  stat,
});
const page = (splits: any[]) => ({ stats: [{ splits }] });

/** Serves pages by the offset/limit in the URL, per group. */
function feed(data: { hitting?: any[]; pitching?: any[] }) {
  return async (url: string) => {
    const u = new URL(url);
    const group = u.searchParams.get("group") as "hitting" | "pitching";
    const offset = Number(u.searchParams.get("offset"));
    const limit = Number(u.searchParams.get("limit"));
    return page((data[group] ?? []).slice(offset, offset + limit));
  };
}

const DAY1 = new Date("2026-10-25T15:00:00Z");
const DAY2 = new Date("2026-10-26T15:00:00Z");
const hit = (over: any = {}) => ({
  gamesPlayed: 150,
  hits: 100,
  hitByPitch: 0,
  avg: ".281",
  ...over,
});

describe("value normalization", () => {
  it("keeps a real zero and nulls absent values", () => {
    expect(toInt(0)).toBe(0);
    expect(toInt("0")).toBe(0);
    expect(toInt(null)).toBeNull();
    expect(toInt(undefined)).toBeNull();
    expect(toInt("")).toBeNull();
    expect(toInt("abc")).toBeNull();
  });
  it("turns rate placeholders into null", () => {
    expect(toRate(".281")).toBe(0.281);
    expect(toRate("-.--")).toBeNull();
    expect(toRate(".---")).toBeNull();
    expect(toRate("inf")).toBeNull();
  });
  it("converts innings to outs and rejects impossible fractions", () => {
    expect(inningsToOuts("180.2")).toBe(542);
    expect(inningsToOuts("0.1")).toBe(1);
    expect(inningsToOuts("12")).toBe(36);
    expect(inningsToOuts("180.3")).toBeNull();
    expect(inningsToOuts("x")).toBeNull();
  });
});

describe("normalizeSplit", () => {
  const ctx = { season: 2026, snapshotDate: "2026-10-25", ingestedAt: DAY1 };
  it("stores true 0 as 0 and a missing field as NULL, keeping the raw stat", () => {
    const row = normalizeSplit(split(1, 147, hit()), "hitting", ctx)!;
    expect(row.hitByPitch).toBe(0);
    expect(row.sacFlies).toBeNull();
    expect(row.avg).toBe(0.281);
    expect(row.strikeOutsPitched).toBeNull(); // other group's column
    expect(JSON.parse(row.rawStat!).hits).toBe(100);
  });
  it("uses team 0 for the all-teams total and skips rows with no player", () => {
    expect(normalizeSplit(split(1, null, hit()), "hitting", ctx)!.teamId).toBe(
      ALL_TEAMS
    );
    expect(normalizeSplit({ stat: hit() }, "hitting", ctx)).toBeNull();
  });
});

describe("runSnapshot", () => {
  it("is idempotent within a day and adds a new snapshot the next day", async () => {
    const { rows, store } = memoryStore();
    const data = {
      hitting: [split(1, 147, hit())],
      pitching: [split(2, 111, { inningsPitched: "10.1", strikeOuts: 0 })],
    };
    const deps = { fetchJson: feed(data), store };

    const a = await runSnapshot({ season: 2026, now: DAY1 }, deps);
    expect(a.ok).toBe(true);
    expect(rows.size).toBe(2);

    const b = await runSnapshot({ season: 2026, now: DAY1 }, deps);
    expect(rows.size).toBe(2);
    expect(b.groups[0].updated).toBe(1);
    expect(b.groups[0].inserted).toBe(0);

    await runSnapshot({ season: 2026, now: DAY2 }, deps);
    expect(rows.size).toBe(4);
  });

  it("same-day change replaces today's row; yesterday stays unchanged", async () => {
    const { rows, store } = memoryStore();
    await runSnapshot(
      { season: 2026, now: DAY1 },
      {
        fetchJson: feed({
          hitting: [split(1, 147, hit({ hits: 100 }))],
          pitching: [split(2, 111, { wins: 1 })],
        }),
        store,
      }
    );
    await runSnapshot(
      { season: 2026, now: DAY2 },
      {
        fetchJson: feed({
          hitting: [split(1, 147, hit({ hits: 101 }))],
          pitching: [split(2, 111, { wins: 1 })],
        }),
        store,
      }
    );
    await runSnapshot(
      { season: 2026, now: DAY2 },
      {
        fetchJson: feed({
          hitting: [split(1, 147, hit({ hits: 103 }))],
          pitching: [split(2, 111, { wins: 1 })],
        }),
        store,
      }
    );
    const hits = (d: string) =>
      [...rows.values()].find(
        r => r.statGroup === "hitting" && r.snapshotDate === d
      )!.hits;
    expect(hits("2026-10-25")).toBe(100);
    expect(hits("2026-10-26")).toBe(103);
  });

  it("keeps a traded player's team splits and total as separate rows, never summed", async () => {
    const { rows, store } = memoryStore();
    const data = {
      hitting: [
        split(7, 147, hit({ hits: 60 }), 2),
        split(7, 111, hit({ hits: 40 }), 2),
        split(7, null, hit({ hits: 100 }), 2),
      ],
      pitching: [split(2, 111, { wins: 1 })],
    };
    await runSnapshot(
      { season: 2026, now: DAY1 },
      { fetchJson: feed(data), store }
    );
    const mine = [...rows.values()].filter(r => r.playerId === 7);
    expect(mine.map(r => r.teamId).sort((a, b) => a - b)).toEqual([
      0, 111, 147,
    ]);
    const splitsSum = mine
      .filter(r => r.teamId !== 0)
      .reduce((s, r) => s + (r.hits as number), 0);
    expect(splitsSum).toBe(mine.find(r => r.teamId === 0)!.hits);
  });

  it("writes nothing for a failed group, reports it, and still stores the other", async () => {
    const { rows, store } = memoryStore();
    const fetchJson = async (url: string) => {
      if (url.includes("group=pitching")) throw new Error("MLB API 500");
      return feed({ hitting: [split(1, 147, hit())] })(url);
    };
    const report = await runSnapshot(
      { season: 2026, now: DAY1 },
      { fetchJson, store }
    );
    expect(report.ok).toBe(false);
    expect(report.groups.find(g => g.group === "pitching")!.error).toBe(
      "MLB API 500"
    );
    expect([...rows.values()].every(r => r.statGroup === "hitting")).toBe(true);
  });

  it("treats an empty or malformed response as failure, not success", async () => {
    const { rows, store } = memoryStore();
    const empty = await runSnapshot(
      { season: 2026, now: DAY1 },
      { fetchJson: feed({}), store }
    );
    expect(empty.ok).toBe(false);
    expect(empty.groups[0].error).toBe("empty-response");
    const bad = await runSnapshot(
      { season: 2026, now: DAY1, groups: ["hitting"] },
      { fetchJson: async () => ({ nope: 1 }), store }
    );
    expect(bad.groups[0].error).toBe("unexpected-structure");
    expect(rows.size).toBe(0);
  });

  it("paginates, collapses duplicate keys, and counts rows with no player", async () => {
    const { rows, store } = memoryStore();
    const hitting = [1, 2, 3, 4, 5].map(id => split(id, 147, hit()));
    hitting.push(split(5, 147, hit({ hits: 999 }))); // overlap across pages
    hitting.push({ stat: hit() } as any);
    const report = await runSnapshot(
      { season: 2026, now: DAY1, pageSize: 2 },
      {
        fetchJson: feed({ hitting, pitching: [split(9, 111, { wins: 0 })] }),
        store,
      }
    );
    const g = report.groups[0];
    expect(g.pages).toBe(4);
    expect(g.rows).toBe(5);
    expect(g.duplicatesCollapsed).toBe(1);
    expect(g.skippedNoPlayer).toBe(1);
    expect([...rows.values()].find(r => r.playerId === 5)!.hits).toBe(999);
  });

  it("stops at the page limit instead of looping", async () => {
    const { store } = memoryStore();
    const endless = async () => page([split(1, 1, hit()), split(2, 1, hit())]);
    const report = await runSnapshot(
      {
        season: 2026,
        now: DAY1,
        pageSize: 2,
        maxPages: 3,
        groups: ["hitting"],
      },
      { fetchJson: endless, store }
    );
    expect(report.groups[0].error).toMatch(/pagination-limit/);
  });

  it("flags columns that were NULL on every row (wrong provider key)", async () => {
    const { store } = memoryStore();
    const report = await runSnapshot(
      { season: 2026, now: DAY1, groups: ["hitting"] },
      { fetchJson: feed({ hitting: [split(1, 147, hit())] }), store }
    );
    expect(report.groups[0].emptyColumns).toContain("sacFlies");
    expect(report.groups[0].emptyColumns).not.toContain("hitByPitch");
  });

  it("uses the UTC day for snapshot_date", async () => {
    const { rows, store } = memoryStore();
    await runSnapshot(
      {
        season: 2026,
        now: new Date("2026-10-26T02:30:00Z"),
        groups: ["hitting"],
      },
      { fetchJson: feed({ hitting: [split(1, 1, hit())] }), store }
    );
    expect([...rows.values()][0].snapshotDate).toBe("2026-10-26");
  });
});
