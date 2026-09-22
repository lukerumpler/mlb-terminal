import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkshopViewControl from "../client/src/components/WorkshopViewControl.jsx";
import {
  WORKSHOP_OPTIONS,
  WORKSHOP_DEFAULTS,
  readWorkshopPreferences,
  saveWorkshopPreferences,
  resetWorkshopPreferences,
} from "../client/src/lib/workshopPreferences.js";
import OverviewPage from "../client/src/pages/OverviewPage.jsx";
import { __resetFanGraphsLocalSnapshotForTests, __resetMlbClientStateForTests, __resetTeamScheduleSnapshotCacheForTests } from "../client/src/api/mlb.js";
import { __resetFeedClientStateForTests } from "../client/src/api/feed.js";

vi.mock("../client/src/components/BallparkWeatherPanel.jsx", () => ({
  default: () => null,
}));

beforeEach(() => {
  cleanup();
  localStorage.clear();
  global.__consoleErrors.length = 0;
});

describe("workshopPreferences (lib)", () => {
  it("defaults every option to true — introducing the control shows exactly what was already always visible", () => {
    const prefs = readWorkshopPreferences();
    for (const opt of WORKSHOP_OPTIONS) {
      expect(prefs[opt.key]).toBe(true);
    }
  });

  it("persists a change and merges it over the defaults on the next read", () => {
    saveWorkshopPreferences({ showContractData: false });
    const prefs = readWorkshopPreferences();
    expect(prefs.showContractData).toBe(false);
    expect(prefs.showPlayoffOdds).toBe(true); // untouched keys stay at default
  });

  it("accepts a functional updater, same as the other lib/*Preferences modules in this app", () => {
    saveWorkshopPreferences(current => ({ ...current, showMinorLeagueControls: !current.showMinorLeagueControls }));
    expect(readWorkshopPreferences().showMinorLeagueControls).toBe(false);
  });

  it("tolerates a corrupted localStorage value by falling back to defaults rather than throwing", () => {
    localStorage.setItem("skip-workshop-preferences", "{not-json");
    expect(readWorkshopPreferences()).toEqual(WORKSHOP_DEFAULTS);
  });

  it("resetWorkshopPreferences restores every key to true", () => {
    saveWorkshopPreferences({ showPlayoffOdds: false, showCacheDiagnostics: false });
    resetWorkshopPreferences();
    expect(readWorkshopPreferences()).toEqual(WORKSHOP_DEFAULTS);
  });
});

describe("WorkshopViewControl", () => {
  it("opens the menu, lists every real option, and toggling one persists immediately", async () => {
    const user = userEvent.setup();
    render(<WorkshopViewControl />);

    await user.click(screen.getByRole("button", { name: /Workshop View/ }));
    for (const opt of WORKSHOP_OPTIONS) {
      expect(screen.getByText(opt.label)).toBeInTheDocument();
    }

    const contractCheckbox = screen.getByRole("checkbox", { name: /Contract data/ });
    expect(contractCheckbox).toBeChecked();
    await user.click(contractCheckbox);
    expect(readWorkshopPreferences().showContractData).toBe(false);
    expect(global.__consoleErrors.length).toBe(0);
  });

  it("closes on outside click and on Escape", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <WorkshopViewControl />
        <button type="button">Elsewhere</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: /Workshop View/ }));
    expect(screen.getByRole("menu", { name: "Workshop View options" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Workshop View/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it("Reset to default is disabled at defaults and re-enables once a preference changes", async () => {
    const user = userEvent.setup();
    render(<WorkshopViewControl />);

    await user.click(screen.getByRole("button", { name: /Workshop View/ }));
    expect(screen.getByRole("menuitem", { name: "Reset to default" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /Minor league data/ }));
    expect(screen.getByRole("menuitem", { name: "Reset to default" })).not.toBeDisabled();

    await user.click(screen.getByRole("menuitem", { name: "Reset to default" }));
    expect(readWorkshopPreferences()).toEqual(WORKSHOP_DEFAULTS);
    expect(global.__consoleErrors.length).toBe(0);
  });
});

describe("Workshop View — integration with Team Overview", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    global.__consoleErrors.length = 0;
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
    __resetFanGraphsLocalSnapshotForTests();
    __resetTeamScheduleSnapshotCacheForTests();
    __resetFeedClientStateForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
        text: async () => JSON.stringify({}),
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetFeedClientStateForTests();
    __resetTeamScheduleSnapshotCacheForTests();
  });

  it("shows Playoff Odds by default, and hides it as soon as it's unchecked in Workshop View", async () => {
    const user = userEvent.setup();
    render(<OverviewPage />);

    await screen.findByRole("button", { name: "Briefing" });
    expect(document.body.textContent).toMatch(/Playoff Odds/);

    await user.click(screen.getByRole("button", { name: /Workshop View/ }));
    await user.click(screen.getByRole("checkbox", { name: /Playoff odds/ }));
    // Close the menu — its own option description text always contains the
    // phrase "Playoff Odds" (it's describing what the toggle does), so the
    // real assertion is against the metrics strip once the menu is gone.
    await user.keyboard("{Escape}");

    expect(document.body.textContent).not.toMatch(/Playoff Odds/);
    expect(global.__consoleErrors.length).toBe(0);
  });

  it("hides the Minor League affiliate control when turned off in Workshop View", async () => {
    render(<OverviewPage />);
    await screen.findByRole("button", { name: "Briefing" });
    expect(screen.getByRole("button", { name: /MINOR LEAGUE/ })).toBeInTheDocument();

    saveWorkshopPreferences({ showMinorLeagueControls: false });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /MINOR LEAGUE/ })).not.toBeInTheDocument();
    });
    expect(global.__consoleErrors.length).toBe(0);
  });
});
