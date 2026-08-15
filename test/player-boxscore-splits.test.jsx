import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BoxscoreSplitPanel } from "../client/src/pages/PlayersPage.jsx";
import {
  __resetMlbClientStateForTests,
  getPlayerBoxscoreSplits,
} from "../client/src/api/mlb.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe("player boxscore split aggregation", () => {
  beforeEach(() => {
    cleanup();
    __resetMlbClientStateForTests();
    vi.restoreAllMocks();
  });

  it("aggregates official batting and pitching rows into OPS and ERA splits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async url => {
        if (String(url).includes("schedule")) {
          return jsonResponse({
            dates: [
              {
                games: [
                  {
                    gamePk: 123,
                    gameDate: "2026-08-10T18:00:00Z",
                    dayNight: "day",
                    status: { abstractGameState: "Final" },
                  },
                ],
              },
            ],
          });
        }
        return jsonResponse({
          teams: {
            home: {
              players: {
                ID123: {
                  person: { id: 123 },
                  stats: {
                    batting: {
                      plateAppearances: 4,
                      atBats: 3,
                      hits: 2,
                      totalBases: 4,
                      baseOnBalls: 1,
                      hitByPitch: 0,
                      sacrificeFlies: 0,
                    },
                    pitching: {
                      inningsPitched: "2.0",
                      earnedRuns: 1,
                      hits: 2,
                      baseOnBalls: 1,
                      strikeOuts: 3,
                      gamesStarted: 1,
                    },
                  },
                },
              },
            },
            away: { players: {} },
          },
        });
      })
    );

    const result = await getPlayerBoxscoreSplits(123, 10, 2026);
    expect(result.status).toBe("live");
    expect(result.games).toBe(1);
    expect(result.batting.find(row => row.label === "Home")).toMatchObject({
      hits: 2,
      plateAppearances: 4,
      avg: 2 / 3,
      obp: 0.75,
      slg: 4 / 3,
      ops: 2.083333333333333,
    });
    expect(result.pitching.find(row => row.label === "Day")).toMatchObject({
      inningsPitched: 2,
      earnedRuns: 1,
      era: 4.5,
      whip: 1.5,
    });
  });

  it("returns a truthful unavailable state when the official schedule times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted due to timeout");
      })
    );
    const result = await getPlayerBoxscoreSplits(123, 10, 2026);
    expect(result.status).toBe("unavailable");
    expect(result.source).toBe("MLB Stats API boxscores");
    expect(result.reason).toMatch(/schedule|boxscore.*unavailable/i);
    expect(result.batting).toEqual([]);
    expect(result.pitching).toEqual([]);
  });

  it("returns a truthful unavailable state when no current team identifier exists", async () => {
    const result = await getPlayerBoxscoreSplits(123, null, 2026);
    expect(result.status).toBe("unavailable");
    expect(result.source).toBe("MLB Stats API boxscores");
    expect(result.reason).toMatch(/current MLB team identifier/i);
    expect(result.batting).toEqual([]);
    expect(result.pitching).toEqual([]);
  });

  it("renders loading, unavailable, and live source states for hitter and pitcher profiles", () => {
    render(
      <BoxscoreSplitPanel
        player={{
          id: 123,
          isPitcher: false,
          boxscoreSplits: { status: "loading" },
        }}
      />
    );
    expect(screen.getByText("Checking official boxscores")).toBeInTheDocument();
    cleanup();

    render(
      <BoxscoreSplitPanel
        player={{
          id: 123,
          isPitcher: true,
          boxscoreSplits: {
            status: "unavailable",
            reason: "The official feed is unavailable.",
            pitching: [],
          },
        }}
      />
    );
    expect(
      screen.getAllByText("Boxscore ERA Splits").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("The official feed is unavailable.")
    ).toBeInTheDocument();
    cleanup();

    render(
      <BoxscoreSplitPanel
        player={{
          id: 123,
          isPitcher: false,
          boxscoreSplits: {
            status: "live",
            source: "MLB Stats API boxscores",
            windowLabel: "Most recent 2 completed regular-season games",
            retrievedAt: "2026-08-14T12:00:00Z",
            games: 2,
            batting: [
              {
                label: "Home",
                games: 2,
                plateAppearances: 8,
                atBats: 7,
                hits: 3,
                homeRuns: 1,
                walks: 1,
                avg: 3 / 7,
                obp: 0.5,
                slg: 5 / 7,
                ops: 1.214,
              },
            ],
            pitching: [],
          },
        }}
      />
    );
    expect(screen.getByText("Boxscore OPS Splits")).toBeInTheDocument();
    expect(
      screen.getByText(/MLB Stats API boxscores · Most recent 2 completed/)
    ).toBeInTheDocument();
    expect(screen.getByText("1.214")).toBeInTheDocument();
  });
});
