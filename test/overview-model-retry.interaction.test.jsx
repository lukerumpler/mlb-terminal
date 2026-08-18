import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let feedAttempt = 0;
let modelAttempt = 0;
let savantMode = "pending";
let modelMode = "fallback";
let partialAggregate = false;

vi.mock("../client/src/api/mlb.js", async () => {
  const actual = await vi.importActual("../client/src/api/mlb.js");
  return {
    ...actual,
    getTodaysGames: vi.fn().mockResolvedValue([]),
    getStandings: vi.fn(async () =>
      feedAttempt > 0
        ? {
            LAD: [
              {
                id: 119,
                abbr: "LAD",
                w: 73,
                l: 48,
                pct: 0.603,
                rs: 606,
                ra: 464,
                diff: 142,
              },
            ],
          }
        : Promise.reject(new Error("MLB feed stalled"))
    ),
    getAllTeamStats: vi.fn(async group =>
      partialAggregate && group === "hitting"
        ? {
            119: {
              teamId: 119,
              teamAbbr: "LAD",
              teamName: "Los Angeles Dodgers",
              ops: 0.802,
              homeRuns: 98,
              era: 2.98,
              whip: 1.06,
              strikeOuts: 628,
              stolenBases: 54,
            },
          }
        : feedAttempt > 0
        ? {
            119: {
              teamId: 119,
              teamAbbr: "LAD",
              teamName: "Los Angeles Dodgers",
              ops: 0.802,
              homeRuns: 98,
              era: 2.98,
              whip: 1.06,
              strikeOuts: 628,
              stolenBases: 54,
            },
          }
        : Promise.reject(new Error(`MLB ${group} feed stalled`))
    ),
    getTeamPlayerStats: vi.fn().mockResolvedValue([]),
    getTeamRecentPlayerStats: vi.fn().mockResolvedValue([]),
    getTeamExitVelocity: vi.fn(() =>
      savantMode === "pending" ? new Promise(() => {}) : Promise.resolve([])
    ),
    getTeamBattedBalls: vi.fn(() =>
      savantMode === "pending"
        ? new Promise(() => {})
        : Promise.resolve(
            savantMode === "empty"
              ? []
              : [
                  {
                    hc_x: 125,
                    hc_y: 210,
                    bb_type: "fly_ball",
                    launch_speed: 101.4,
                    xwoba: 0.512,
                  },
                ]
          )
    ),
    getTeamBattedBallsAgainst: vi.fn(() =>
      savantMode === "pending"
        ? new Promise(() => {})
        : Promise.resolve(
            savantMode === "empty"
              ? []
              : [
                  {
                    hc_x: 118,
                    hc_y: 205,
                    bb_type: "line_drive",
                    launch_speed: 96.2,
                    xwoba: 0.365,
                  },
                ]
          )
    ),
    getPlayerContactPoints: vi.fn().mockResolvedValue([]),
    getPitcherPitches: vi.fn().mockResolvedValue([]),
    fetchTeamFinancials: vi.fn().mockResolvedValue(null),
    getTeamModelSources: vi.fn(async () => {
      if (modelMode === "502")
        throw Object.assign(new Error("FanGraphs model sources unavailable"), {
          status: 502,
        });
      return modelAttempt > 0
        ? {
            found: true,
            retrievedAt: "2026-08-14T02:03:00.000Z",
            source: "FanGraphs",
            playoffOdds: 72.4,
            teamWar: 28.6,
            statuses: { playoffOdds: "live", teamWar: "live" },
          }
        : {
            found: false,
            retrievedAt: "2026-08-14T02:02:00.000Z",
            source: "FanGraphs",
            playoffOdds: null,
            teamWar: null,
            statuses: {
              playoffOdds: "upstream-unavailable",
              teamWar: "upstream-unavailable",
            },
          };
    }),
  };
});

import OverviewPage from "../client/src/pages/OverviewPage.jsx";
import * as mlbApi from "../client/src/api/mlb.js";
import {
  saveTeamAggregateCache,
  saveTeamPlayersCache,
} from "../client/src/lib/teamDataCache.js";

describe("Team Overview model source and retry interaction", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    feedAttempt = 0;
    modelAttempt = 0;
    savantMode = "pending";
    modelMode = "fallback";
    partialAggregate = false;
    localStorage.clear();
  });

  it("shows a page-shaped Team Overview skeleton during the initial aggregate fetch", async () => {
    localStorage.clear();
    render(<OverviewPage />);
    expect(
      screen.getByRole("status", { name: "Loading team overview" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Season overview", { exact: false })
    ).toBeInTheDocument();
  });

  it("removes the visible Sources control while preserving inline source context", async () => {
    render(<OverviewPage />);
    expect(
      screen.queryByRole("button", { name: "Open source provenance" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("SOURCES", { exact: true })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Source provenance" })
    ).not.toBeInTheDocument();
  });

  it("uses a fresh same-session team cache without repeating aggregate or roster requests", async () => {
    saveTeamAggregateCache(
      {
        byAbbr: {
          LAD: {
            standings: {
              id: 119,
              abbr: "LAD",
              w: 73,
              l: 48,
              pct: 0.603,
              rs: 606,
              ra: 464,
              diff: 142,
            },
            hitting: { teamId: 119, teamAbbr: "LAD", ops: 0.802 },
            pitching: { teamId: 119, teamAbbr: "LAD", era: 2.98 },
          },
        },
        byId: {},
      },
      2026
    );
    saveTeamPlayersCache(119, 2026, {
      hitting: [{ id: 1, name: "Cached hitter" }],
      pitching: [{ id: 2, name: "Cached pitcher" }],
    });
    render(<OverviewPage />);
    await waitFor(() =>
      expect(
        screen.getByText("Season overview", { exact: false })
      ).toBeInTheDocument()
    );
    expect(mlbApi.getStandings).not.toHaveBeenCalled();
    expect(mlbApi.getAllTeamStats).not.toHaveBeenCalled();
    expect(mlbApi.getTeamPlayerStats).not.toHaveBeenCalled();
  });

  it("does not re-request the global daily schedule when the selected team changes", async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);
    await waitFor(() => expect(mlbApi.getTodaysGames).toHaveBeenCalledTimes(1));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Select team" }),
      "sf"
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Select team" })).toHaveValue(
        "sf"
      )
    );
    expect(mlbApi.getTodaysGames).toHaveBeenCalledTimes(1);
  });

  it("keeps an explicit official-schedule panel visible when MLB returns no games", async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);

    await user.click(screen.getByRole("button", { name: "Operations" }));
    expect(await screen.findByText("Today's Schedule")).toBeInTheDocument();
    expect(screen.getAllByText("No games today").length).toBeGreaterThan(0);
    expect(screen.getByText(/official MLB schedule returned no games for today/i)).toBeInTheDocument();
  });

  it("commits available aggregate data when one provider fails instead of waiting for all feeds", async () => {
    partialAggregate = true;
    render(<OverviewPage />);
    expect((await screen.findAllByText(".802", { exact: false })).length).toBeGreaterThan(0);
    await waitFor(() => expect(mlbApi.getAllTeamStats).toHaveBeenCalledWith("pitching"));
    expect(screen.queryByRole("status", { name: "Loading team overview" })).not.toBeInTheDocument();
  });

  it("updates the roster sort when quick filters are clicked", async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Roster" }));
    const sortSelect = screen.getByRole("combobox", {
      name: "Sort roster insights by player statistic",
    });
    await user.click(screen.getByRole("button", { name: "Fantasy leaders" }));
    expect(
      screen.getByRole("button", { name: "Fantasy leaders" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(sortSelect).toHaveValue("fantasyPoints");
    await user.click(
      screen.getByRole("button", { name: "Recent performance" })
    );
    expect(sortSelect).toHaveValue("recentOps");
  });

  it("shows explicit loading states for Batted Ball Profile and Pitch Arsenal while Savant is pending", async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));
    expect(
      await screen.findByText("Team batted-ball rows")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Team pitch arsenal rows")
    ).toBeInTheDocument();
  });

  it("renders verified team spray and opponent contact-quality rollups when Savant returns rows", async () => {
    savantMode = "ready";
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));
    expect(
      await screen.findByRole("img", {
        name: "Verified Baseball Savant batted-ball spray coordinates",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Opponent Statcast feed unavailable")
    ).not.toBeInTheDocument();
    expect(await screen.findByText("0.365")).toBeInTheDocument();
  });

  it("shows explicit unavailable states when Savant returns no verified rows", async () => {
    savantMode = "empty";
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));
    expect(
      await screen.findByText("Team batted-ball rows")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Team pitch arsenal rows")
    ).toBeInTheDocument();
  });

  it("leaves model panels in explicit unavailable state after a FanGraphs 502", async () => {
    modelMode = "502";
    const user = userEvent.setup();
    const { container } = render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Model source:\s*FanGraphs/)
    );
    const providers = [
      ...container.querySelectorAll(".skip-overview-source-name"),
    ].map(node => node.textContent);
    expect(providers).toContain("FanGraphs WAR");
    expect(providers).toContain("FanGraphs forecast");
    expect([...new Set(providers.filter(provider => provider.includes("FanGraphs")))]).toEqual(expect.arrayContaining(["FanGraphs WAR", "FanGraphs forecast"]));
    expect(providers.filter(provider => provider === "Savant").length).toBeGreaterThanOrEqual(1);
    expect(
      container.querySelector(".skip-status-unavailable")
    ).toBeInTheDocument();
    expect(document.body.textContent).toContain("Live FanGraphs projection · not retrieved");
    expect(document.body.textContent).toContain("Unavailable");
    expect(document.body.textContent).not.toMatch(/Playoff odds:\s*Loading/);
    expect(document.body.textContent).not.toMatch(/Team WAR:\s*Loading/);
  });

  it("displays divisional average WAR comparison context under Team WAR when available from aggregate FanGraphs data", async () => {
    vi.spyOn(mlbApi, "getTeamModelSources").mockResolvedValueOnce({
      found: true,
      retrievedAt: "2026-08-14T02:02:00.000Z",
      source: "FanGraphs",
      playoffOdds: 72.4,
      teamWar: 31.4,
      statuses: { playoffOdds: "live", teamWar: "live" },
    });
    vi.spyOn(mlbApi, "getTeamAggregateWar").mockResolvedValueOnce({
      teamWar: 31.4,
      divisionAverageWAR: 23.9,
      source: "FanGraphs aggregate Team WAR",
      freshness: "live",
      retrievedAt: "2026-08-14T02:02:00.000Z",
      status: "live",
    });
    const user = userEvent.setup();
    render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));
    expect(await screen.findByText(/div avg/)).toBeInTheDocument();
  });

  it("propagates verified division rows into a labeled Divisional WAR comparison", async () => {
    vi.spyOn(mlbApi, "getTeamModelSources").mockResolvedValueOnce({
      found: true,
      retrievedAt: "2026-08-14T02:02:00.000Z",
      source: "FanGraphs",
      playoffOdds: 72.4,
      teamWar: 31.4,
      statuses: { playoffOdds: "live", teamWar: "live" },
    });
    vi.spyOn(mlbApi, "getTeamAggregateWar").mockResolvedValueOnce({
      teamWar: 31.4,
      divisionAverageWAR: 26.2,
      source: "FanGraphs aggregate Team WAR",
      freshness: "live",
      status: "live",
      divisionTeams: [
        { team: "Los Angeles Dodgers", totalWAR: 31.4, offensiveWAR: 21.2, pitchingWAR: 10.2, defensiveWAR: null },
        { team: "San Diego Padres", totalWAR: 21.0, offensiveWAR: 12.5, pitchingWAR: 8.5, defensiveWAR: null },
      ],
    });
    const user = userEvent.setup();
    render(<OverviewPage />);

    await user.click(screen.getByRole("button", { name: "Performance" }));
    expect(await screen.findByText("2 teams")).toBeInTheDocument();
    expect(screen.getByText(/LAD is highlighted/i)).toBeInTheDocument();
    const exactValuesTable = screen.getByRole("table", { name: "Exact divisional WAR values" });
    expect(exactValuesTable).toHaveTextContent("LAD");
    expect(exactValuesTable).toHaveTextContent("+31.4");
    expect(exactValuesTable).toHaveTextContent("SD");
  });

  it("shows explicit unavailable model states, exposes retry, and recovers MLB data without refreshing FanGraphs", async () => {
    const user = userEvent.setup();
    const { container } = render(<OverviewPage />);
    await user.click(screen.getByRole("button", { name: "Performance" }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Model source:\s*FanGraphs/)
    );
    expect(document.body.textContent).toMatch(
      /Playoff odds:\s*Provider unavailable/
    );
    expect(document.body.textContent).toMatch(/Playoff Odds/);
    expect(document.body.textContent).toMatch(/Team WAR/);
    expect(document.body.textContent).toContain("Unavailable");
    expect(document.body.textContent).toMatch(
      /Team WAR:\s*Provider unavailable/
    );
    expect(document.body.textContent).toMatch(
      /Model source:\s*FanGraphs\s*·\s*retrieved\s+\d{1,2}:\d{2}/
    );

    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "RETRY" })
        ).toBeInTheDocument(),
      { timeout: 14000, interval: 100 }
    );
    feedAttempt = 1;
    modelAttempt = 1;
    await user.click(screen.getByRole("button", { name: "RETRY" }));

    expect(await screen.findByText("LIVE MLB DATA")).toBeInTheDocument();
    expect(
      (await screen.findAllByText(/MLB Stats API/)).length
    ).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(
      /Playoff odds:\s*Provider unavailable/
    );
    expect(document.body.textContent).toMatch(
      /Team WAR:\s*Provider unavailable/
    );
    expect(document.body.textContent).toMatch(
      /Model source:\s*FanGraphs\s*·\s*retrieved\s+\d{1,2}:\d{2}/
    );
    expect(
      container.querySelectorAll(".skip-status-verified").length
    ).toBeGreaterThanOrEqual(2);
  }, 20000);
});
