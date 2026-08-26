import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../client/src/App.jsx";
import {
  buildComparisonMetricSummary,
  buildCrossTeamComparisonRows,
  buildIntelligenceLeaderPanelModel,
  IntelligenceLiveLeaderPanel,
} from "../client/src/pages/OtherPages.jsx";

vi.mock("../client/src/hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, isLoggedIn: false, isLoading: false }),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    notes: {
      sync: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

async function goToTab(user, label, waitForText) {
  render(<App />);
  const groupedTabs = {
    Draft: { workspace: "Talent", tab: "Draft Board" },
    AMD: { workspace: "Intelligence", tab: "AMD / IMD" },
  };
  const grouped = groupedTabs[label];
  if (grouped) {
    await user.click(await screen.findByTitle(grouped.workspace));
    await user.click(await screen.findByRole("tab", { name: grouped.tab }));
  } else {
    const navButton = await screen.findByRole("button", {
      name: new RegExp(label),
    });
    await user.click(navButton);
  }
  await screen.findByText(waitForText, {}, { timeout: 8000 });
}

describe("Cross-team comparison helpers", () => {
  it("filters by team and division and sorts the selected verified metric", () => {
    const teams = {
      one: { id:1, name:"Alpha Club", abbr:"ALP" },
      two: { id:2, name:"Beta Club", abbr:"BET" },
      three: { id:3, name:"Gamma Club", abbr:"GAM" },
    };
    const rows = buildCrossTeamComparisonRows({
      teams,
      standings:{ East:[{ id:1, wins:80, losses:50 }, { id:2, wins:70, losses:60 }], West:[{ id:3, wins:65, losses:65 }] },
      teamStats:{ hitting:{ 1:{ ops:.820 }, 2:{ ops:.740 }, 3:{ ops:.790 } }, pitching:{} },
      metric:"ops",
      search:"club",
      division:"East",
      direction:"desc",
    });
    expect(rows.map(row => row.name)).toEqual(["Alpha Club", "Beta Club"]);
    expect(rows.map(row => row.value)).toEqual([.820, .740]);
    expect(buildCrossTeamComparisonRows({ teams, standings:{ East:[{ id:1 }, { id:2 }] }, teamStats:{ hitting:{ 1:{ ops:.820 }, 2:{ ops:.740 } }, pitching:{} }, metric:"ops", direction:"asc" }).map(row => row.name)).toEqual(["Beta Club", "Alpha Club"]);
    expect(buildCrossTeamComparisonRows({ teams, standings:{ East:[{ id:1 }] }, teamStats:{ hitting:{ "1":{ ops:.910 } }, pitching:{} }, metric:"ops" })[0].value).toBe(.910);
  });

  it("excludes missing comparison metrics while preserving real zeroes and lower-is-better logic", () => {
    expect(buildComparisonMetricSummary([
      ["HR", "0", "5", 0, 5],
      ["OPS", "—", ".900", null, .9],
      ["K", "20", "10", 20, 10, true],
      ["BB", "12", "12", 12, 12],
    ])).toMatchObject({ compared:3, firstWins:0, secondWins:2, ties:1, unavailable:1, secondLabels:["HR", "K"] });
  });
});

describe("Draft page", () => {
  it("searches the draft class pool without crashing", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Draft", /2026 Draft Class/);

    const search = screen.getByPlaceholderText(/Search by name or school/i);
    await user.type(search, "Roch");

    await waitFor(() => {
      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    });
    expect(
      global.__consoleErrors.filter(e => !e.includes("network unavailable"))
        .length
    ).toBe(0);
  });

  it("clears the search and still renders the full pool", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Draft", /2026 Draft Class/);

    const search = screen.getByPlaceholderText(/Search by name or school/i);
    await user.type(search, "zzzzznomatch");
    await user.clear(search);

    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it("filters the SKIP Big Board by position and sorts by rank or position", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Draft", /2026 Draft Class/);

    const positionFilter = screen.getByRole("combobox", {
      name: /Filter Draft board by position/i,
    });
    const sortControl = screen.getByRole("combobox", {
      name: /Sort Draft board/i,
    });

    await user.selectOptions(positionFilter, "RHP");
    const boardTable = screen.getAllByRole("table")[0];
    expect(within(boardTable).getByText("Jackson Flora")).toBeInTheDocument();
    expect(within(boardTable).queryByText("Roch Cholowsky")).toBeNull();

    await user.selectOptions(sortControl, "rank-desc");
    expect(screen.getByText(/SKIP rank · 100 → 1/)).toBeInTheDocument();
    await user.selectOptions(sortControl, "position");
    expect(screen.getByText(/Position · A → Z/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe("Knowledge page", () => {
  it("cycles through every knowledge tab without crashing", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = await screen.findByTitle("Intelligence");
    await user.click(navButton);
    await user.click(await screen.findByRole("tab", { name: "Knowledge" }));
    await screen.findByRole(
      "button",
      { name: /^Game Theory$/ },
      { timeout: 8000 }
    );

    const tabLabels = [
      "Behavioral Biases",
      "Draft Intel",
      "Future Value",
      "Grade Rubric",
      "Projections",
      "Leadership Model",
      "Game Theory",
    ];
    for (const label of tabLabels) {
      const btn = screen.getByRole("button", {
        name: new RegExp(`^${label}$`),
      });
      await user.click(btn);
      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    }
    expect(
      global.__consoleErrors.filter(e => !e.includes("network unavailable"))
        .length
    ).toBe(0);
  });
});

describe("Intelligence page", () => {
  it("exposes source, freshness, and live-leader provenance metadata", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Intelligence", /Player Comparison Engine/i);
    const provenance = screen.getByRole("region", { name: "Intelligence data provenance" });
    expect(provenance).toHaveTextContent(/MLB Stats API.*on demand/i);
    expect(provenance).toHaveTextContent(/Retrieved only when compared/i);
    expect(provenance).toHaveTextContent(/League leaders.*MLB Stats API/i);
    expect(screen.getByText(/Live Hitter Leaders — OPS/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Pitcher Leaders — ERA/i)).toBeInTheDocument();
    expect(screen.queryByText("Injury Risk Model")).toBeNull();
    expect(screen.queryByText("Trade Value Simulator")).toBeNull();
    expect(screen.getByText(/Live leader rows use current-season MLB Stats API returns/i)).toBeInTheDocument();
  });

  it("models verified leader rows and explicit unavailable states without a fabricated WAR field", () => {
    const leaders = {
      onBasePlusSlugging: [
        { id: 1, rank: 1, name: "Verified Hitter", team: "SD", value: ".999" },
        { id: 2, rank: 2, name: "Zero Is Valid", team: "NYM", value: "0" },
      ],
    };
    expect(buildIntelligenceLeaderPanelModel(leaders, "onBasePlusSlugging", "ready")).toEqual({
      category: "onBasePlusSlugging",
      state: "ready",
      rows: leaders.onBasePlusSlugging,
    });
    expect(buildIntelligenceLeaderPanelModel(leaders, "earnedRunAverage", "unavailable")).toEqual({
      category: "earnedRunAverage",
      state: "unavailable",
      rows: [],
    });
  });

  it("renders an explicit unavailable state when the live leader provider fails", () => {
    render(
      <IntelligenceLiveLeaderPanel
        title="Live Hitter Leaders — OPS"
        accent="#2A7B6B"
        model={buildIntelligenceLeaderPanelModel({}, "onBasePlusSlugging", "unavailable")}
      />
    );
    expect(
      screen.getByText(/Current-season MLB leader data is unavailable right now/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Aaron Judge/i)).toBeNull();
  });

  it("rejects comparing a player against themselves", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Intelligence", /Player Comparison Engine/i);

    const inputs = document.querySelectorAll(
      'input[type="text"], input:not([type])'
    );
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    await user.type(inputs[0], "Aaron Judge");
    await user.type(inputs[1], "Aaron Judge");

    const compareBtn = screen.getByRole("button", { name: /Compare/i });
    await user.click(compareBtn);

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/different players/i);
    });
  });

  it("shows the notable-trades table and success-rate chart, sortable, without crashing (Roadmap #5)", async () => {
    const user = userEvent.setup();
    await goToTab(user, "Intelligence", /Player Comparison Engine/i);

    await screen.findByText(/Notable Trades — High-End Starting Pitchers/i);
    expect(
      screen.getByText(/Team Success Rate — Notable Deadline Trades/i)
    ).toBeInTheDocument();

    // Real, known trade — confirms the dataset actually rendered, not just the panel shell.
    expect(screen.getByText(/Justin Verlander/i)).toBeInTheDocument();

    // Sorting by netWAR (including toggling direction on a second click)
    // shouldn't crash the table.
    const netWarHeader = screen.getByRole("button", { name: /^Historical netWAR/ });
    await user.click(netWarHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    await user.click(netWarHeader);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    expect(
      global.__consoleErrors.filter(e => !e.includes("network unavailable"))
        .length
    ).toBe(0);
  });
});

describe("AMD page", () => {
  it("renders without crashing", async () => {
    const user = userEvent.setup();
    await goToTab(user, "AMD", /Metric Overview/);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it("marks the leaderboard/scatter/spotlight/pitch-breakdown panels as illustrative, and does not let the pitch-type-breakdown panel silently rename itself after a different leaderboard row", async () => {
    // Regression test for a real title/content mismatch bug: this panel's
    // title used to interpolate the currently-selected leaderboard player
    // (`AMD by Pitch Type — ${spotlight?.name}`) while its chart data and
    // caption stayed hardcoded to Luis Arraez — so clicking, say, Freddie
    // Freeman in the leaderboard relabeled the panel with his name while
    // still describing Arraez's (fabricated) pitch-type tendencies. Fixed
    // by making the title a static, honestly-labeled example instead of a
    // false promise that it reacts to the click above.
    const user = userEvent.setup();
    await goToTab(user, "AMD", /Metric Overview/);

    // Illustrative labeling present on every panel using fixed example data.
    expect(
      screen.getByText(/AMD\+ Hitter Leaders — 2026 \(Illustrative\)/)
    ).toBeTruthy();
    expect(
      screen.getByText("AMD by Pitch Type — Example: Luis Arraez")
    ).toBeTruthy();
    expect(screen.getByText(/AMD\+ Spotlight \(Illustrative\)/)).toBeTruthy();

    // Click a different leaderboard row — the spotlight panel should update.
    // (The scatter chart below also renders an off-screen a11y <text> per
    // point using the same player names, so there's more than one
    // "Freddie Freeman" node even before anything is clicked — pick the
    // clickable leaderboard row specifically, not just the first match.)
    const leaderboardRow = screen
      .getAllByText("Freddie Freeman")
      .find(el => el.tagName.toLowerCase() === "span");
    expect(leaderboardRow).toBeTruthy();
    await user.click(leaderboardRow);
    await waitFor(() => {
      expect(screen.getByText(/AMD\+ Spotlight \(Illustrative\)/)).toBeTruthy();
      // Spotlight big name (17px header) confirms the click landed.
      const nameEls = screen.getAllByText("Freddie Freeman");
      expect(nameEls.some(el => el.style.fontSize === "17px")).toBe(true);
    });

    // ...but the pitch-type-breakdown panel's title must stay the fixed example,
    // not silently relabel itself to the newly-clicked player.
    expect(
      screen.getByText("AMD by Pitch Type — Example: Luis Arraez")
    ).toBeTruthy();
    expect(
      screen.queryByText(/AMD by Pitch Type — Freddie Freeman/)
    ).toBeNull();

    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe("League page", () => {
  it("renders standings without crashing", async () => {
    const user = userEvent.setup();
    await goToTab(user, "League", /standings|leaders/i);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

});

describe("Follow List page", () => {
  it("filters by category without crashing", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = document.querySelector(
      '.skip-sidebar button[title="Intel Feed"]'
    );
    expect(navButton).toBeTruthy();
    await user.click(navButton);
    await user.click(
      await screen.findByRole("tab", { name: "Follow List" })
    );
    await screen.findByPlaceholderText(
      /Search by name, handle, or bio/i,
      {},
      { timeout: 8000 }
    );

    const allBtn = screen.getByRole("button", { name: /^All$/i });
    await user.click(allBtn);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe("Scouting Notes page", () => {
  it("renders and filters without crashing", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navButton = await screen.findByRole("button", {
      name: /Scouting Notes/,
    });
    await user.click(navButton);
    await screen.findByPlaceholderText(
      /Search by player or team/i,
      {},
      { timeout: 8000 }
    );
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});

describe("Settings roster defaults", () => {
  it("updates batting and pitching defaults for the Overview roster filters", async () => {
    const user = userEvent.setup();
    localStorage.removeItem("skip-roster-sample-defaults");
    await goToTab(user, "Settings", /Preferences/);

    const battingDefault = screen.getByRole("combobox", {
      name: "Default batting minimum plate appearances",
    });
    const pitchingDefault = screen.getByRole("combobox", {
      name: "Default pitching minimum innings pitched",
    });
    await user.selectOptions(battingDefault, "150");
    await user.selectOptions(pitchingDefault, "30");

    expect(battingDefault).toHaveValue("150");
    expect(pitchingDefault).toHaveValue("30");

    const overviewButton = screen.getByTitle("Overview");
    await user.click(overviewButton);
    // Target the subtab button inside the overview page
    const rosterTab = await screen.findByRole("button", { name: /^Roster$/i });
    await user.click(rosterTab);
    await screen.findByText("AI Scout Insights");
    expect(
      screen.getByRole("combobox", { name: "Minimum plate appearances" })
    ).toHaveValue("150");
  });
});
