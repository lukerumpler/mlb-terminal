import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getStandings,
  getTeamAffiliates,
  getTodaysGames,
  getMiLBGames,
  getAllTeamStats,
  getTeamPlayerStats,
  getMinorLeagueTeamSchedule,
  getTeamScheduleSplits,
  mlb,
  __resetMlbClientStateForTests,
  fetchTeamFinancials,
  getGameFeedMetadata,
  getTeamVenueMetadata,
  __resetTeamVenueMetadataCacheForTests,
} = await import('../client/src/api/mlb.js');

describe('MLB request cache optimization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetMlbClientStateForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ records: [], teams: [] }),
      text: async () => '',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
    __resetTeamVenueMetadataCacheForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps standings cached for repeated reads within the five-minute window', async () => {
    await getStandings(2098);
    vi.advanceTimersByTime(60_000);
    await getStandings(2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps affiliate metadata cached for repeated reads within the ten-minute window', async () => {
    await getTeamAffiliates(9998, 2098);
    vi.advanceTimersByTime(5 * 60_000);
    await getTeamAffiliates(9998, 2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caches MLB and MiLB daily schedule helpers for one minute', async () => {
    await getTodaysGames('2098-08-01');
    await getTodaysGames('2098-08-01');
    await getMiLBGames('2098-08-01', [11, 12]);
    await getMiLBGames('2098-08-01', [11, 12]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches aggregate and player team-stat helpers for one minute', async () => {
    await getAllTeamStats('hitting', 2098);
    await getAllTeamStats('hitting', 2098);
    await getTeamPlayerStats(9997, 'hitting', 2098);
    await getTeamPlayerStats(9997, 'hitting', 2098);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('extracts recorded MLB weather and constructs an official Gameday link', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ gameData: { weather: { condition: 'Clear', temp: '72° F', wind: '5 mph' } } }) });
    await expect(getGameFeedMetadata(123456)).resolves.toMatchObject({ weather: { condition: 'Clear', temp: '72° F', wind: '5 mph' }, mediaUrl: 'https://www.mlb.com/gameday/123456' });
  });

  it('loads official venue metadata and caches it for one day', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ teams: [{ venue: { id: 1, name: 'Dodger Stadium' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ venues: [{ id: 1, name: 'Dodger Stadium', fieldInfo: { capacity: 56000, turfType: 'Grass', roofType: 'Open', leftLine: 330, leftCenter: 375, center: 395, rightCenter: 375, rightLine: 330 }, location: { latitude: 34.0739, longitude: -118.2400 } }] }) });
    await expect(getTeamVenueMetadata(119)).resolves.toMatchObject({ status: 'live', venue: { name: 'Dodger Stadium', capacity: 56000, surface: 'Grass', roof: 'Open', latitude: 34.0739 } });
    await expect(getTeamVenueMetadata(119)).resolves.toMatchObject({ freshness: 'cached', venue: { name: 'Dodger Stadium' } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aggregates schedule-derived Home/Away and Day/Night W–L rows and caches the result', async () => {
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ dates: [{ games: [{ status: { abstractGameState: 'Final' }, dayNight: 'day', teams: { home: { team: { id: 9995 }, isWinner: true }, away: { team: { id: 9994 }, isWinner: false } } }] }] }),
      text: async () => '',
    });
    const rows = await getTeamScheduleSplits(9995, 2026);
    expect(rows.find(row => row.split === 'Home')).toMatchObject({ w: expect.any(Number), l: 0, ops: '—', era: '—' });
    expect(rows.find(row => row.split === 'Day')).toMatchObject({ w: expect.any(Number), l: 0 });
    const calls = fetch.mock.calls.length;
    await getTeamScheduleSplits(9995, 2026);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it('caches affiliate schedule windows for one minute', async () => {
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('pauses queued requests after a proxy 429 instead of sending a burst', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => '1' },
        text: async () => '{"error":"rate limited"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ teams: [{ id: 238 }] }),
        text: async () => '',
      });

    await expect(mlb('/teams/238', { hydrate: 'venue' })).rejects.toMatchObject({ status: 429 });
    const queued = mlb('/teams/238/stats', { stats: 'season', group: 'pitching', season: 2098 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    await expect(queued).resolves.toEqual({ teams: [{ id: 238 }] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  it('allows Spotrac data to retry after a transient rate limit', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ found: true, teamAbbr: 'ZZZ', season: 2098 }) });

    await expect(fetchTeamFinancials('ZZZ', 2098)).resolves.toBeNull();
    await expect(fetchTeamFinancials('ZZZ', 2098)).resolves.toMatchObject({ found: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a verified stale response when a refresh is rate-limited', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const verified = { teams: [{ id: 238, name: 'Los Angeles Dodgers' }] };
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => verified, text: async () => '' })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => '1' },
        text: async () => '',
      });

    await expect(mlb('/teams/238', {}, { ttl: 1_000 })).resolves.toEqual(verified);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(mlb('/teams/238', {}, { ttl: 1_000 })).resolves.toEqual(verified);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('[mlb] proxy rate limit; using verified cached response', '/teams/238');
  });
});
