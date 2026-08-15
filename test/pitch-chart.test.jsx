import { describe, it, expect, beforeEach } from "vitest";
import {
  applyResult,
  emptySession,
  closeCurrentAtBat,
} from "../client/src/lib/pitchChart.js";

beforeEach(() => {
  localStorage.clear();
});

describe("applyResult (Roadmap #8 count rules)", () => {
  it("a ball increments balls and does not end the at-bat below 4", () => {
    expect(applyResult(0, 0, "ball")).toEqual({
      balls: 1,
      strikes: 0,
      endsAtBat: false,
      outcome: null,
    });
    expect(applyResult(2, 1, "ball")).toEqual({
      balls: 3,
      strikes: 1,
      endsAtBat: false,
      outcome: null,
    });
  });

  it("a 4th ball is a walk and ends the at-bat", () => {
    expect(applyResult(3, 1, "ball")).toEqual({
      balls: 4,
      strikes: 1,
      endsAtBat: true,
      outcome: "Walk",
    });
  });

  it("called and swinging strikes increment strikes and do not end the at-bat below 3", () => {
    expect(applyResult(1, 0, "called")).toEqual({
      balls: 1,
      strikes: 1,
      endsAtBat: false,
      outcome: null,
    });
    expect(applyResult(1, 1, "swinging")).toEqual({
      balls: 1,
      strikes: 2,
      endsAtBat: false,
      outcome: null,
    });
  });

  it("a 3rd strike (called or swinging) is a strikeout and ends the at-bat", () => {
    expect(applyResult(2, 2, "called")).toEqual({
      balls: 2,
      strikes: 3,
      endsAtBat: true,
      outcome: "Strikeout",
    });
    expect(applyResult(0, 2, "swinging")).toEqual({
      balls: 0,
      strikes: 3,
      endsAtBat: true,
      outcome: "Strikeout",
    });
  });

  it("a foul increments strikes below 2 but never creates a 3rd strike", () => {
    expect(applyResult(1, 0, "foul")).toEqual({
      balls: 1,
      strikes: 1,
      endsAtBat: false,
      outcome: null,
    });
    expect(applyResult(1, 1, "foul")).toEqual({
      balls: 1,
      strikes: 2,
      endsAtBat: false,
      outcome: null,
    });
    // The real baseball rule this test exists to pin down: a foul with two
    // strikes stays at two strikes, it never ends the at-bat.
    expect(applyResult(3, 2, "foul")).toEqual({
      balls: 3,
      strikes: 2,
      endsAtBat: false,
      outcome: null,
    });
  });

  it("in-play and HBP results end the at-bat immediately regardless of count", () => {
    expect(applyResult(1, 1, "inplay_out")).toEqual({
      balls: 1,
      strikes: 1,
      endsAtBat: true,
      outcome: "In Play — Out",
    });
    expect(applyResult(2, 0, "inplay_hit")).toEqual({
      balls: 2,
      strikes: 0,
      endsAtBat: true,
      outcome: "In Play — Hit",
    });
    expect(applyResult(0, 0, "hbp")).toEqual({
      balls: 0,
      strikes: 0,
      endsAtBat: true,
      outcome: "Hit By Pitch",
    });
  });
});

describe("emptySession", () => {
  it("starts at 0-0 count, inning 1, 0 outs, with no pitches logged", () => {
    const s = emptySession();
    expect(s.balls).toBe(0);
    expect(s.strikes).toBe(0);
    expect(s.inning).toBe(1);
    expect(s.outs).toBe(0);
    expect(s.currentPitches).toEqual([]);
    expect(s.atBats).toEqual([]);
  });

  it("gives each session a distinct id", () => {
    const a = emptySession();
    const b = emptySession();
    expect(a.id).not.toBe(b.id);
  });
});

describe("closeCurrentAtBat (inning-rollover archiving)", () => {
  it("just clears the count when there is nothing in progress to archive", () => {
    const session = { ...emptySession(), balls: 2, strikes: 1 };
    const next = closeCurrentAtBat(session, "Inning ended");
    expect(next.balls).toBe(0);
    expect(next.strikes).toBe(0);
    expect(next.atBats).toEqual([]);
  });

  it("archives an in-progress at-bat under the given outcome rather than discarding it", () => {
    const pitch = {
      id: "p1",
      zone: 5,
      type: "FF",
      result: "called",
      countBefore: "0-0",
      ts: 1,
    };
    const session = {
      ...emptySession(),
      balls: 1,
      strikes: 2,
      currentPitches: [pitch],
      batterName: "Test Batter",
      pitcherName: "Test Pitcher",
    };
    const next = closeCurrentAtBat(session, "Inning ended");

    expect(next.balls).toBe(0);
    expect(next.strikes).toBe(0);
    expect(next.currentPitches).toEqual([]);
    expect(next.atBats).toHaveLength(1);
    expect(next.atBats[0].outcome).toBe("Inning ended");
    expect(next.atBats[0].pitches).toEqual([pitch]);
    expect(next.atBats[0].batterName).toBe("Test Batter");
  });

  it("prepends onto existing at-bat history rather than replacing it", () => {
    const prior = {
      id: "ab_prior",
      batterName: "X",
      pitcherName: "Y",
      pitches: [],
      outcome: "Walk",
      closedAt: 0,
    };
    const pitch = {
      id: "p1",
      zone: 1,
      type: null,
      result: "foul",
      countBefore: "0-1",
      ts: 1,
    };
    const session = {
      ...emptySession(),
      currentPitches: [pitch],
      atBats: [prior],
    };
    const next = closeCurrentAtBat(session, "Inning ended");
    expect(next.atBats).toHaveLength(2);
    expect(next.atBats[0].outcome).toBe("Inning ended"); // newest first
    expect(next.atBats[1]).toBe(prior);
  });
});
