import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  buildReconciliationRows,
  buildDataQualityPayload,
  buildDataQualityCsv,
  buildTeamDataQualityPayload,
  buildTeamDataQualityCsv,
} from "../client/src/lib/dataQuality.js";
import DataSourceStatusCenter from "../client/src/components/DataSourceStatusCenter.jsx";
import { filterAndSortNcaaGames } from "../client/src/pages/OtherPages.jsx";
import { filterAndSortBoxscoreGames } from "../client/src/pages/PlayersPage.jsx";

describe("data-quality reconciliation and export helpers", () => {
  it("classifies verified aggregate and boxscore metrics without inventing missing values", () => {
    const rows = buildReconciliationRows({
      aggregate: {
        avg: 0.3,
        obp: 0.36,
        slg: 0.5,
        ops: 0.86,
        homeRuns: 20,
        plateAppearances: 300,
      },
      boxscore: {
        avg: 0.3,
        obp: 0.358,
        slg: 0.5,
        ops: 0.858,
        homeRuns: 19,
        plateAppearances: 295,
      },
      isPitcher: false,
    });
    expect(rows.find(row => row.metric === "AVG").status).toBe("match");
    expect(rows.find(row => row.metric === "OBP").status).toBe("variance");
    expect(rows.find(row => row.metric === "Home Runs").variance).toBe(-1);
    const incomplete = buildReconciliationRows({
      aggregate: { era: 3.4 },
      boxscore: { era: null },
      isPitcher: true,
    });
    expect(
      incomplete.every(row =>
        ["incomplete", "match", "variance"].includes(row.status)
      )
    ).toBe(true);
    expect(incomplete.find(row => row.metric === "ERA").status).toBe(
      "incomplete"
    );
  });

  it("includes source and freshness metadata in both structured and CSV exports", () => {
    const payload = buildDataQualityPayload({
      player: {
        id: 7,
        fullName: "Verified Player",
        statSeason: 2026,
        stats: {},
        aggregateRetrievedAt: "2026-08-15T00:00:00.000Z",
        boxscoreSplits: {
          retrievedAt: "2026-08-15T00:05:00.000Z",
          source: "MLB Stats API boxscores",
          games: 12,
          requestedGames: 20,
        },
      },
      rows: [
        {
          metric: "OPS",
          aggregate: 0.8,
          boxscore: 0.79,
          variance: -0.01,
          status: "variance",
        },
      ],
    });
    const csv = buildDataQualityCsv(payload);
    expect(payload.sources.aggregate.retrievedAt).toContain("2026-08-15");
    expect(payload.sources.boxscore.games).toBe(12);
    expect(csv).toContain("aggregate_retrieved_at");
    expect(csv).toContain("Verified Player");
    expect(csv).toContain("variance");
  });

  it("exports current team metrics with separate source timestamps", () => {
    const payload = buildTeamDataQualityPayload({
      team: {
        id: 119,
        abbr: "LAD",
        name: "Los Angeles Dodgers",
        season: 2026,
        ops: 0.755,
        era: 3.4,
        hr: 122,
      },
      liveTeamDataUpdatedAt: "2026-08-15T00:00:00.000Z",
      teamPlayersUpdatedAt: "2026-08-15T00:01:00.000Z",
      teamModelData: {
        teamWar: 28.6,
        source: "FanGraphs",
        retrievedAt: "2026-08-15T00:02:00.000Z",
        freshness: "live",
      },
      teamSavantData: {
        exitVelocity: 89.4,
        source: "Baseball Savant",
        retrievedAt: "2026-08-15T00:03:00.000Z",
      },
    });
    const csv = buildTeamDataQualityCsv(payload);
    expect(payload.team.name).toBe("Los Angeles Dodgers");
    expect(payload.sources.teamModels.retrievedAt).toContain("00:02");
    expect(csv).toContain("teamWar");
    expect(csv).toContain("FanGraphs");
    expect(csv).toContain("2026-08-15T00:03:00.000Z");
  });
});

describe("date/team navigation helpers", () => {
  it("filters and sorts NCAA games by date and team", () => {
    const games = [
      {
        startDate: "2026-05-03",
        away: { name: "Beta" },
        home: { name: "Alpha" },
      },
      {
        startDate: "2026-05-01",
        away: { name: "Gamma" },
        home: { name: "Delta" },
      },
    ];
    expect(filterAndSortNcaaGames(games, { date: "2026-05-03" })).toHaveLength(
      1
    );
    expect(filterAndSortNcaaGames(games, { team: "delta" })[0].away.name).toBe(
      "Gamma"
    );
    expect(
      filterAndSortNcaaGames(games, { sort: "date-asc" })[0].startDate
    ).toBe("2026-05-01");
  });
  it("filters and sorts MLB boxscore games by date and opponent", () => {
    const games = [
      {
        date: "2026-05-03T00:00:00Z",
        opponent: "Beta",
        batting: { ops: 0.81 },
      },
      {
        date: "2026-05-01T00:00:00Z",
        opponent: "Alpha",
        batting: { ops: 0.72 },
      },
    ];
    expect(
      filterAndSortBoxscoreGames(games, { date: "2026-05-01" })[0].opponent
    ).toBe("Alpha");
    expect(
      filterAndSortBoxscoreGames(games, { team: "beta", sort: "team-desc" })[0]
        .batting.ops
    ).toBe(0.81);
  });
});

describe("data-source status center", () => {
  it("shows independent providers and dispatches only the selected retry event", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    window.addEventListener("skip-provider-retry", retry);
    render(
      <DataSourceStatusCenter
        settings={{ enabled: true, displayMode: "relative" }}
        successes={{}}
      />
    );
    expect(screen.getByText("MLB Stats API")).toBeInTheDocument();
    expect(screen.getByText("MLB boxscore feed")).toBeInTheDocument();
    expect(screen.getByText("NCAA feed")).toBeInTheDocument();
    expect(screen.getByText("FanGraphs")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry FanGraphs" }));
    expect(
      screen.getByText("Waiting for provider response…")
    ).toBeInTheDocument();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].detail.provider).toBe("fangraphs");
    window.dispatchEvent(
      new CustomEvent("skip-provider-retry-error", {
        detail: {
          provider: "fangraphs",
          message: "FanGraphs is temporarily unavailable.",
        },
      })
    );
    expect(
      await screen.findByText(/FanGraphs is temporarily unavailable/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry NCAA feed" }));
    expect(retry.mock.calls[1][0].detail.provider).toBe("ncaa");
    await user.click(
      screen.getByRole("button", { name: "Retry MLB boxscore feed" })
    );
    expect(retry.mock.calls[2][0].detail.provider).toBe("boxscore");
    expect(retry).toHaveBeenCalledTimes(3);
    window.removeEventListener("skip-provider-retry", retry);
  });
});
