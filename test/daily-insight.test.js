import { afterEach, describe, expect, it, vi } from "vitest";
import { SKIP_QUOTES, getDailyInsight } from "../client/src/constants/alerts.js";

// Closes out an investigation an earlier session flagged and didn't finish:
// the sidebar footer's "SKIP INSIGHT" quote (App.jsx, .skip-sidebar-insight)
// — is it static copy, or does it carry the same "asserts something not
// actually backed by real state" risk as the provenance bugs found
// elsewhere this session (Plate Discipline badge, System Status, League KPI
// strip)?
//
// Verdict: no bug here, and it's a different category of thing entirely.
// getDailyInsight() is a pure function that rotates through a fixed list of
// general baseball-analytics aphorisms by day-of-year — it makes no
// freshness/verification claim ("Live", "verified", etc.) the way the
// badges that were actually buggy did, and it's rendered as an explicitly
// quoted, italicized aside rather than a status indicator. It also isn't
// uniformly positive the way a fabricated "everything's fine" claim would
// be — several entries are neutral or cautionary. It does, genuinely,
// rotate (day % length), so "static" wouldn't be quite right either. It
// simply had no test coverage, which this closes.
describe("getDailyInsight (sidebar 'SKIP INSIGHT' footer quote)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("always returns one of the canned dailyInsights entries", () => {
    const result = getDailyInsight();
    expect(SKIP_QUOTES.dailyInsights).toContain(result);
  });

  it("stays in-bounds across a full year of day offsets (no off-by-one on the rotation)", () => {
    const base = new Date("2026-01-01T12:00:00Z");
    for (let offset = 0; offset <= 366; offset++) {
      const day = new Date(base);
      day.setUTCDate(day.getUTCDate() + offset);
      vi.useFakeTimers();
      vi.setSystemTime(day);
      const result = getDailyInsight();
      expect(SKIP_QUOTES.dailyInsights).toContain(result);
      vi.useRealTimers();
    }
  });

  it("is deterministic within the same day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T08:00:00Z"));
    const first = getDailyInsight();
    vi.setSystemTime(new Date("2026-09-10T23:00:00Z"));
    const second = getDailyInsight();
    expect(second).toBe(first);
  });

  it("does not assert a data-freshness or verification claim (unlike the badges that were actually buggy)", () => {
    // Every entry should read as general commentary, not a "Live"/
    // "verified"/"current" style status claim tied to real-time data.
    for (const quote of SKIP_QUOTES.dailyInsights) {
      expect(quote.toLowerCase()).not.toMatch(/\blive\b|\bverified\b/);
    }
  });
});
