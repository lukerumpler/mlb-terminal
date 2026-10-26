import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentMlbSeason,
  discoverSeasonGames,
  isKnownEmptyGameFailure,
  monthWindows,
  runIngestion,
  splitFailures,
} from "./ingest.js";
import type { WarehouseStore } from "./ingest.js";
import { parseGameFeed } from "./parse.js";
import { validateParsedGame } from "./validate.js";

describe("monthWindows", () => {
  it("covers Feb-Nov by default (10 requests)", () => {
    expect(monthWindows(2026)).toHaveLength(10);
  });

  it("clips to a date range so a daily job makes one request", () => {
    expect(
      monthWindows(2026, { sinceDate: "2026-09-22", untilDate: "2026-10-02" })
    ).toEqual([
      ["2026-09-22", "2026-09-30"],
      ["2026-10-01", "2026-10-02"],
    ]);
    expect(
      monthWindows(2026, { sinceDate: "2026-06-10", untilDate: "2026-06-12" })
    ).toEqual([["2026-06-10", "2026-06-12"]]);
  });

  it("returns nothing when the range is outside the season window", () => {
    expect(
      monthWindows(2026, { sinceDate: "2026-12-01", untilDate: "2026-12-31" })
    ).toEqual([]);
    expect(
      monthWindows(2026, { sinceDate: "2027-01-01", untilDate: "2027-01-05" })
    ).toEqual([]);
  });
});

describe("currentMlbSeason", () => {
  it("treats January as the previous season's offseason", () => {
    expect(currentMlbSeason(new Date("2027-01-15T00:00:00Z"))).toBe(2026);
    expect(currentMlbSeason(new Date("2027-02-01T00:00:00Z"))).toBe(2027);
    expect(currentMlbSeason(new Date("2026-10-02T00:00:00Z"))).toBe(2026);
  });
});

describe("failure classification", () => {
  const empty = {
    gamePk: 1,
    error: "Game 1 is final but produced zero pitches (incomplete feed?)",
  };
  const real = { gamePk: 2, error: "MLB API 503 for game 2" };
  it("separates games that can never succeed from ones worth acting on", () => {
    expect(isKnownEmptyGameFailure(empty.error)).toBe(true);
    expect(isKnownEmptyGameFailure(real.error)).toBe(false);
    expect(splitFailures([empty, real])).toEqual({
      knownEmpty: [empty],
      actionable: [real],
    });
  });
});

describe("failure classification against the real validator", () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../test/fixtures/mlb-gumbo-sample.json"
      ),
      "utf8"
    )
  );
  // ingestGame joins the validator's error messages exactly like this.
  const failureMessage = (parsed: ReturnType<typeof parseGameFeed>) =>
    validateParsedGame(parsed)
      .filter(issue => issue.severity === "error")
      .map(issue => issue.message)
      .join("; ");

  it("recognises the validator's own zero-pitch error, not a hand-copied string", () => {
    const parsed = parseGameFeed(structuredClone(fixture));
    const message = failureMessage({ ...parsed, pitches: [] });
    expect(message).not.toBe("");
    expect(isKnownEmptyGameFailure(message)).toBe(true);
  });

  it("does not treat the validator's other errors as known-empty", () => {
    const parsed = parseGameFeed(structuredClone(fixture));
    const message = failureMessage({
      ...parsed,
      pitches: [parsed.pitches[0], parsed.pitches[0]],
    });
    expect(message).toMatch(/duplicate pitch/i);
    expect(isKnownEmptyGameFailure(message)).toBe(false);
  });
});

describe("windowed discovery", () => {
  const schedule = (calls: string[]) => async (url: string) => {
    calls.push(url);
    return { dates: [] };
  };

  it("asks the schedule only for the requested range", async () => {
    const calls: string[] = [];
    await discoverSeasonGames(2026, schedule(calls), {
      sinceDate: "2026-09-28",
      untilDate: "2026-10-02",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("startDate=2026-09-28&endDate=2026-09-30");
    expect(calls[1]).toContain("startDate=2026-10-01&endDate=2026-10-02");
  });

  it("runIngestion with discoverSinceDays fetches a short window, not the season", async () => {
    const calls: string[] = [];
    const store = {
      registerGames: async () => {},
      requeueComplete: async () => 0,
      listWork: async () => [],
      summary: async () => ({
        pending: 0,
        processing: 0,
        complete: 0,
        failed: 0,
      }),
    } as unknown as WarehouseStore;
    await runIngestion(
      { season: 2026, discoverSinceDays: 3 },
      {
        store,
        fetchJson: schedule(calls),
        now: () => new Date("2026-10-02T12:00:00Z"),
      }
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("startDate=2026-09-29&endDate=2026-09-30");
    expect(calls[1]).toContain("startDate=2026-10-01&endDate=2026-10-02");
  });
});
