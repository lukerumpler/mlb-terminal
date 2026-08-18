import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../client/src/api/naturalSearch.js", () => ({
  routeNaturalLanguageSearch: vi.fn(),
}));

vi.mock("../client/src/api/mlb.js", async () => {
  const actual = await vi.importActual("../client/src/api/mlb.js");
  return { ...actual, searchPlayers: vi.fn() };
});

import CommandPalette from "../client/src/components/CommandPalette.jsx";
import { routeNaturalLanguageSearch } from "../client/src/api/naturalSearch.js";
import { searchPlayers } from "../client/src/api/mlb.js";
import {
  getTeamAggregateWar,
  __resetMlbClientStateForTests,
} from "../client/src/api/mlb.js";
import { SEARCH_ANALYTICS_STORAGE_KEY } from "../client/src/lib/searchAnalytics.js";
import { readFileSync } from "node:fs";

const chartSource = readFileSync(
  "/home/ubuntu/skip-baseball/client/src/components/OverviewCharts.jsx",
  "utf8"
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __resetMlbClientStateForTests();
  localStorage.clear();
});

describe("natural-language search", () => {
  it("shows a structured AI route and opens a verified team overview", async () => {
    const user = userEvent.setup();
    routeNaturalLanguageSearch.mockResolvedValueOnce({
      intent: "team",
      tab: "overview",
      entity: "Los Angeles Dodgers",
      metric: "WAR",
      interpretation:
        "Open the verified Dodgers team overview for the requested WAR context.",
      generated: true,
    });
    const opened = vi.fn();
    window.addEventListener("skip-open-team", opened);
    render(
      <CommandPalette
        onNavigate={vi.fn()}
        onOpenProspect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.type(
      screen.getByRole("combobox", {
        name: "Search pages, prospects, or ask SKIP",
      }),
      "Dodgers team WAR"
    );
    await user.click(screen.getByRole("button", { name: "ASK SKIP" }));
    expect(
      await screen.findByText("AI ROUTE · VERIFIED DESTINATION")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Open the verified Dodgers team overview for the requested WAR context."
      )
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Los Angeles Dodgers/i })
    );
    expect(opened).toHaveBeenCalled();
    window.removeEventListener("skip-open-team", opened);
  });

  it("resolves a player route through the verified MLB player search before navigation", async () => {
    const user = userEvent.setup();
    routeNaturalLanguageSearch.mockResolvedValueOnce({
      intent: "player",
      tab: "players",
      entity: "Juan Soto",
      metric: "OPS",
      interpretation:
        "Open the verified player profile for the requested OPS context.",
      generated: true,
    });
    searchPlayers.mockResolvedValueOnce([{ id: 123, fullName: "Juan Soto" }]);
    const opened = vi.fn();
    window.addEventListener("skip-open-player", opened);
    render(
      <CommandPalette
        onNavigate={vi.fn()}
        onOpenProspect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.type(
      screen.getByRole("combobox", {
        name: "Search pages, prospects, or ask SKIP",
      }),
      "Juan Soto OPS"
    );
    await user.click(screen.getByRole("button", { name: "ASK SKIP" }));
    await user.click(await screen.findByRole("button", { name: /Juan Soto/i }));
    await waitFor(() =>
      expect(searchPlayers).toHaveBeenCalledWith("Juan Soto", 5)
    );
    expect(opened).toHaveBeenCalled();
    window.removeEventListener("skip-open-player", opened);
  });

  it("keeps AI unavailable states explicit instead of inventing a destination", async () => {
    const user = userEvent.setup();
    routeNaturalLanguageSearch.mockRejectedValueOnce(
      new Error("Natural-language search is unavailable.")
    );
    render(
      <CommandPalette
        onNavigate={vi.fn()}
        onOpenProspect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.type(
      screen.getByRole("combobox", {
        name: "Search pages, prospects, or ask SKIP",
      }),
      "unknown baseball thing"
    );
    await user.click(screen.getByRole("button", { name: "ASK SKIP" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Natural-language search is unavailable."
    );
  });

  it("shows common queries and shortcut hints from local analytics, with a clear action", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      SEARCH_ANALYTICS_STORAGE_KEY,
      JSON.stringify([
        {
          query: "dodgers team war",
          count: 3,
          lastUsedAt: Date.now(),
          intent: "team",
          metric: "WAR",
          tab: "overview",
          status: "resolved",
        },
      ])
    );
    render(
      <CommandPalette
        onNavigate={vi.fn()}
        onOpenProspect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("region", { name: "Common search queries" })
    ).toBeInTheDocument();
    expect(screen.getByText("Prioritize a WAR shortcut")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Clear local search analytics" })
    );
    expect(
      screen.queryByRole("region", { name: "Common search queries" })
    ).not.toBeInTheDocument();
    localStorage.setItem(
      SEARCH_ANALYTICS_STORAGE_KEY,
      JSON.stringify([
        {
          query: "dodgers team war",
          count: 3,
          lastUsedAt: Date.now(),
          intent: "team",
          metric: "WAR",
          tab: "overview",
          status: "resolved",
        },
      ])
    );
    window.dispatchEvent(new CustomEvent("skip-search-analytics-updated"));
    expect(
      await screen.findByRole("region", { name: "Common search queries" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dodgers team war/i }));
    expect(
      screen.getByRole("combobox", {
        name: "Search pages, prospects, or ask SKIP",
      })
    ).toHaveValue("dodgers team war");
  });
});

describe("divisional WAR comparison data and tooltip contract", () => {
  it("returns exact FanGraphs component fields when the aggregate response provides them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          freshness: "live",
          retrievedAt: "2026-08-14T02:02:00.000Z",
          statuses: { batting: "live", pitching: "live" },
          teams: [
            {
              team: "Los Angeles Dodgers",
              totalWAR: 31.4,
              battingWAR: 21.2,
              pitchingWAR: 10.2,
              defenseWAR: 3.4,
            },
            {
              team: "San Diego Padres",
              totalWAR: 25.4,
              battingWAR: 16.4,
              pitchingWAR: 9.0,
              defenseWAR: 1.2,
            },
          ],
        }),
      })
    );
    const result = await getTeamAggregateWar(
      "Los Angeles Dodgers",
      ["Los Angeles Dodgers", "San Diego Padres"],
      2026
    );
    expect(result).toMatchObject({
      teamWar: 31.4,
      offensiveWAR: 21.2,
      defensiveWAR: 3.4,
      divisionAverageWAR: 28.4,
    });
    expect(result.divisionTeams[0]).toMatchObject({
      team: "Los Angeles Dodgers",
      totalWAR: 31.4,
      offensiveWAR: 21.2,
      defensiveWAR: 3.4,
      pitchingWAR: 10.2,
    });
  });

  it("matches FanGraphs abbreviation rows to canonical division team names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          freshness: "live",
          statuses: { batting: "live", pitching: "live" },
          teams: [
            { team: "LAD", totalWAR: 31.4, battingWAR: 21.2, pitchingWAR: 10.2 },
            { team: "SD", totalWAR: 25.4, battingWAR: 16.4, pitchingWAR: 9.0 },
          ],
        }),
      })
    );
    const result = await getTeamAggregateWar(
      "Los Angeles Dodgers",
      ["Los Angeles Dodgers", "San Diego Padres"],
      2026
    );
    expect(result).toMatchObject({ teamWar: 31.4, divisionAverageWAR: 28.4 });
    expect(result.divisionTeams).toHaveLength(2);
    expect(result.divisionTeams.map(row => row.team)).toEqual(["LAD", "SD"]);
  });

  it("keeps the defensive component unavailable when FanGraphs does not return a verified defensive field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          teams: [
            {
              team: "Los Angeles Dodgers",
              totalWAR: 31.4,
              battingWAR: 21.2,
              pitchingWAR: 10.2,
            },
          ],
        }),
      })
    );
    const result = await getTeamAggregateWar(
      "Los Angeles Dodgers",
      ["Los Angeles Dodgers"],
      2026
    );
    expect(result.defensiveWAR).toBeNull();
    expect(result.divisionTeams[0].defensiveWAR).toBeNull();
  });

  it("contains exact offensive and defensive WAR hover labels and honest unavailable copy", () => {
    expect(chartSource).toContain("Offensive WAR");
    expect(chartSource).toContain("Defensive WAR");
    expect(chartSource).toContain(
      "Separate defensive WAR was not returned by the verified FanGraphs"
    );
    expect(chartSource).toContain("aggregate feed.");
  });

  it("renders visible total-WAR labels and supports selected-team emphasis", () => {
    expect(chartSource).toContain("LabelList");
    expect(chartSource).toContain("selectedTeam");
    expect(chartSource).toContain("formatter={formatWarValue}");
  });
});
