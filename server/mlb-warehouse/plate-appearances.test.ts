import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  basesAfterFromMatchup,
  countBases,
  parseGameFeed,
  PARSER_VERSION,
} from "./parse.js";
import { validateParsedGame } from "./validate.js";

// Trimmed real GUMBO payload (game 631220, first 8 plate appearances).
const fixturePath = path.resolve(
  import.meta.dirname,
  "../../test/fixtures/mlb-gumbo-sample.json"
);
const loadFeed = () => JSON.parse(fs.readFileSync(fixturePath, "utf8"));

describe("plate-appearance rows from the real GUMBO fixture", () => {
  const parsed = parseGameFeed(loadFeed());
  const rows = parsed.plateAppearances;

  it("emits one row per plate appearance and bumps the parser version", () => {
    expect(PARSER_VERSION).toBe(2);
    expect(rows).toHaveLength(8);
    expect(rows.map(r => r.atBatIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(parsed.game.parserVersion).toBe(2);
  });

  it("reads outs before and after each play", () => {
    // Checked by hand against the raw feed: 2 outs, walk, walk, then the third out.
    expect(rows.map(r => [r.outsBefore, r.outsAfter])).toEqual([
      [0, 1],
      [1, 2],
      [2, 2],
      [2, 2],
      [2, 3],
      [0, 0], // new half-inning: outs start again at 0
      [0, 0],
      [0, 0],
    ]);
  });

  it("reads base state as a bitmask (1 = 1B, 2 = 2B, 4 = 3B)", () => {
    expect(rows.map(r => [r.basesBefore, r.basesAfter])).toEqual([
      [0, 0],
      [0, 0],
      [0, 1], // walk: runner on 1B
      [1, 3], // walk: runner moves up, batter on 1B -> 1B and 2B
      [3, 0], // third out: runners left on base, inning over
      [0, 1], // bottom 1, single
      [1, 3], // fielder's choice with an error
      [3, 7], // walk: bases loaded
    ]);
  });

  it("credits the right batting team and records no runs where none scored", () => {
    expect(rows.slice(0, 5).every(r => r.battingTeamId === 143)).toBe(true); // PHI, away
    expect(rows.slice(5).every(r => r.battingTeamId === 147)).toBe(true); // NYY, home
    expect(rows.every(r => r.runsOnPlay === 0)).toBe(true);
    expect(rows.every(r => r.earnedRunsOnPlay === 0)).toBe(true);
  });

  it("copies the plate-appearance result and identity", () => {
    expect(rows[2]).toMatchObject({
      gamePk: 631220,
      season: 2020,
      inning: 1,
      halfInning: "top",
      paEventType: "walk",
      isComplete: true,
    });
    expect(rows[0].batterId).toBe(457705);
  });

  it("has a row for every pitch's plate appearance and no blocking errors", () => {
    const keys = new Set(rows.map(r => r.atBatIndex));
    expect(parsed.pitches.every(p => keys.has(p.atBatIndex))).toBe(true);
    const issues = validateParsedGame(parsed);
    expect(issues.filter(i => i.severity === "error")).toEqual([]);
    // The fixture is trimmed to 8 plate appearances, so the runs do not add up
    // to the final score, and the validator says so.
    expect(issues.map(i => i.code)).toContain("pa_runs_total_mismatch");
    expect(issues.map(i => i.code)).not.toContain("pa_base_state_unknown");
  });
});

// Synthetic plays use the same fields the real fixture has. Scoring plays and
// extra innings are not in the real fixture, so these test the rules, not the
// feed's wording for those cases.
interface PlaySpec {
  inning?: number;
  half?: "top" | "bottom";
  eventType: string;
  outsAfter: number;
  away: number;
  home: number;
  post?: number; // bitmask of bases after
  runners?: Array<Record<string, any>>;
  pitchless?: boolean;
}

function feedWith(plays: PlaySpec[]) {
  const feed = loadFeed();
  feed.liveData.plays.allPlays = plays.map((spec, index) => ({
    atBatIndex: index,
    about: {
      atBatIndex: index,
      inning: spec.inning ?? 1,
      halfInning: spec.half ?? "top",
      isComplete: true,
    },
    count: { balls: 0, strikes: 0, outs: spec.outsAfter },
    result: {
      type: "atBat",
      event: spec.eventType,
      eventType: spec.eventType,
      awayScore: spec.away,
      homeScore: spec.home,
    },
    matchup: {
      batter: { id: 1000 + index },
      pitcher: { id: 2000 },
      batSide: { code: "R" },
      pitchHand: { code: "R" },
      ...((spec.post ?? 0) & 1 ? { postOnFirst: { id: 1 } } : {}),
      ...((spec.post ?? 0) & 2 ? { postOnSecond: { id: 2 } } : {}),
      ...((spec.post ?? 0) & 4 ? { postOnThird: { id: 3 } } : {}),
    },
    runners: spec.runners ?? [],
    playEvents: spec.pitchless
      ? []
      : [
          {
            index: 0,
            isPitch: true,
            pitchNumber: 1,
            details: { isStrike: true },
            count: { balls: 0, strikes: 1, outs: spec.outsAfter },
          },
        ],
  }));
  return feed;
}

const score = (end: string, earned: boolean) => ({
  movement: { originBase: null, start: null, end, isOut: false },
  details: { earned },
});

describe("runs and earned runs", () => {
  it("takes runs from the change in the batting team's score", () => {
    const parsed = parseGameFeed(
      feedWith([
        // home run: batter scores, earned
        {
          eventType: "home_run",
          outsAfter: 0,
          away: 1,
          home: 0,
          post: 0,
          runners: [score("score", true)],
        },
        { eventType: "single", outsAfter: 0, away: 1, home: 0, post: 1 },
        // double: the runner from 1B scores (unearned), batter on 2B
        {
          eventType: "double",
          outsAfter: 0,
          away: 2,
          home: 0,
          post: 2,
          runners: [
            {
              movement: {
                originBase: "1B",
                start: "1B",
                end: "score",
                isOut: false,
              },
              details: { earned: false },
            },
            {
              movement: {
                originBase: null,
                start: null,
                end: "2B",
                isOut: false,
              },
              details: { earned: true },
            },
          ],
        },
        { eventType: "strikeout", outsAfter: 1, away: 2, home: 0, post: 2 },
        {
          eventType: "grounded_into_double_play",
          outsAfter: 3,
          away: 2,
          home: 0,
          post: 0,
        },
      ])
    );
    const rows = parsed.plateAppearances;
    expect(rows.map(r => r.runsOnPlay)).toEqual([1, 0, 1, 0, 0]);
    expect(rows.map(r => r.earnedRunsOnPlay)).toEqual([1, 0, 0, 0, 0]);
    expect(rows.map(r => r.basesBefore)).toEqual([0, 0, 1, 2, 2]);
    expect(rows.every(r => r.outsBefore !== null)).toBe(true);
  });

  it("agrees with the final score when the whole game is present", () => {
    const feed = feedWith([
      {
        eventType: "home_run",
        outsAfter: 0,
        away: 1,
        home: 0,
        post: 0,
        runners: [score("score", true)],
      },
      { eventType: "strikeout", outsAfter: 1, away: 1, home: 0 },
      { eventType: "strikeout", outsAfter: 2, away: 1, home: 0 },
      { eventType: "strikeout", outsAfter: 3, away: 1, home: 0 },
      {
        half: "bottom",
        eventType: "home_run",
        outsAfter: 0,
        away: 1,
        home: 1,
        post: 0,
        runners: [score("score", true)],
      },
    ]);
    feed.liveData.linescore.teams.away.runs = 1;
    feed.liveData.linescore.teams.home.runs = 1;
    const codes = validateParsedGame(parseGameFeed(feed)).map(i => i.code);
    expect(codes).not.toContain("pa_runs_total_mismatch");
    expect(codes).not.toContain("pa_runs_unknown");
  });

  it("leaves runs null when the fielding team's score also moves", () => {
    const parsed = parseGameFeed(
      feedWith([
        { eventType: "single", outsAfter: 0, away: 1, home: 1, post: 1 },
      ])
    );
    expect(parsed.plateAppearances[0].runsOnPlay).toBeNull();
    expect(validateParsedGame(parsed).map(i => i.code)).toContain(
      "pa_runs_unknown"
    );
  });

  it("leaves runs null when a score is missing, and recovers two plays later", () => {
    const feed = feedWith([
      { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 1 },
      { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 3 },
      { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 7 },
      { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 7 },
    ]);
    delete feed.liveData.plays.allPlays[1].result.awayScore;
    // The play with no score, and the play after it (its "before" is unknown), are null.
    expect(parseGameFeed(feed).plateAppearances.map(r => r.runsOnPlay)).toEqual(
      [0, null, null, 0]
    );
  });

  it("leaves earned runs null when scoring runners do not match the score change", () => {
    const parsed = parseGameFeed(
      feedWith([
        {
          eventType: "home_run",
          outsAfter: 0,
          away: 1,
          home: 0,
          post: 0,
          runners: [],
        },
      ])
    );
    expect(parsed.plateAppearances[0].runsOnPlay).toBe(1);
    expect(parsed.plateAppearances[0].earnedRunsOnPlay).toBeNull();
  });

  it("leaves earned runs null when the earned flag is missing", () => {
    const parsed = parseGameFeed(
      feedWith([
        {
          eventType: "home_run",
          outsAfter: 0,
          away: 1,
          home: 0,
          post: 0,
          runners: [{ movement: { end: "score", isOut: false }, details: {} }],
        },
      ])
    );
    expect(parsed.plateAppearances[0].earnedRunsOnPlay).toBeNull();
  });
});

describe("base state reconciliation", () => {
  it("keeps the base state as null for an extra-inning runner who is not in any earlier play", () => {
    // Inning 10, top. A runner starts on 2B (not in the feed's earlier plays).
    // A single moves him to 3B and puts the batter on 1B: bases after = 1B + 3B.
    const parsed = parseGameFeed(
      feedWith([
        {
          inning: 10,
          eventType: "single",
          outsAfter: 0,
          away: 0,
          home: 0,
          post: 5,
        },
        {
          inning: 10,
          eventType: "strikeout",
          outsAfter: 1,
          away: 0,
          home: 0,
          post: 5,
        },
      ])
    );
    const [first, second] = parsed.plateAppearances;
    expect(first.basesBefore).toBeNull(); // 0 + batter - 0 - 0 = 1, but 2 are on after
    expect(first.basesAfter).toBe(5);
    expect(second.basesBefore).toBe(5); // from the previous play, and it reconciles
    expect(validateParsedGame(parsed).map(i => i.code)).toContain(
      "pa_base_state_unknown"
    );
  });

  it("accepts a plate appearance the batter did not finish", () => {
    // Caught stealing for the second out: the batter has not been consumed.
    const parsed = parseGameFeed(
      feedWith([
        { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 1 },
        {
          eventType: "caught_stealing_2b",
          outsAfter: 1,
          away: 0,
          home: 0,
          post: 0,
        },
      ])
    );
    expect(parsed.plateAppearances[1].basesBefore).toBe(1);
  });

  it("resets outs and bases at the start of each half-inning", () => {
    const parsed = parseGameFeed(
      feedWith([
        { eventType: "single", outsAfter: 0, away: 0, home: 0, post: 1 },
        { eventType: "strikeout", outsAfter: 3, away: 0, home: 0, post: 0 },
        {
          half: "bottom",
          eventType: "walk",
          outsAfter: 0,
          away: 0,
          home: 0,
          post: 1,
        },
      ])
    );
    const last = parsed.plateAppearances[2];
    expect([last.outsBefore, last.basesBefore]).toEqual([0, 0]);
  });

  it("gives null outs for a play whose out count is missing or goes backwards", () => {
    const feed = feedWith([
      { eventType: "strikeout", outsAfter: 1, away: 0, home: 0 },
      { eventType: "strikeout", outsAfter: 0, away: 0, home: 0 },
    ]);
    const rows = parseGameFeed(feed).plateAppearances;
    expect(rows[1].outsBefore).toBeNull();
    expect(rows[1].basesBefore).toBeNull();
  });
});

describe("pitchless plate appearances", () => {
  it("keeps a plate appearance that has no pitches (an automatic intentional walk)", () => {
    const parsed = parseGameFeed(
      feedWith([
        { eventType: "strikeout", outsAfter: 1, away: 0, home: 0 },
        {
          eventType: "intent_walk",
          outsAfter: 1,
          away: 0,
          home: 0,
          post: 1,
          pitchless: true,
        },
        { eventType: "strikeout", outsAfter: 2, away: 0, home: 0, post: 1 },
      ])
    );
    expect(parsed.plateAppearances.map(r => r.paEventType)).toEqual([
      "strikeout",
      "intent_walk",
      "strikeout",
    ]);
    expect(parsed.pitches.map(p => p.atBatIndex)).toEqual([0, 2]);
    expect(parsed.plateAppearances[1].basesAfter).toBe(1);
  });
});

describe("helpers and validation", () => {
  it("reads the bases-after bitmask and counts runners", () => {
    expect(basesAfterFromMatchup({})).toBe(0);
    expect(basesAfterFromMatchup({ postOnFirst: {}, postOnThird: {} })).toBe(5);
    expect(
      basesAfterFromMatchup({
        postOnFirst: {},
        postOnSecond: {},
        postOnThird: {},
      })
    ).toBe(7);
    expect(basesAfterFromMatchup(null)).toBeNull();
    expect(countBases(0)).toBe(0);
    expect(countBases(5)).toBe(2);
    expect(countBases(7)).toBe(3);
  });

  it("blocks a write with a duplicate plate appearance or an orphan pitch", () => {
    const parsed = parseGameFeed(loadFeed());
    const duplicated = {
      ...parsed,
      plateAppearances: [
        ...parsed.plateAppearances,
        parsed.plateAppearances[0],
      ],
    };
    expect(validateParsedGame(duplicated).map(i => i.code)).toContain(
      "duplicate_plate_appearance"
    );
    const orphaned = {
      ...parsed,
      plateAppearances: parsed.plateAppearances.slice(1),
    };
    expect(validateParsedGame(orphaned).map(i => i.code)).toContain(
      "pitch_without_plate_appearance"
    );
  });
});
