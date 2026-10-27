import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEAMS } from "../client/src/constants/data.js";
import { getTeamByAbbr, getTeamLogoUrl, canonicalTeamAbbr, TEAM_ABBR_ALIASES } from "../client/src/lib/teamLookup.js";
import { PROSPECT_BATTERS, PROSPECT_PITCHERS } from "../client/src/constants/data.js";
import TeamLogo from "../client/src/components/TeamLogo.jsx";

// Live record counts from the 2026-10-27 official fullRoster audit.
// WSH returned 253 records but only 252 unique player IDs.
const AUDIT = {
  ARI: [283, 283], ATH: [248, 248], ATL: [245, 245], BAL: [300, 300], BOS: [272, 272],
  CHC: [297, 297], CIN: [278, 278], CLE: [263, 263], COL: [302, 302], CWS: [248, 248],
  DET: [312, 312], HOU: [277, 277], KC: [290, 290], LAA: [240, 240], LAD: [298, 298],
  MIA: [300, 300], MIL: [270, 270], MIN: [257, 257], NYM: [295, 295], NYY: [302, 302],
  PHI: [264, 264], PIT: [287, 287], SD: [289, 289], SEA: [258, 258], SF: [287, 287],
  STL: [238, 238], TB: [280, 280], TEX: [279, 279], TOR: [273, 273], WSH: [253, 252],
};

function fakePlayers(team, records, unique) {
  return Array.from({ length: records }, (_, index) => {
    const id = index < unique ? team.id * 10_000 + index : team.id * 10_000; // trailing records repeat the first ID
    return { id, name: `${team.abbr} Player ${String(index).padStart(3, "0")}`, position: "P", age: 25, bats: "R", throws: "R", rosterStatus: "Active", currentTeamName: team.name };
  });
}

vi.mock("../client/src/api/mlb.js", async () => {
  const actual = await vi.importActual("../client/src/api/mlb.js");
  return { ...actual, getOrganizationRoster: vi.fn(), getAllOrganizationRosters: vi.fn() };
});
import { getOrganizationRoster, getAllOrganizationRosters, dedupeOrganizationPlayers } from "../client/src/api/mlb.js";
import OrganizationRosterDirectory, { statusTone } from "../client/src/components/OrganizationRosterDirectory.jsx";

function rosterRecordFor(team) {
  const [records, unique] = AUDIT[team.abbr];
  const players = dedupeOrganizationPlayers(fakePlayers(team, records, unique));
  // Mix in statuses so the filter has something to filter.
  players.forEach((player, index) => { if (index % 5 === 0) player.rosterStatus = "Injured 60-Day"; else if (index % 7 === 0) player.rosterStatus = "Inactive"; });
  return { organization: team, players, freshness: "live", retrievedAt: Date.now(), source: "MLB Stats API · fullRoster" };
}

describe("team lookup and logos", () => {
  it("resolves all 30 canonical teams to the matching official logo URL", () => {
    const teams = Object.values(TEAMS);
    expect(teams).toHaveLength(30);
    teams.forEach(team => {
      expect(getTeamByAbbr(team.abbr)).toBe(team);
      expect(getTeamLogoUrl(team.abbr)).toBe(`https://www.mlbstatic.com/team-logos/${team.id}.svg`);
    });
    expect(new Set(teams.map(team => team.id)).size).toBe(30);
  });

  it("maps legacy and alternate feed abbreviations, including OAK → ATH", () => {
    expect(canonicalTeamAbbr("oak")).toBe("ATH");
    expect(getTeamLogoUrl("OAK")).toContain("/133.svg");
    Object.entries(TEAM_ABBR_ALIASES).forEach(([alias, canonical]) => {
      expect(getTeamByAbbr(alias)?.abbr).toBe(canonical);
    });
  });

  it("every team used by prospect data has a logo", () => {
    [...PROSPECT_BATTERS, ...PROSPECT_PITCHERS].forEach(prospect => {
      expect(getTeamLogoUrl(prospect.team), prospect.name).toBeTruthy();
    });
  });

  it("renders the Athletics logo image and falls back to a text badge on load error", () => {
    const { container } = render(<TeamLogo abbr="ATH" size={20} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://www.mlbstatic.com/team-logos/133.svg");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText(/Athletics logo unavailable/)).toBeInTheDocument();
  });
});

describe("organization roster dedupe", () => {
  it("keeps the first record per player ID", () => {
    const result = dedupeOrganizationPlayers([{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 1, name: "A dup" }]);
    expect(result.map(player => player.name)).toEqual(["A", "B"]);
  });
});

describe("OrganizationRosterDirectory", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationRoster.mockImplementation(async team => rosterRecordFor(team));
    getAllOrganizationRosters.mockImplementation(async teams => ({
      byOrganization: Object.fromEntries(teams.map(team => [team.key, rosterRecordFor(team)])),
      failures: [],
      requestedCount: teams.length,
    }));
  });

  it("loads the first organization, shows every row via paging, and never exceeds the page size at once", async () => {
    render(<OrganizationRosterDirectory />);
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toHaveTextContent("Showing 100 of 283"));
    expect(document.querySelectorAll("tbody tr")).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: /Show 100 more/ }));
    expect(screen.getByTestId("roster-showing")).toHaveTextContent("Showing 200 of 283");
    fireEvent.click(screen.getByRole("button", { name: /Show all 283/ }));
    expect(screen.getByTestId("roster-showing")).toHaveTextContent("Showing 283 of 283");
    expect(document.querySelectorAll("tbody tr")).toHaveLength(283);
  });

  it("populates all 30 organizations with correct unique counts and no duplicate keys", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<OrganizationRosterDirectory />);
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Load all 30 official rosters/ }));
    await waitFor(() => expect(screen.getByText("30/30")).toBeInTheDocument());

    const expectedTotal = Object.values(AUDIT).reduce((sum, [, unique]) => sum + unique, 0);
    expect(expectedTotal).toBe(8284);
    expect(screen.getByText(expectedTotal.toLocaleString())).toBeInTheDocument();

    const select = screen.getByLabelText("Organization roster");
    for (const team of Object.values(TEAMS)) {
      fireEvent.change(select, { target: { value: Object.keys(TEAMS).find(key => TEAMS[key] === team) } });
      const expected = AUDIT[team.abbr][1];
      await waitFor(() => expect(screen.getByText(`${expected} verified players`)).toBeInTheDocument());
      fireEvent.click(screen.queryByRole("button", { name: /Show all/ }) || document.body);
      expect(document.querySelectorAll("tbody tr")).toHaveLength(expected);
    }
    const duplicateKeyWarnings = errorSpy.mock.calls.filter(call => String(call[0]).includes("same key"));
    expect(duplicateKeyWarnings).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("resets to the first page when the search changes", async () => {
    render(<OrganizationRosterDirectory />);
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
    fireEvent.change(screen.getByLabelText("Search selected organization roster"), { target: { value: "Player 00" } });
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toHaveTextContent("Showing 10 of 10"));
  });

  it("does not retry a failed team in a loop and lets the user retry manually", async () => {
    getOrganizationRoster.mockRejectedValueOnce(new Error("boom"));
    render(<OrganizationRosterDirectory />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(getOrganizationRoster).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/roster did not load/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toBeInTheDocument());
    expect(getOrganizationRoster).toHaveBeenCalledTimes(2);
  });

  it("filters by roster status with counts, and resets the filter when the team changes", async () => {
    render(<OrganizationRosterDirectory />);
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toBeInTheDocument());
    const filter = screen.getByLabelText("Filter roster by status");
    const options = [...filter.querySelectorAll("option")].map(option => option.textContent);
    expect(options[0]).toBe("All statuses (283)");
    expect(options.some(label => label.startsWith("Injured 60-Day ("))).toBe(true);
    fireEvent.change(filter, { target: { value: "Inactive" } });
    const inactive = Number(options.find(label => label.startsWith("Inactive (")).match(/\((\d+)\)/)[1]);
    await waitFor(() => expect(screen.getByTestId("roster-showing")).toHaveTextContent(`Showing ${inactive} of ${inactive}`));
    fireEvent.change(screen.getByLabelText("Organization roster"), { target: { value: "ath" } });
    await waitFor(() => expect(screen.getByLabelText("Filter roster by status")).toHaveValue("all"));
  });
});

describe("statusTone", () => {
  it("does not style Inactive like Active", () => {
    expect(statusTone("Inactive")).toEqual(statusTone("Injured 10-Day"));
    expect(statusTone("Inactive")).not.toEqual(statusTone("Active"));
    expect(statusTone("Active")).not.toEqual(statusTone("Reassigned to Minors"));
  });
});
