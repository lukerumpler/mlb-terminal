import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mocks searchPlayers/loadFullPlayer directly rather than going through
// fetch — PlayersPage.jsx's pickPlayer race condition (fixed 2026-08-11:
// clicking player A then quickly clicking player B before A's slower
// loadFullPlayer() response lands could let A's response resolve after
// B's and silently overwrite B's just-rendered data) needs precise control
// over which of two concurrent requests resolves first, which a real
// network mock can't guarantee deterministically run to run.
const searchPlayers = vi.fn();
const loadFullPlayer = vi.fn();
vi.mock("../client/src/api/mlb.js", () => ({
  searchPlayers: (...args) => searchPlayers(...args),
  loadFullPlayer: (...args) => loadFullPlayer(...args),
}));

const { default: PlayersPage } = await import(
  "../client/src/pages/PlayersPage.jsx"
);

function mockPlayer(id, fullName) {
  return {
    id,
    profile: {
      fullName,
      currentTeam: { name: "New York Mets", abbreviation: "NYM" },
      primaryPosition: { abbreviation: "OF" },
      pitchHand: { code: "R" },
      batSide: { code: "R" },
    },
    savant: {
      est_woba: 0.35,
      avg_hit_speed: 92,
      est_slg: 0.5,
      whiff_percent: 20,
      oz_swing_percent: 28,
    },
    batTracking: { avg_bat_speed: 72 },
    expectedStatisticsPopulation: [
      { est_woba: 0.28, est_slg: 0.4 },
      { est_woba: 0.32, est_slg: 0.46 },
      { est_woba: 0.38, est_slg: 0.56 },
    ],
    statcastPopulation: [
      {
        est_woba: 0.28,
        avg_hit_speed: 86,
        whiff_percent: 28,
        oz_swing_percent: 35,
      },
      {
        est_woba: 0.32,
        avg_hit_speed: 90,
        whiff_percent: 23,
        oz_swing_percent: 30,
      },
      {
        est_woba: 0.38,
        avg_hit_speed: 96,
        whiff_percent: 17,
        oz_swing_percent: 24,
      },
    ],
    batTrackingPopulation: [
      { avg_bat_speed: 68 },
      { avg_bat_speed: 72 },
      { avg_bat_speed: 76 },
    ],
    isPitcher: false,
    pitchArsenal: null,
    pitchArsenalPopulation: null,
    contactPoints: null,
    pitcherPitches: null,
    stats: {},
    statSeason: 2026,
    isFallback: false,
    careerStats: null,
    splits: null,
    comps: [],
    boxscoreSplits: {
      status: "live",
      recentGames: [
        { batting: { ops: 0.72 } },
        { batting: { ops: 0.81 } },
        { batting: { ops: 0.93 } },
      ],
    },
    handednessSplits: {
      season: 2026,
      rows: [
        {
          side: "LHP",
          stat: {
            hits: 57,
            atBats: 200,
            plateAppearances: 225,
            baseOnBalls: 20,
            hitByPitch: 2,
            sacFlies: 3,
            doubles: 10,
            triples: 1,
            homeRuns: 6,
            strikeOuts: 43,
          },
        },
        {
          side: "RHP",
          stat: {
            hits: 62,
            atBats: 200,
            plateAppearances: 234,
            baseOnBalls: 25,
            hitByPitch: 3,
            sacFlies: 4,
            doubles: 12,
            triples: 2,
            homeRuns: 12,
            strikeOuts: 42,
          },
        },
      ],
      careerRows: [
        {
          side: "LHP",
          stat: {
            hits: 114,
            atBats: 400,
            plateAppearances: 450,
            baseOnBalls: 40,
            hitByPitch: 4,
            sacFlies: 6,
            doubles: 20,
            triples: 2,
            homeRuns: 12,
            strikeOuts: 86,
          },
        },
        {
          side: "RHP",
          stat: {
            hits: 124,
            atBats: 400,
            plateAppearances: 468,
            baseOnBalls: 50,
            hitByPitch: 6,
            sacFlies: 8,
            doubles: 24,
            triples: 4,
            homeRuns: 24,
            strikeOuts: 84,
          },
        },
      ],
    },
  };
}

// Deferred promise helper — lets the test control exactly when each
// loadFullPlayer() call resolves, in whichever order the assertion needs.
function deferred() {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const originalFetch = global.fetch;

beforeEach(() => {
  cleanup();
  searchPlayers.mockReset();
  loadFullPlayer.mockReset();
  global.fetch = vi.fn(async url => {
    if (url === "/api/comparison-summary")
      return {
        ok: true,
        json: async () => ({
          headline: "Primary Player owns the clearest percentile edge",
          summary: "Power: Primary Player by 14 percentile points.",
          edges: [{ axis: "Power", leader: "Primary Player", margin: 14 }],
          caveat: "Generated only from the supplied Savant axes.",
          generated: true,
        }),
      };
    return originalFetch(url);
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("PlayersPage — player comparison and race conditions", () => {
  it("keeps the profile layout breathable and collapses it at responsive breakpoints", () => {
    const css = readFileSync(
      join(process.cwd(), "client/src/index.css"),
      "utf8"
    );
    expect(css).toContain(".skip-player-page { --profile-ease:");
    expect(css).toContain(
      ".skip-player-main-grid { grid-template-columns: minmax(170px, 210px) minmax(0, 1fr) !important; gap:10px !important; }"
    );
    expect(css).toContain(
      ".skip-player-main-grid { grid-template-columns: 1fr !important; gap: 10px !important; }"
    );
    expect(css).toContain(
      ".skip-profile-photo-frame, .skip-profile-photo-frame img { width: 92px !important; height: 116px !important;"
    );
    expect(css).toContain(
      ".skip-performance-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); }"
    );
    expect(css).toContain(
      ".skip-performance-summary-card { min-width:0; padding:10px 12px 9px;"
    );
    expect(css).toContain(
      ".skip-performance-summary-card-trend { margin-top:6px;"
    );
    expect(css).toContain(
      ".skip-performance-summary-card-expanded { padding:9px 12px 11px;"
    );
    expect(css).toContain(
      "scroll-snap-type:x mandatory; scroll-behavior:smooth;"
    );
    expect(css).toContain(
      ".skip-performance-summary-card { scroll-snap-align:start; scroll-snap-stop:always; }"
    );
    expect(css).toContain(
      ".skip-summary-sparkline { width:100%; max-width:180px; height:32px;"
    );
    expect(css).toContain(
      ".skip-player-page .skip-player-hero { flex-wrap:nowrap !important; overflow-x:auto !important;"
    );
    expect(css).toContain(
      ".skip-player-page .skip-profile-identity { flex:0 0 258px; min-width:258px !important;"
    );
    expect(css).toContain(
      ".skip-player-page .skip-player-hero { border-radius:8px !important;"
    );
    expect(css).toContain(
      ".skip-player-page .skip-profile-source-strip { margin-top:6px; padding:7px 10px; gap:12px; border-radius:6px; }"
    );
    expect(css).toContain(
      ".skip-player-page .skip-profile-tab-rail { margin-top:0; border-radius:6px; padding:3px; }"
    );
    expect(css).toContain(
      ".skip-player-page .skip-player-main-grid { grid-template-columns:minmax(164px,190px) minmax(0,1.08fr) minmax(0,1.08fr) minmax(190px,225px) !important; gap:10px !important; }"
    );
    expect(css).toContain(
      ".skip-player-page .skip-panel { border-radius:7px !important;"
    );
  });

  it("shows a page-shaped Player Profile skeleton while the selected player is loading", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Loading Player" }]);
    loadFullPlayer.mockReturnValue(pending.promise);

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Loading");
    await waitFor(() =>
      expect(screen.getByText("Loading Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Loading Player"));

    expect(
      await screen.findByRole("status", { name: "Loading player profile" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Loading profile, season stats, career splits, and Statcast context/
      )
    ).toBeInTheDocument();

    const loadedPlayer = mockPlayer(1, "Loading Player");
    loadedPlayer.stats = { ops: 0.842, wrcPlus: 132 };
    loadedPlayer.advancedMetrics = {
      war: 3.4,
      wrcPlus: 128,
      source: "MLB Stats API seasonAdvanced",
      status: "live",
    };
    pending.resolve(loadedPlayer);
    expect(
      await screen.findByRole("button", { name: /TPVI True Value/i })
    ).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Performance Summary" });
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("WAR");
    expect(summary).toHaveTextContent(".842");
    expect(summary).toHaveTextContent("3.4");
    expect(summary).toHaveTextContent("128");
    expect(summary).toHaveTextContent("Statcast");
    expect(summary).toHaveTextContent("xwOBA");
    expect(summary).toHaveTextContent("percentile");
    const warCard = screen.getByRole("button", { name: /WAR 3\.4/i });
    expect(warCard).toHaveAttribute("aria-expanded", "false");
    await user.click(warCard);
    expect(warCard).toHaveAttribute("aria-expanded", "true");
    expect(summary).toHaveTextContent("Wins Above Replacement");
    expect(summary).toHaveTextContent("Provider: MLB Stats API seasonAdvanced");
    expect(summary.querySelector(".skip-summary-sparkline")).toBeNull();
    const opsCard = screen.getByRole("button", { name: /OPS \.842/i });
    await user.click(opsCard);
    expect(
      summary.querySelector(".skip-summary-sparkline")
    ).toBeInTheDocument();
    expect(summary).toHaveTextContent("Last 3 games");
  });

  it("opens the side-by-side comparison modal and loads a second player through the live adapter", async () => {
    const user = userEvent.setup();
    const primary = { id: 1, fullName: "Primary Player" };
    const secondary = {
      id: 2,
      fullName: "Second Player",
      currentTeam: { abbreviation: "NYM" },
      primaryPosition: { abbreviation: "OF" },
    };
    searchPlayers.mockImplementation(async q =>
      q === "Primary" ? [primary] : q === "Second" ? [secondary] : []
    );
    loadFullPlayer
      .mockResolvedValueOnce(mockPlayer(1, "Primary Player"))
      .mockResolvedValueOnce(mockPlayer(2, "Second Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Primary");
    await waitFor(() =>
      expect(screen.getByText("Primary Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Primary Player"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Compare player/i })
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /Compare player/i }));
    expect(
      screen.getByRole("dialog", { name: /Compare Primary Player/i })
    ).toBeInTheDocument();
    const comparisonInput = screen.getByRole("textbox", {
      name: /Add second player/i,
    });
    await user.type(comparisonInput, "Second");
    await waitFor(() =>
      expect(screen.getByText("Second Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Second Player"));
    await waitFor(() =>
      expect(screen.getByText("Player B")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("AI Profile Summary")).toBeInTheDocument()
    );
    expect(
      screen.getByText(/Primary Player owns the clearest percentile edge/)
    ).toBeInTheDocument();
    expect(
      global.__consoleErrors.filter(e => !e.includes("network unavailable"))
        .length
    ).toBe(0);
  });

  it("renders accessible highlight search shortcuts in the Player Video panel", async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Video Player" }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Video Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Video");
    await waitFor(() =>
      expect(screen.getByText("Video Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Video Player"));

    await waitFor(() =>
      expect(screen.getByText("Player Video")).toBeInTheDocument()
    );
    expect(screen.getByText("Highlight search shortcuts")).toBeInTheDocument();
    const shortcut = screen.getByRole("link", {
      name: /Search Home run & extra-base plays/i,
    });
    expect(shortcut).toHaveAttribute("target", "_blank");
    expect(shortcut.getAttribute("href")).toContain(
      "youtube.com/results?search_query="
    );
    expect(shortcut.getAttribute("href")).not.toContain("#t=");
    await user.click(shortcut);
    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });

  it("creates a playlist, saves a verified clip, embeds it, and removes it", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Playlist Player" }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Playlist Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Playlist");
    await waitFor(() =>
      expect(screen.getByText("Playlist Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Playlist Player"));
    await waitFor(() =>
      expect(screen.getByText("Player Video")).toBeInTheDocument()
    );

    await user.type(
      screen.getByRole("textbox", { name: /New playlist name/i }),
      "Game 1 Cuts"
    );
    await user.click(screen.getByRole("button", { name: /Create$/i }));
    expect(
      screen.getByRole("option", { name: /Game 1 Cuts \(0\)/i })
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: /Verified YouTube clip URL/i }),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    await user.type(
      screen.getByRole("textbox", { name: /Clip title/i }),
      "Opening blast"
    );
    await user.click(screen.getByRole("button", { name: /Save clip/i }));
    await waitFor(() =>
      expect(screen.getByTitle("Opening blast")).toBeInTheDocument()
    );
    expect(screen.getByTitle("Opening blast")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );

    await user.type(
      screen.getByRole("textbox", { name: /Verified YouTube clip URL/i }),
      "https://www.youtube.com/watch?v=9bZkp7q19f0"
    );
    await user.type(
      screen.getByRole("textbox", { name: /Clip title/i }),
      "Second look"
    );
    await user.click(screen.getByRole("button", { name: /Save clip/i }));
    expect(
      screen.getByRole("button", { name: /Move Second look up/i })
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: /Move Second look up/i })
    );
    const stored = JSON.parse(localStorage.getItem("skip-player-playlists:1"));
    expect(
      stored.find(list => list.name === "Game 1 Cuts").clips[0].title
    ).toBe("Second look");
    await user.click(
      screen.getByRole("button", { name: /Remove Second look/i })
    );
    expect(
      screen.queryByRole("button", { name: /Remove Second look/i })
    ).not.toBeInTheDocument();
  });

  it("updates the selected metric when a profile KPI is clicked", async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([
      { id: 1, fullName: "Interactive Player" },
    ]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Interactive Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Interactive");
    await waitFor(() =>
      expect(screen.getByText("Interactive Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Interactive Player"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /TPVI True Value/i })
      ).toBeInTheDocument()
    );
    expect(
      document.querySelector(".skip-profile-photo-frame")
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mets logo/i })).toBeInTheDocument();
    expect(screen.getAllByText(/New York Mets · OF/i).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(/Focus: Value/i)).toBeInTheDocument();

    const casButton = screen.getByRole("button", { name: /CAS Contact Auth/i });
    await user.click(casButton);

    expect(casButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("CAS");
    expect(screen.getByText(/Focus: Contact/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /TPVI True Value/i })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("switches profile tabs and opens an expanded chart dialog", async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Tabbed Player" }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Tabbed Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Tabbed");
    await waitFor(() =>
      expect(screen.getByText("Tabbed Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Tabbed Player"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Offense" })
      ).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Offense" }));
    expect(screen.getByText("Offense Focus")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByText("SKIP Read")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overview" }));
    await user.click(
      screen.getAllByRole("button", { name: /Expand Expand/i })[1]
    );
    expect(
      screen.getByRole("dialog", { name: /Player Geometry Engine/i })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Close expanded chart/i })
    );
    expect(
      screen.queryByRole("dialog", { name: /Player Geometry Engine/i })
    ).not.toBeInTheDocument();
  });

  it("renders the side-by-side LHP and RHP comparison in Splits", async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Split Player" }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Split Player"));

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Split");
    await waitFor(() =>
      expect(screen.getByText("Split Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Split Player"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Splits" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Splits" }));

    expect(screen.getByText("Pitcher Handedness Splits")).toBeInTheDocument();
    expect(screen.getAllByText("LHP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("RHP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.285").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.955").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("img", { name: /season comparison of LHP and RHP/i })
    ).toBeInTheDocument();
    expect(
      document.querySelector(".skip-split-value")?.getAttribute("data-tooltip")
    ).toContain("57 H");

    const careerToggle = screen.getByRole("button", { name: "Career average" });
    await user.click(careerToggle);
    expect(careerToggle).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(/Aggregated across available career split seasons/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /career comparison of LHP and RHP/i })
    ).toBeInTheDocument();
  });

  it("saves tagged observations and sorts them by category in the Notes tab", async () => {
    const user = userEvent.setup();
    searchPlayers.mockResolvedValue([{ id: 1, fullName: "Notes Player" }]);
    loadFullPlayer.mockResolvedValue(mockPlayer(1, "Notes Player"));
    localStorage.removeItem("skip-player-notes:1");

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Notes");
    await waitFor(() =>
      expect(screen.getByText("Notes Player")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Notes Player"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument()
    );
    expect(screen.getByText("DATA CONFIDENCE")).toBeInTheDocument();
    expect(screen.getAllByText("Statcast").length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    await user.type(
      screen.getByRole("textbox", { name: "Observation" }),
      "Keep the hands quiet in two-strike counts."
    );
    await user.type(
      screen.getByRole("textbox", { name: "Custom tags" }),
      "two-strike, timing"
    );
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(
      screen.getByText("Keep the hands quiet in two-strike counts.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("#two-strike", { selector: "button" })
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Observation category" }),
      "Medical"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Observation" }),
      "Check recovery notes after the next series."
    );
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort observations" }),
      "category"
    );
    expect(screen.getAllByText("Medical")[1]).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Sort observations" })
    ).toHaveValue("category");

    await user.type(
      screen.getByRole("textbox", { name: "Search observations" }),
      "quiet"
    );
    expect(
      screen.getByText("Keep the hands quiet in two-strike counts.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Check recovery notes after the next series.")
    ).not.toBeInTheDocument();
    await user.clear(
      screen.getByRole("textbox", { name: "Search observations" })
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter observations by tag" }),
      "two-strike"
    );
    expect(
      screen.getByText("Keep the hands quiet in two-strike counts.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Check recovery notes after the next series.")
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter observations by tag" }),
      ""
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Bulk tag" }),
      "two-strike"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Replacement tag" }),
      "follow-up"
    );
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(
      screen.getByText("#follow-up", { selector: "button" })
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Bulk tag" }),
      "follow-up"
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      screen.queryByText("#follow-up", { selector: "button" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export JSON" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import JSON" })
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Import mode" }),
      "replace"
    );
    expect(screen.getByRole("combobox", { name: "Import mode" })).toHaveValue(
      "replace"
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);
    const editor = screen.getByRole("textbox", { name: "Observation" });
    await user.clear(editor);
    await user.type(editor, "Updated recovery note.");
    await user.click(screen.getByRole("button", { name: "Update note" }));
    expect(screen.getByText("Updated recovery note.")).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(
      screen.queryByText("Updated recovery note.")
    ).not.toBeInTheDocument();
  });

  it("renders the verified core profile before supplemental data finishes", async () => {
    const user = userEvent.setup();
    const full = mockPlayer(7, "Core First Player");
    let resolveExtras;
    searchPlayers.mockResolvedValue([{ id: 7, fullName: "Core First Player" }]);
    loadFullPlayer.mockImplementation(async (_person, _season, options) => {
      options?.onCoreReady?.({
        ...full,
        savant: null,
        batTracking: null,
        contractData: null,
        teamFinancials: null,
        boxscoreSplits: null,
        extrasLoading: true,
      });
      return new Promise(resolve => { resolveExtras = () => resolve({ ...full, extrasLoading: false }); });
    });

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);
    await user.type(input, "Core");
    await waitFor(() => expect(screen.getByText("Core First Player")).toBeInTheDocument());
    await user.click(screen.getByText("Core First Player"));

    expect(await screen.findByText(/Core MLB profile loaded/)).toBeInTheDocument();
    expect(screen.getByText("Career Batting")).toBeInTheDocument();
    expect(screen.getAllByText("Core First Player").length).toBeGreaterThanOrEqual(1);

    resolveExtras();
    await waitFor(() => expect(screen.queryByText(/Core MLB profile loaded/)).not.toBeInTheDocument());
  });

  it("keeps the faster, later-clicked player instead of an older, slower response clobbering it", async () => {
    const user = userEvent.setup();
    const playerA = { id: 1, fullName: "Slow Player A" };
    const playerB = { id: 2, fullName: "Fast Player B" };
    const deferredA = deferred();
    const deferredB = deferred();

    searchPlayers.mockImplementation(async q => {
      if (q === "Slow") return [playerA];
      if (q === "Fast") return [playerB];
      return [];
    });
    loadFullPlayer.mockImplementation(async person => {
      if (person.id === 1) return deferredA.promise;
      if (person.id === 2) return deferredB.promise;
      throw new Error("unexpected player");
    });

    render(<PlayersPage />);
    const input = screen.getByPlaceholderText(/Search any MLB player/i);

    // Click player A first (the slow one).
    await user.type(input, "Slow");
    await waitFor(() =>
      expect(screen.getByText("Slow Player A")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Slow Player A"));

    // Before A's fetch resolves, search for and click player B.
    await user.clear(input);
    await user.type(input, "Fast");
    await waitFor(() =>
      expect(screen.getByText("Fast Player B")).toBeInTheDocument()
    );
    await user.click(screen.getByText("Fast Player B"));

    // B resolves first (it's the faster request).
    deferredB.resolve(mockPlayer(2, "Fast Player B"));
    await waitFor(() => expect(loadFullPlayer).toHaveBeenCalledTimes(2));

    // A's stale, slower response resolves last — without the fix this
    // would overwrite B's data even though the search box reads "Fast
    // Player B".
    deferredA.resolve(mockPlayer(1, "Slow Player A"));

    // Give both resolutions a tick to flush through React state updates.
    await new Promise(r => setTimeout(r, 50));

    expect(input.value).toBe("Fast Player B");
    // The real proof: the rendered player header shows B's name (falls
    // back to `fullName` since this mock has no useLastName/lastName),
    // not A's. Without the fix, A's stale response resolving last would
    // silently overwrite `player` state with A's data while the search
    // box still read "Fast Player B" — a mismatch this assertion would
    // catch that checking the input alone would not.
    await waitFor(() =>
      expect(screen.getAllByText("Fast Player B").length).toBeGreaterThan(0)
    );
    expect(screen.queryByText("Slow Player A")).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
  });
});

it("renders a sticky grouped career table after selecting a player", async () => {
  const user = userEvent.setup();
  searchPlayers.mockResolvedValue([{ id: 1, fullName: "Table Player" }]);
  loadFullPlayer.mockResolvedValue(mockPlayer(1, "Table Player"));

  render(<PlayersPage />);
  const input = screen.getByPlaceholderText(/Search any MLB player/i);
  await user.type(input, "Table");
  await waitFor(() =>
    expect(screen.getByText("Table Player")).toBeInTheDocument()
  );
  await user.click(screen.getByText("Table Player"));

  expect(await screen.findByText("Career Batting")).toBeInTheDocument();
  expect(document.querySelectorAll(".skip-long-table").length).toBeGreaterThan(
    0
  );
  expect(screen.getAllByText("Identity").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("Volume")).toBeInTheDocument();
  expect(screen.getByText("Rate & value")).toBeInTheDocument();
});
