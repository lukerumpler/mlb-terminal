import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RecentHistoryDropdown from "../client/src/components/RecentHistoryDropdown.jsx";
import {
  RECENT_HISTORY_LIMIT,
  clearRecentHistory,
  readRecentHistory,
  recordRecentView,
  saveRecentHistory,
} from "../client/src/lib/recentHistory.js";

describe("recent history persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("deduplicates a viewed player and caps history entries", () => {
    recordRecentView({ type: "player", id: 123, label: "First Player" });
    recordRecentView({
      type: "player",
      id: 123,
      label: "First Player Updated",
    });
    for (let id = 1; id <= RECENT_HISTORY_LIMIT + 2; id += 1) {
      recordRecentView({ type: "team", abbr: `T${id}`, label: `Team ${id}` });
    }
    const history = readRecentHistory();
    expect(history).toHaveLength(RECENT_HISTORY_LIMIT);
    expect(history.some(item => item.id === 123)).toBe(false);
    expect(history[0]).toMatchObject({
      type: "team",
      abbr: `T${RECENT_HISTORY_LIMIT + 2}`,
    });
  });

  it("persists an affiliate entry and dispatches affiliate quick-access metadata", () => {
    const listener = vi.fn();
    window.addEventListener("skip-select-affiliate", listener);
    recordRecentView({
      type: "affiliate",
      affiliateId: 6141,
      parentAbbr: "SF",
      levelId: 11,
      label: "Sacramento River Cats",
      secondary: "Triple-A · San Francisco Giants",
    });
    const saved = readRecentHistory();
    expect(saved[0]).toMatchObject({
      type: "affiliate",
      affiliateId: 6141,
      parentAbbr: "SF",
      levelId: 11,
      label: "Sacramento River Cats",
    });
    render(<RecentHistoryDropdown items={saved} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /recently viewed/i }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Sacramento River Cats/i })
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      affiliateId: 6141,
      parentAbbr: "SF",
      levelId: 11,
    });
    window.removeEventListener("skip-select-affiliate", listener);
  });

  it("renders empty state, clears entries, and dispatches team navigation", () => {
    const listener = vi.fn();
    window.addEventListener("skip-open-team", listener);
    render(<RecentHistoryDropdown items={[]} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /recently viewed/i }));
    expect(screen.getByText(/will appear here/i)).toBeInTheDocument();
    cleanup();

    const onClear = vi.fn();
    saveRecentHistory([
      {
        type: "team",
        abbr: "LAD",
        label: "Los Angeles Dodgers",
        secondary: "NL West",
        viewedAt: Date.now(),
      },
    ]);
    render(
      <RecentHistoryDropdown items={readRecentHistory()} onClear={onClear} />
    );
    fireEvent.click(screen.getByRole("button", { name: /recently viewed/i }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Los Angeles Dodgers/i })
    );
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].detail).toEqual({ abbr: "LAD" });
    cleanup();

    render(
      <RecentHistoryDropdown items={readRecentHistory()} onClear={onClear} />
    );
    fireEvent.click(screen.getByRole("button", { name: /recently viewed/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(readRecentHistory()).toEqual([]);
    window.removeEventListener("skip-open-team", listener);
  });
});
