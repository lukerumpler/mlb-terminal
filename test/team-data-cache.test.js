import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readTeamAggregateCache,
  readTeamPlayersCache,
  saveTeamAggregateCache,
  saveTeamPlayersCache,
  readTeamSavantCache,
  saveTeamSavantCache,
} from "../client/src/lib/teamDataCache.js";
import {
  buildBattedBallProfile,
  buildPitchArsenalRows,
  buildLiveRadarData,
  MLB_LEAGUE_COMPARISON_TEAM_COUNT,
  buildLiveRunDiffData,
  buildOrganizationProspectDepthChart,
  deriveBaserunningGrade,
  deriveFrontOfficeCoverageGrades,
  deriveOrganizationFutureValue,
  formatDataAge,
  resolveTeamSavantSnapshot,
} from "../client/src/pages/OverviewPage.jsx";

describe("team data cache and freshness helpers", () => {
  it("normalizes a verified current-season run differential without retaining mock game rows", () => {
    expect(buildLiveRunDiffData({ diff: 42 }, 2026)).toEqual([
      { game: "2026", diff: 42, cum: 42 },
    ]);
    expect(buildLiveRunDiffData({ diff: null }, 2026)).toEqual([]);
  });

  it("builds both radar datasets from live team aggregates and preserves unavailable states", () => {
    const liveTeamData = {
      byAbbr: {
        LAD: {
          standings: { diff: 42 },
          hitting: {
            ops: 0.802,
            homeRuns: 98,
            stolenBases: 54,
            avg: 0.26,
            slg: 0.43,
            obp: 0.33,
          },
          pitching: { era: 3.1, whip: 1.08 },
        },
        NYY: {
          standings: { diff: 10 },
          hitting: {
            ops: 0.75,
            homeRuns: 80,
            stolenBases: 30,
            avg: 0.24,
            slg: 0.4,
            obp: 0.32,
          },
          pitching: { era: 4.2, whip: 1.3 },
        },
      },
    };
    const data = buildLiveRadarData({
      team: {
        ops: 0.802,
        hr: 98,
        sb: 54,
        avg: 0.26,
        slg: 0.43,
        obp: 0.33,
        era: 3.1,
        whip: 1.08,
      },
      liveTeamData,
      runDiff: 42,
    });
    expect(data.source).toContain("MLB Stats API");
    expect(data.offenseData.map(row => row.axis)).toEqual([
      "OPS",
      "SLG",
      "OBP",
      "HR",
      "SB",
      "Run Diff",
    ]);
    expect(data.strengthData.map(row => row.axis)).toContain("Pitching");
    expect(data.hasLeagueBenchmark).toBe(false);
    expect(data.strengthData.every(row => row.leagueAverage == null)).toBe(true);
    expect(
      buildLiveRadarData({ team: {}, liveTeamData: null }).offenseData
    ).toEqual([]);
    expect(
      buildLiveRadarData({ team: {}, liveTeamData: null }).strengthData
    ).toEqual([]);
  });

  it("adds the league-average benchmark only for a complete current 30-team aggregate pool", () => {
    const byAbbr = Object.fromEntries(Array.from({ length: MLB_LEAGUE_COMPARISON_TEAM_COUNT }, (_, index) => {
      const value = index + 1;
      return [`T${value}`, {
        standings:{ diff:value - 15 },
        hitting:{ ops:.680 + value / 1000, homeRuns:70 + value, stolenBases:20 + value, avg:.220 + value / 1000, slg:.360 + value / 1000, obp:.290 + value / 1000 },
        pitching:{ era:5 - value / 100, whip:1.4 - value / 1000 },
      }];
    }));
    const data = buildLiveRadarData({
      team:{ ops:.710, hr:100, sb:50, avg:.250, slg:.390, obp:.320, era:4, whip:1.2 },
      liveTeamData:{ byAbbr },
      runDiff:0,
    });
    expect(data.leagueTeamCount).toBe(MLB_LEAGUE_COMPARISON_TEAM_COUNT);
    expect(data.hasLeagueBenchmark).toBe(true);
    expect(data.strengthData).toHaveLength(6);
    expect(data.strengthData.every(row => Number.isFinite(row.leagueAverage))).toBe(true);
  });

  it("withholds the league benchmark when a complete population lacks an axis value", () => {
    const byAbbr = Object.fromEntries(Array.from({ length: MLB_LEAGUE_COMPARISON_TEAM_COUNT }, (_, index) => {
      const value = index + 1;
      return [`T${value}`, {
        hitting:{ ops:.700 + value / 1000, homeRuns:90 + value, stolenBases:30 + value, avg:.230 + value / 1000 },
        pitching:{ era:4.8 - value / 100, whip:index === 0 ? null : 1.3 - value / 1000 },
      }];
    }));
    const data = buildLiveRadarData({
      team:{ ops:.720, hr:102, sb:55, avg:.250, era:4, whip:1.18 },
      liveTeamData:{ byAbbr },
    });
    expect(data.leagueTeamCount).toBe(MLB_LEAGUE_COMPARISON_TEAM_COUNT);
    expect(data.hasLeagueBenchmark).toBe(false);
    expect(data.strengthData.find(row => row.axis === 'Command')?.leagueAverage).toBeNull();
  });

  it("derives transparent Defense, Depth, and Future Value values only from available roster/prospect inputs", () => {
    const populated = deriveFrontOfficeCoverageGrades({
      liveDataMode: "live",
      teamAbbr: "LAD",
      players: {
        hitting: [
          { position: "C", stat: { plateAppearances: 100 } },
          { position: "1B", stat: { plateAppearances: 100 } },
          { position: "2B", stat: { plateAppearances: 100 } },
          { position: "SS", stat: { plateAppearances: 100 } },
          { position: "3B", stat: { plateAppearances: 100 } },
          { position: "LF", stat: { plateAppearances: 100 } },
          { position: "CF", stat: { plateAppearances: 100 } },
          { position: "RF", stat: { plateAppearances: 100 } },
        ],
        pitching: Array.from({ length: 18 }, () => ({ position: "P", stat: { inningsPitched: 10 } })),
      },
    });
    expect(populated.coveragePct).toBe(100);
    expect(populated.redundancyPct).toBe(0);
    expect(populated).toMatchObject({ defensePct: null, defenseStatus: 'awaiting-statcast' });
    expect(populated.depthPct).toBe(100);
    expect(populated.futureValuePct).not.toBeNull();
    expect(populated.prospectCount).toBeGreaterThan(0);

    const withVerifiedOaa = deriveFrontOfficeCoverageGrades({
      liveDataMode: "live",
      teamAbbr: "LAD",
      oaaPercentile: 100,
      oaaPopulationCount: 30,
      players: {
        hitting: Array.from({ length: 2 }, (_, index) => ({ position: ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"][index % 8], stat: { plateAppearances: 100 } })),
        pitching: Array.from({ length: 18 }, () => ({ position: "P", stat: { inningsPitched: 10 } })),
      },
    });
    expect(withVerifiedOaa.defensePct).toBeGreaterThan(withVerifiedOaa.defenseCoveragePct);

    const unavailable = deriveFrontOfficeCoverageGrades({ liveDataMode: "unavailable", teamAbbr: "ZZZ", players: { hitting: [], pitching: [] } });
    expect(unavailable).toMatchObject({ defensePct: null, depthPct: null, futureValuePct: null, prospectCount: 0 });
  });

  it("uses both stolen-base volume and efficiency, and ranks Future Value only inside the current SKIP snapshot", () => {
    const baserunning = deriveBaserunningGrade({
      stolenBases: 20,
      caughtStealing: 5,
      comparisonRows: [
        { stolenBases: 10, caughtStealing: 5 },
        { stolenBases: 20, caughtStealing: 20 },
        { stolenBases: 30, caughtStealing: 0 },
      ],
    });
    expect(baserunning).toMatchObject({ attempts: 25, volumePercentile: 33, efficiencyPercentile: 67, percentile: 52, status: 'volume-fallback' });
    expect(deriveBaserunningGrade({ stolenBases: 20, caughtStealing: null, comparisonRows: [] }).percentile).toBeNull();

    const futureValue = deriveOrganizationFutureValue("LAD");
    expect(futureValue.futureValuePct).not.toBeNull();
    expect(futureValue.prospectCount).toBeGreaterThan(0);
    expect(futureValue.organizationCount).toBeGreaterThan(1);
  });

  it("builds an organization depth chart from only the current SKIP prospect snapshot", () => {
    const dodgers = buildOrganizationProspectDepthChart("LAD");
    expect(dodgers.prospects.length).toBeGreaterThan(0);
    expect(dodgers.rows.length).toBeGreaterThan(0);
    expect(dodgers.rows.every(row => row.prospects.every(prospect => prospect.team === "LAD"))).toBe(true);
    expect(dodgers.rows.every(row => row.topFutureValue === row.prospects[0].futureValue)).toBe(true);
    expect(buildOrganizationProspectDepthChart("ZZZ")).toEqual({ prospects: [], rows: [] });
  });

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores only season-matched aggregate snapshots", () => {
    const data = { byAbbr: { LAD: { standings: { w: 73, l: 48 } } }, byId: {} };
    saveTeamAggregateCache(data, 2026);
    expect(readTeamAggregateCache(2026)).toMatchObject({ season: 2026, data });
    expect(readTeamAggregateCache(2025)).toBeNull();
  });

  it("stores team-specific player rows independently", () => {
    saveTeamPlayersCache(119, 2026, { hitting: [{ id: 1 }], pitching: [] });
    saveTeamPlayersCache(147, 2026, { hitting: [{ id: 2 }], pitching: [] });
    expect(readTeamPlayersCache(119, 2026)?.data.hitting[0].id).toBe(1);
    expect(readTeamPlayersCache(147, 2026)?.data.hitting[0].id).toBe(2);
    expect(readTeamPlayersCache(119, 2025)).toBeNull();
  });

  it("stores team-scoped Savant snapshots by season and abbreviation", () => {
    const data = {
      exitVelocityRows: [{ launch_speed: 102 }],
      battedBallRows: [],
      pitchRows: [],
    };
    saveTeamSavantCache("lad", 2026, data);
    expect(readTeamSavantCache("LAD", 2026)).toMatchObject({
      season: 2026,
      teamAbbr: "LAD",
      data,
    });
    expect(readTeamSavantCache("LAD", 2025)).toBeNull();
  });

  it("builds verified batted-ball metrics without inventing spray direction", () => {
    const data = buildBattedBallProfile([
      {
        launch_speed: 100,
        launch_angle: 20,
        launch_speed_angle: 6,
        bb_type: "line_drive",
      },
      {
        launch_speed: 90,
        launch_angle: 4,
        launch_speed_angle: 0,
        bb_type: "ground_ball",
      },
    ]);
    expect(data).toMatchObject({
      barrelPct: 50,
      hardHitPct: 50,
      sweetSpot: 50,
      avgEV: "95.0",
      maxEV: "100.0",
      gbPct: 50,
      ldPct: 50,
    });
    expect(data.pullPct).toBeNull();
  });

  it("builds pitch usage from verified pitch rows and leaves Stuff+ unavailable", () => {
    const data = buildPitchArsenalRows([
      { pitch_type: "FF", release_speed: 95 },
      { pitch_type: "FF", release_speed: 96 },
      { pitch_type: "SL", release_speed: 85 },
    ]);
    expect(data?.[0]).toMatchObject({
      type: "FF",
      pct: 66.7,
      avgVelocity: 95.5,
      stuffPlus: null,
    });
    expect(data?.[1]).toMatchObject({ type: "SL", pct: 33.3, avgVelocity: 85 });
  });

  it("uses a fresh cached Savant snapshot without issuing network requests", async () => {
    const getTeamExitVelocityFn = vi.fn();
    const getPlayerContactPointsFn = vi.fn();
    const getPitcherPitchesFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: "LAD",
      season: 2026,
      cached: {
        updatedAt: 1_000,
        data: {
          exitVelocityRows: [{ launch_speed: 101 }],
          battedBallRows: [],
          pitchRows: [],
        },
      },
      now: 1_100,
      getTeamExitVelocityFn,
      getPlayerContactPointsFn,
      getPitcherPitchesFn,
    });
    expect(result.cacheHit).toBe(true);
    expect(result.source).toContain("cached");
    expect(getTeamExitVelocityFn).not.toHaveBeenCalled();
    expect(getPlayerContactPointsFn).not.toHaveBeenCalled();
    expect(getPitcherPitchesFn).not.toHaveBeenCalled();
  });

  it("uses direct team rows and roster-player pitch rows on a cache miss", async () => {
    const saveCacheFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: "LAD",
      season: 2026,
      cached: null,
      hitters: [{ id: 11 }],
      pitchers: [{ id: 22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([{ launch_speed: 101 }]),
      getPlayerContactPointsFn: vi.fn(),
      getPitcherPitchesFn: vi
        .fn()
        .mockResolvedValue([{ pitch_type: "FF", release_speed: 96 }]),
      saveCacheFn,
    });
    expect(result.cacheHit).toBe(false);
    expect(result.snapshot.exitVelocityRows).toHaveLength(1);
    expect(result.snapshot.pitchRows).toEqual([
      { pitch_type: "FF", release_speed: 96 },
    ]);
    expect(saveCacheFn).toHaveBeenCalledWith("LAD", 2026, result.snapshot);
  });

  it("uses verified team batted-ball rows before issuing large per-hitter contact rollups", async () => {
    const getPlayerContactPointsFn = vi.fn();
    const directBattedRows = [{ launch_speed: 101, xwoba: 0.412 }];
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: "LAD",
      season: 2026,
      cached: null,
      hitters: [{ id: 11 }, { id: 12 }],
      pitchers: [],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([]),
      getTeamBattedBallsFn: vi.fn().mockResolvedValue(directBattedRows),
      getPlayerContactPointsFn,
    });
    expect(getPlayerContactPointsFn).not.toHaveBeenCalled();
    expect(result.source).toContain("verified team batted-ball query");
    expect(result.snapshot.exitVelocityRows).toEqual(directBattedRows);
    expect(result.snapshot.battedBallRows).toEqual(directBattedRows);
  });

  it("falls back to verified player rows when the direct team query is empty", async () => {
    const getPlayerContactPointsFn = vi
      .fn()
      .mockResolvedValue([{ launch_speed: 99 }]);
    const getPitcherPitchesFn = vi
      .fn()
      .mockResolvedValue([{ pitch_type: "SL", release_speed: 85 }]);
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: "LAD",
      season: 2026,
      cached: null,
      hitters: [{ id: 11 }],
      pitchers: [{ id: 22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([]),
      getPlayerContactPointsFn,
      getPitcherPitchesFn,
    });
    expect(result.source).toContain("verified roster rollup");
    expect(getPlayerContactPointsFn).toHaveBeenCalledWith(11, 2026);
    expect(getPitcherPitchesFn).toHaveBeenCalledWith(22, 2026);
    expect(result.snapshot.battedBallRows).toEqual([{ launch_speed: 99 }]);
  });

  it("does not persist an entirely unavailable Savant snapshot", async () => {
    const saveCacheFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: "LAD",
      season: 2026,
      cached: null,
      hitters: [{ id: 11 }],
      pitchers: [{ id: 22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([]),
      getPlayerContactPointsFn: vi.fn().mockResolvedValue([]),
      getPitcherPitchesFn: vi.fn().mockResolvedValue([]),
      saveCacheFn,
    });
    expect(result.snapshot).toEqual({
      exitVelocityRows: [],
      battedBallRows: [],
      pitchRows: [],
    });
    expect(saveCacheFn).not.toHaveBeenCalled();
  });

  it("formats honest age labels without calling fresh data stale", () => {
    const now = 1_700_000_000_000;
    expect(formatDataAge(now - 30_000, now)).toBe("just now");
    expect(formatDataAge(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatDataAge(null, now)).toBeNull();
  });
});
