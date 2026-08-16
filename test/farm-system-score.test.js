import { describe, expect, it } from "vitest";
import {
  buildFarmSystemSummary,
  scoreFarmSystem,
} from "../client/src/lib/farmSystemScore.js";

describe("farm system summary score", () => {
  const rankings = [
    { team: "AAA", count: 5, avgRank: 18, bestRank: 2 },
    { team: "BBB", count: 3, avgRank: 9, bestRank: 1 },
    { team: "CCC", count: 1, avgRank: 60, bestRank: 60 },
  ];

  it("normalizes depth and rank quality into a bounded score", () => {
    const result = scoreFarmSystem(rankings[0], { maxCount: 5, poolSize: 100 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.depth).toBe(100);
    expect(result.averageRank).toBeCloseTo(82.83, 1);
    expect(result.bestRank).toBeCloseTo(99, 1);
  });

  it("orders organizations by the derived score rather than raw count alone", () => {
    const summary = buildFarmSystemSummary({
      rankings,
      trackedCount: 9,
      poolSize: 100,
    });
    expect(summary.rows[0].team).toBe("AAA");
    expect(summary.rows[0].metrics.score).toBeGreaterThan(
      summary.rows[1].metrics.score
    );
    expect(summary.representedOrgs).toBe(3);
    expect(summary.trackedCount).toBe(9);
  });

  it("returns an honest unavailable state when ranking inputs are absent", () => {
    const summary = buildFarmSystemSummary({
      rankings: [],
      trackedCount: 0,
      poolSize: 0,
    });
    expect(summary.score).toBeNull();
    expect(summary.scoreBand).toBe("Unavailable");
    expect(summary.rows).toEqual([]);
  });

  it("does not fabricate a score when fewer than two components are available", () => {
    const result = scoreFarmSystem({ count: 5 }, { maxCount: 5, poolSize: 0 });
    expect(result.score).toBeNull();
    expect(result.availableComponents).toBe(1);
  });
});
