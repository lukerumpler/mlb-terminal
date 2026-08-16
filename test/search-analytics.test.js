import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSearchAnalytics,
  getSearchShortcutHint,
  getTopSearchQueries,
  normalizeSearchQuery,
  recordSearchQuery,
  readSearchAnalytics,
} from "../client/src/lib/searchAnalytics.js";

beforeEach(() => {
  localStorage.clear();
});

describe("local search analytics", () => {
  it("normalizes query text without retaining long numeric or email-like tokens", () => {
    expect(
      normalizeSearchQuery("  Juan Soto 2026 OPS  user@example.com  ")
    ).toBe("juan soto ops");
  });

  it("aggregates repeated queries and keeps routing metadata for shortcut prioritization", () => {
    recordSearchQuery("Dodgers team WAR", {
      intent: "team",
      metric: "WAR",
      tab: "overview",
      status: "resolved",
    });
    recordSearchQuery("dodgers team war", {
      intent: "team",
      metric: "WAR",
      tab: "overview",
      status: "resolved",
    });
    recordSearchQuery("Juan Soto OPS", {
      intent: "player",
      metric: "OPS",
      tab: "players",
      status: "resolved",
    });
    const rows = readSearchAnalytics();
    expect(rows[0]).toMatchObject({
      query: "dodgers team war",
      count: 2,
      intent: "team",
      metric: "WAR",
      tab: "overview",
      status: "resolved",
    });
    expect(getTopSearchQueries(1)).toHaveLength(1);
    expect(getSearchShortcutHint(rows[0])).toBe("Prioritize a WAR shortcut");
    expect(getSearchShortcutHint(rows[1])).toBe("Prioritize a OPS shortcut");
  });

  it("clears local analytics without affecting unrelated local storage", () => {
    localStorage.setItem("skip-unrelated-setting", "keep");
    recordSearchQuery("Players page", {
      intent: "page",
      tab: "players",
      status: "resolved",
    });
    expect(clearSearchAnalytics()).toEqual([]);
    expect(readSearchAnalytics()).toEqual([]);
    expect(localStorage.getItem("skip-unrelated-setting")).toBe("keep");
  });
});
