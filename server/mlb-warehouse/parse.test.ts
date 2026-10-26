import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FeedParseError, isIngestableStatus, parseGameFeed } from "./parse.js";
import { toSkipPitchType } from "./pitchTaxonomy.js";
import { validateParsedGame } from "./validate.js";

// Trimmed real GUMBO payload (game 631220, first 8 plate appearances), taken
// from the MLB Stats API live feed via the mcbarlowe/mlb example data (MIT).
const fixturePath = path.resolve(
  import.meta.dirname,
  "../../test/fixtures/mlb-gumbo-sample.json"
);
const loadFeed = () => JSON.parse(fs.readFileSync(fixturePath, "utf8"));

describe("parseGameFeed (real GUMBO fixture)", () => {
  const parsed = parseGameFeed(loadFeed());

  it("extracts game identity, teams, venue, weather and final score", () => {
    expect(parsed.game).toMatchObject({
      gamePk: 631220,
      season: 2020,
      gameType: "R",
      officialDate: "2020-08-05",
      doubleHeader: "Y",
      gameNumber: 1,
      statusCode: "F",
      homeTeamId: 147,
      awayTeamId: 143,
      homeTeamAbbr: "NYY",
      awayTeamAbbr: "PHI",
      venueId: 2681,
      weatherTemp: 88,
      homeScore: 7,
      awayScore: 11,
    });
  });

  it("emits one row per real pitch and ignores non-pitch events", () => {
    // 32 events in this fixture have isPitch === true; action events
    // (status changes, pickoffs, substitutions) must not become pitches.
    expect(parsed.pitches).toHaveLength(32);
  });

  it("maps a known pitch field-for-field", () => {
    const first = parsed.pitches[0];
    expect(first).toMatchObject({
      gamePk: 631220,
      atBatIndex: 0,
      eventIndex: 3,
      pitchNumber: 1,
      sourcePitchTypeCode: "FF",
      skipPitchType: "Four-Seam Fastball",
      startSpeed: 90.7,
      spinRate: 2361,
      spinDirection: 148,
      zone: 3,
      breakVerticalInduced: 18,
      batterId: 457705,
      pitcherId: 457918,
      callDescription: "Called Strike",
      isStrike: true,
    });
    expect(first.extension).toBeCloseTo(5.876, 3);
  });

  it("derives the count before each pitch from the previous pitch", () => {
    const [p1, p2] = parsed.pitches;
    expect([p1.ballsBefore, p1.strikesBefore]).toEqual([0, 0]);
    expect([p1.ballsAfter, p1.strikesAfter]).toEqual([0, 1]);
    // Second pitch starts from the first pitch's resulting count.
    expect([p2.ballsBefore, p2.strikesBefore]).toEqual([0, 1]);
    // A new plate appearance resets to 0-0.
    const nextAb = parsed.pitches.find(p => p.atBatIndex === 1)!;
    expect([nextAb.ballsBefore, nextAb.strikesBefore]).toEqual([0, 0]);
  });

  it("has a unique identity for every pitch", () => {
    const keys = new Set(
      parsed.pitches.map(p => `${p.gamePk}:${p.atBatIndex}:${p.eventIndex}`)
    );
    expect(keys.size).toBe(parsed.pitches.length);
  });

  it("keeps only players who appear in the game's plays", () => {
    const ids = new Set(parsed.players.map(p => p.mlbId));
    expect(ids.has(457705)).toBe(true);
    expect(ids.has(457918)).toBe(true);
    for (const p of parsed.pitches) {
      expect(ids.has(p.pitcherId)).toBe(true);
      expect(ids.has(p.batterId)).toBe(true);
    }
  });

  it("passes validation with no errors", () => {
    expect(
      validateParsedGame(parsed).filter(i => i.severity === "error")
    ).toEqual([]);
  });
});

describe("missing data stays missing", () => {
  it("leaves absent tracking fields null instead of defaulting to 0", () => {
    const feed = loadFeed();
    const ev = feed.liveData.plays.allPlays[0].playEvents.find(
      (e: any) => e.isPitch
    );
    delete ev.pitchData;
    const pitch = parseGameFeed(feed).pitches.find(
      p => p.atBatIndex === 0 && p.eventIndex === ev.index
    )!;
    expect(pitch.startSpeed).toBeNull();
    expect(pitch.spinRate).toBeNull();
    expect(pitch.zone).toBeNull();
    expect(pitch.extension).toBeNull();
    expect(pitch.plateX).toBeNull();
  });

  it("does not coerce non-numeric strings to numbers", () => {
    const feed = loadFeed();
    const ev = feed.liveData.plays.allPlays[0].playEvents.find(
      (e: any) => e.isPitch
    );
    ev.pitchData.startSpeed = "n/a";
    const pitch = parseGameFeed(feed).pitches.find(
      p => p.atBatIndex === 0 && p.eventIndex === ev.index
    )!;
    expect(pitch.startSpeed).toBeNull();
  });

  it("carries batted-ball data through when the feed provides it", () => {
    const feed = loadFeed();
    const ev = feed.liveData.plays.allPlays[0].playEvents.find(
      (e: any) => e.isPitch
    );
    ev.hitData = { launchSpeed: 101.2, launchAngle: 27, totalDistance: 356 };
    const pitch = parseGameFeed(feed).pitches.find(
      p => p.atBatIndex === 0 && p.eventIndex === ev.index
    )!;
    expect(pitch).toMatchObject({
      launchSpeed: 101.2,
      launchAngle: 27,
      totalDistance: 356,
    });
  });
});

describe("malformed feeds", () => {
  it("rejects a feed with no plays", () => {
    expect(() => parseGameFeed({ gameData: {} })).toThrow(FeedParseError);
  });

  it("rejects a feed missing teams", () => {
    const feed = loadFeed();
    delete feed.gameData.teams.home;
    expect(() => parseGameFeed(feed)).toThrow(/home or away team/);
  });
});

describe("validateParsedGame", () => {
  it("errors on duplicate pitch identities", () => {
    const parsed = parseGameFeed(loadFeed());
    parsed.pitches.push({ ...parsed.pitches[0] });
    const errors = validateParsedGame(parsed).filter(
      i => i.severity === "error"
    );
    expect(errors.map(e => e.code)).toContain("duplicate_pitch");
  });

  it("errors when a final game has zero pitches", () => {
    const parsed = parseGameFeed(loadFeed());
    parsed.pitches = [];
    expect(validateParsedGame(parsed).map(i => i.code)).toContain("no_pitches");
  });

  it("warns, but does not error, on implausible velocity", () => {
    const parsed = parseGameFeed(loadFeed());
    parsed.pitches[0].startSpeed = 240;
    const issues = validateParsedGame(parsed);
    expect(issues.find(i => i.code === "implausible_velocity")?.severity).toBe(
      "warning"
    );
    expect(issues.filter(i => i.severity === "error")).toEqual([]);
  });
});

describe("isIngestableStatus", () => {
  it("accepts Final and Game Over", () => {
    expect(isIngestableStatus("F", "Final")).toBe(true);
    expect(isIngestableStatus("O", "Game Over")).toBe(true);
  });
  it("rejects live, scheduled, postponed and suspended games", () => {
    expect(isIngestableStatus("I", "In Progress")).toBe(false);
    expect(isIngestableStatus("S", "Scheduled")).toBe(false);
    expect(isIngestableStatus("F", "Postponed")).toBe(false);
    expect(isIngestableStatus("F", "Suspended: Rain")).toBe(false);
    expect(isIngestableStatus(undefined, undefined)).toBe(false);
  });
});

describe("toSkipPitchType", () => {
  it("normalizes provider codes into SKIP's taxonomy", () => {
    expect(toSkipPitchType("FF")).toBe("Four-Seam Fastball");
    expect(toSkipPitchType("SI")).toBe("Sinker");
    expect(toSkipPitchType("ST")).toBe("Sweeper");
    expect(toSkipPitchType("KC")).toBe("Curveball");
    expect(toSkipPitchType("FS")).toBe("Splitter");
  });
  it("buckets unmapped codes as Other and preserves 'no type' as null", () => {
    expect(toSkipPitchType("EP")).toBe("Other");
    expect(toSkipPitchType("XX")).toBe("Other");
    expect(toSkipPitchType(null)).toBeNull();
    expect(toSkipPitchType("")).toBeNull();
  });
});
