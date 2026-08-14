import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTeamAggregateCache, readTeamPlayersCache, saveTeamAggregateCache, saveTeamPlayersCache, readTeamSavantCache, saveTeamSavantCache } from '../client/src/lib/teamDataCache.js';
import { buildBattedBallProfile, buildPitchArsenalRows, buildLiveRadarData, buildLiveRunDiffData, formatDataAge, resolveTeamSavantSnapshot } from '../client/src/pages/OverviewPage.jsx';

describe('team data cache and freshness helpers', () => {
  it('normalizes a verified current-season run differential without retaining mock game rows', () => {
    expect(buildLiveRunDiffData({ diff: 42 }, 2026)).toEqual([{ game: '2026', diff: 42, cum: 42 }]);
    expect(buildLiveRunDiffData({ diff: null }, 2026)).toEqual([]);
  });

  it('builds both radar datasets from live team aggregates and preserves unavailable states', () => {
    const liveTeamData = { byAbbr: {
      LAD: { standings:{ diff:42 }, hitting:{ ops:.802, homeRuns:98, stolenBases:54, avg:.260, slg:.430, obp:.330 }, pitching:{ era:3.10, whip:1.08 } },
      NYY: { standings:{ diff:10 }, hitting:{ ops:.750, homeRuns:80, stolenBases:30, avg:.240, slg:.400, obp:.320 }, pitching:{ era:4.20, whip:1.30 } },
    } };
    const data = buildLiveRadarData({ team:{ ops:.802, hr:98, sb:54, avg:.260, slg:.430, obp:.330, era:3.10, whip:1.08 }, liveTeamData, runDiff:42 });
    expect(data.source).toContain('MLB Stats API');
    expect(data.offenseData.map(row => row.axis)).toEqual(['OPS','SLG','OBP','HR','SB','Run Diff']);
    expect(data.strengthData.map(row => row.axis)).toContain('Pitching');
    expect(buildLiveRadarData({ team:{}, liveTeamData:null }).offenseData).toEqual([]);
    expect(buildLiveRadarData({ team:{}, liveTeamData:null }).strengthData).toEqual([]);
  });

  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('stores only season-matched aggregate snapshots', () => {
    const data = { byAbbr:{ LAD:{ standings:{ w:73, l:48 } } }, byId:{} };
    saveTeamAggregateCache(data, 2026);
    expect(readTeamAggregateCache(2026)).toMatchObject({ season:2026, data });
    expect(readTeamAggregateCache(2025)).toBeNull();
  });

  it('stores team-specific player rows independently', () => {
    saveTeamPlayersCache(119, 2026, { hitting:[{ id:1 }], pitching:[] });
    saveTeamPlayersCache(147, 2026, { hitting:[{ id:2 }], pitching:[] });
    expect(readTeamPlayersCache(119, 2026)?.data.hitting[0].id).toBe(1);
    expect(readTeamPlayersCache(147, 2026)?.data.hitting[0].id).toBe(2);
    expect(readTeamPlayersCache(119, 2025)).toBeNull();
  });

  it('stores team-scoped Savant snapshots by season and abbreviation', () => {
    const data = { exitVelocityRows:[{ launch_speed:102 }], battedBallRows:[], pitchRows:[] };
    saveTeamSavantCache('lad', 2026, data);
    expect(readTeamSavantCache('LAD', 2026)).toMatchObject({ season:2026, teamAbbr:'LAD', data });
    expect(readTeamSavantCache('LAD', 2025)).toBeNull();
  });

  it('builds verified batted-ball metrics without inventing spray direction', () => {
    const data = buildBattedBallProfile([
      { launch_speed:100, launch_angle:20, launch_speed_angle:6, bb_type:'line_drive' },
      { launch_speed:90, launch_angle:4, launch_speed_angle:0, bb_type:'ground_ball' },
    ]);
    expect(data).toMatchObject({ barrelPct:50, hardHitPct:50, sweetSpot:50, avgEV:'95.0', maxEV:'100.0', gbPct:50, ldPct:50 });
    expect(data.pullPct).toBeNull();
  });

  it('builds pitch usage from verified pitch rows and leaves Stuff+ unavailable', () => {
    const data = buildPitchArsenalRows([
      { pitch_type:'FF', release_speed:95 },
      { pitch_type:'FF', release_speed:96 },
      { pitch_type:'SL', release_speed:85 },
    ]);
    expect(data?.[0]).toMatchObject({ type:'FF', pct:66.7, avgVelocity:95.5, stuffPlus:null });
    expect(data?.[1]).toMatchObject({ type:'SL', pct:33.3, avgVelocity:85 });
  });

  it('uses a fresh cached Savant snapshot without issuing network requests', async () => {
    const getTeamExitVelocityFn = vi.fn();
    const getPlayerContactPointsFn = vi.fn();
    const getPitcherPitchesFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr:'LAD', season:2026,
      cached:{ updatedAt:1_000, data:{ exitVelocityRows:[{ launch_speed:101 }], battedBallRows:[], pitchRows:[] } },
      now:1_100,
      getTeamExitVelocityFn, getPlayerContactPointsFn, getPitcherPitchesFn,
    });
    expect(result.cacheHit).toBe(true);
    expect(result.source).toContain('cached');
    expect(getTeamExitVelocityFn).not.toHaveBeenCalled();
    expect(getPlayerContactPointsFn).not.toHaveBeenCalled();
    expect(getPitcherPitchesFn).not.toHaveBeenCalled();
  });

  it('uses direct team rows and roster-player pitch rows on a cache miss', async () => {
    const saveCacheFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr:'LAD', season:2026,
      cached:null,
      hitters:[{ id:11 }], pitchers:[{ id:22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([{ launch_speed:101 }]),
      getPlayerContactPointsFn: vi.fn(),
      getPitcherPitchesFn: vi.fn().mockResolvedValue([{ pitch_type:'FF', release_speed:96 }]),
      saveCacheFn,
    });
    expect(result.cacheHit).toBe(false);
    expect(result.snapshot.exitVelocityRows).toHaveLength(1);
    expect(result.snapshot.pitchRows).toEqual([{ pitch_type:'FF', release_speed:96 }]);
    expect(saveCacheFn).toHaveBeenCalledWith('LAD', 2026, result.snapshot);
  });

  it('falls back to verified player rows when the direct team query is empty', async () => {
    const getPlayerContactPointsFn = vi.fn().mockResolvedValue([{ launch_speed:99 }]);
    const getPitcherPitchesFn = vi.fn().mockResolvedValue([{ pitch_type:'SL', release_speed:85 }]);
    const result = await resolveTeamSavantSnapshot({
      teamAbbr:'LAD', season:2026, cached:null,
      hitters:[{ id:11 }], pitchers:[{ id:22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([]),
      getPlayerContactPointsFn, getPitcherPitchesFn,
    });
    expect(result.source).toContain('verified roster rollup');
    expect(getPlayerContactPointsFn).toHaveBeenCalledWith(11, 2026);
    expect(getPitcherPitchesFn).toHaveBeenCalledWith(22, 2026);
    expect(result.snapshot.battedBallRows).toEqual([{ launch_speed:99 }]);
  });

  it('does not persist an entirely unavailable Savant snapshot', async () => {
    const saveCacheFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr:'LAD', season:2026, cached:null,
      hitters:[{ id:11 }], pitchers:[{ id:22 }],
      getTeamExitVelocityFn: vi.fn().mockResolvedValue([]),
      getPlayerContactPointsFn: vi.fn().mockResolvedValue([]),
      getPitcherPitchesFn: vi.fn().mockResolvedValue([]),
      saveCacheFn,
    });
    expect(result.snapshot).toEqual({ exitVelocityRows:[], battedBallRows:[], pitchRows:[] });
    expect(saveCacheFn).not.toHaveBeenCalled();
  });

  it('formats honest age labels without calling fresh data stale', () => {
    const now = 1_700_000_000_000;
    expect(formatDataAge(now - 30_000, now)).toBe('just now');
    expect(formatDataAge(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatDataAge(null, now)).toBeNull();
  });
});
