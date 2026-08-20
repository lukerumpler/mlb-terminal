import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadFullPlayer, getHandednessSplits, __resetMlbClientStateForTests } = await import('../client/src/api/mlb.js');

function response(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => data,
    text: async () => '',
  };
}

function failedResponse(status = 503) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => '',
  };
}

function seasonStats(group, stat = {}) {
  return {
    stats: [{
      group: { displayName: group },
      splits: [{ isTotal: true, sport: { id: 1 }, stat }],
    }],
  };
}

describe('Player Profile pitcher request budget', () => {
  beforeEach(() => {
    __resetMlbClientStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetMlbClientStateForTests();
  });

  it('skips hitter-only handedness split requests for pitchers while preserving an explicit unavailable split result', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/contract')) return response({ found: false });
      if (url.includes('/api/team-financials')) return response({ found: false });
      if (url.includes('/api/player-advanced')) return response({});
      if (url.includes('/api/savant')) {
        if (url.includes('endpoint=bat-tracking')) return response([{ id: 404 }]);
        if (url.includes('endpoint=pitch_arsenal')) return response([{ pitcher_id: 404 }]);
        if (url.includes('endpoint=pitcher_pitches')) return response([{ pitcher_id: 404 }]);
        if (url.includes('endpoint=expected_statistics') || url.includes('endpoint=statcast_leaderboard')) return response([{ player_id: 404 }]);
        return response([]);
      }

      const parsed = new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space');
      const path = parsed.searchParams.get('path');
      if (path === '/people/404') {
        return response({ people: [{
          id: 404,
          fullName: 'Budget Pitcher',
          primaryPosition: { type: 'Pitcher', abbreviation: 'P' },
          currentTeam: { id: 119, abbreviation: 'LAD', sport: { id: 1 } },
        }] });
      }
      if (path === '/schedule') return response({ dates: [] });
      if (path === '/people/404/stats') {
        const group = parsed.searchParams.get('group');
        if (group === 'pitching') return response(seasonStats('pitching', { era: '3.20', inningsPitched: '10.0' }));
        return response(seasonStats(group || 'hitting', { atBats: 1 }));
      }
      return response({});
    }));

    const player = await loadFullPlayer({ id: 404, fullName: 'Budget Pitcher', team: 'LAD' }, 2026);

    expect(player.isPitcher).toBe(true);
    expect(player.handednessSplits).toMatchObject({ rows: [], careerRows: [], status: 'unavailable' });
    expect(urls.some(url => url.includes('sitCodes'))).toBe(false);
    const playerStatsRequests = urls.map(url => new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space'))
      .filter(url => url.searchParams.get('path') === '/people/404/stats');
    expect(playerStatsRequests.some(url => url.searchParams.get('stats') === 'yearByYear' && url.searchParams.get('group') === 'hitting')).toBe(false);
    expect(playerStatsRequests.some(url => url.searchParams.get('stats') === 'yearByYear' && url.searchParams.get('group') === 'pitching')).toBe(true);
  });

  it('does not start supplemental enrichment after the player selection is aborted at core publication', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      urls.push(url);
      const parsed = new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space');
      const path = parsed.searchParams.get('path');
      if (path === '/people/405') {
        return response({ people: [{
          id: 405,
          fullName: 'Canceled Pitcher',
          primaryPosition: { type: 'Pitcher', abbreviation: 'P' },
          currentTeam: { id: 119, abbreviation: 'LAD', sport: { id: 1 } },
        }] });
      }
      if (path === '/people/405/stats') {
        const group = parsed.searchParams.get('group');
        return response(seasonStats(group || 'hitting', group === 'pitching' ? { era: '3.20' } : { atBats: 1 }));
      }
      return response({});
    }));

    const controller = new AbortController();
    await expect(loadFullPlayer(
      { id: 405, fullName: 'Canceled Pitcher', team: 'LAD' },
      2026,
      { signal: controller.signal, onCoreReady: () => controller.abort() },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(urls.some(url => /\/api\/(contract|team-financials|player-advanced|savant)/.test(url))).toBe(false);
    expect(urls.some(url => url.includes(encodeURIComponent('/schedule')))).toBe(false);
  });

  it('cancels in-flight important MLB work and does not enter optional enrichment after a player switch', async () => {
    let careerSignal;
    const urls = [];
    vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
      const url = String(input);
      urls.push(url);
      const parsed = new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space');
      const path = parsed.searchParams.get('path');
      const stats = parsed.searchParams.get('stats');
      const group = parsed.searchParams.get('group');
      if (path === '/people/408') {
        return Promise.resolve(response({ people: [{
          id: 408,
          fullName: 'Important Canceled Pitcher',
          primaryPosition: { type: 'Pitcher', abbreviation: 'P' },
          currentTeam: { id: 119, abbreviation: 'LAD', sport: { id: 1 } },
        }] }));
      }
      if (path === '/people/408/stats' && stats === 'yearByYear' && group === 'pitching') {
        careerSignal = init.signal;
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })), { once: true });
        });
      }
      if (url.includes('/api/contract')) return Promise.resolve(response({ found: false }));
      if (url.includes('/api/team-financials')) return Promise.resolve(response({ found: false }));
      if (url.includes('/api/player-advanced')) return Promise.resolve(response({}));
      if (path === '/people/408/stats') {
        return Promise.resolve(response(seasonStats(group || 'hitting', group === 'pitching' ? { era: '3.20' } : { atBats: 1 })));
      }
      return Promise.resolve(response({}));
    }));

    const controller = new AbortController();
    const result = loadFullPlayer(
      { id: 408, fullName: 'Important Canceled Pitcher', team: 'LAD' },
      2026,
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(careerSignal).toBeDefined());
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(careerSignal.aborted).toBe(true);
    expect(urls.some(url => url.includes('/api/savant'))).toBe(false);
    expect(urls.some(url => url.includes(encodeURIComponent('/schedule')))).toBe(false);
  });

  it('propagates cancellation into active optional Savant work before an optional profile snapshot can publish', async () => {
    let sprintSpeedSignal;
    const onOptionalReady = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
      const url = String(input);
      if (url.includes('/api/savant?endpoint=sprint_speed')) {
        sprintSpeedSignal = init.signal;
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })), { once: true });
        });
      }
      if (url.includes('/api/savant')) return Promise.resolve(response([]));
      if (url.includes('/api/contract')) return Promise.resolve(response({ found: false }));
      if (url.includes('/api/team-financials')) return Promise.resolve(response({ found: false }));
      if (url.includes('/api/player-advanced')) return Promise.resolve(response({}));

      const parsed = new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space');
      const path = parsed.searchParams.get('path');
      const group = parsed.searchParams.get('group');
      const stats = parsed.searchParams.get('stats');
      if (path === '/people/409') {
        return Promise.resolve(response({ people: [{
          id: 409,
          fullName: 'Optional Canceled Batter',
          primaryPosition: { type: 'Outfielder', abbreviation: 'CF' },
          currentTeam: { id: 119, abbreviation: 'LAD', sport: { id: 1 } },
        }] }));
      }
      if (path === '/schedule') return Promise.resolve(response({ dates: [] }));
      if (path === '/people/409/stats') {
        if (stats === 'yearByYear' || stats === 'career') return Promise.resolve(response({ stats: [] }));
        return Promise.resolve(response(seasonStats(group || 'hitting', group === 'hitting' ? { atBats: 10, ops: '.800' } : {})));
      }
      return Promise.resolve(response({}));
    }));

    const controller = new AbortController();
    const operation = loadFullPlayer(
      { id: 409, fullName: 'Optional Canceled Batter', team: 'LAD' },
      2026,
      { signal: controller.signal, onOptionalReady },
    );
    await vi.waitFor(() => expect(sprintSpeedSignal).toBeDefined());
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(sprintSpeedSignal.aborted).toBe(true);
    expect(onOptionalReady).not.toHaveBeenCalled();
  });

  it('starts current-season and career handedness split reads in parallel for batters', async () => {
    const releases = {};
    vi.stubGlobal('fetch', vi.fn(input => {
      const url = new URL(String(input), 'https://skipbasebal-mm6hz9ps.manus.space');
      const stats = url.searchParams.get('stats');
      return new Promise(resolve => {
        releases[stats] = resolve;
      });
    }));

    const resultPromise = getHandednessSplits(406, 2026, {
      priority: 'important', stage: 'important', screen: 'player-profile',
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    const split = code => ({
      split: { code },
      stat: { avg: '.300', ops: '.800', hits: 3, atBats: 10 },
    });
    releases.season(response({ stats: [{ group: { displayName: 'hitting' }, splits: [split('vl'), split('vr')] }] }));
    releases.yearByYear(response({ stats: [{ group: { displayName: 'hitting' }, splits: [split('vl'), split('vr')] }] }));

    await expect(resultPromise).resolves.toMatchObject({
      season: 2026,
      isFallback: false,
      rows: [{ side: 'LHP' }, { side: 'RHP' }],
      careerRows: [{ side: 'LHP' }, { side: 'RHP' }],
    });
  });

  it('does not double a player-scoped Savant request into the prior season after an upstream failure', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/api/contract')) return response({ found: false });
      if (url.includes('/api/team-financials')) return response({ found: false });
      if (url.includes('/api/player-advanced')) return response({});
      if (url.includes('/api/savant')) {
        if (url.includes('endpoint=contact_points')) return failedResponse(503);
        return response([]);
      }

      const parsed = new URL(url, 'https://skipbasebal-mm6hz9ps.manus.space');
      const path = parsed.searchParams.get('path');
      if (path === '/people/407') {
        return response({ people: [{
          id: 407,
          fullName: 'Budget Batter',
          primaryPosition: { type: 'Infielder', abbreviation: 'SS' },
          currentTeam: { id: 119, abbreviation: 'LAD', sport: { id: 1 } },
        }] });
      }
      if (path === '/schedule') return response({ dates: [] });
      if (path === '/people/407/stats') {
        const group = parsed.searchParams.get('group');
        return response(seasonStats(group || 'hitting', group === 'hitting' ? { atBats: 12, ops: '.800' } : {}));
      }
      return response({});
    }));

    const player = await loadFullPlayer({ id: 407, fullName: 'Budget Batter', team: 'LAD' }, 2026);
    const contactRequests = urls.filter(url => url.includes('endpoint=contact_points'));

    expect(player.isPitcher).toBe(false);
    expect(contactRequests).toHaveLength(1);
    expect(contactRequests[0]).toContain('year=2026');
    expect(contactRequests.some(url => url.includes('year=2025'))).toBe(false);
  }, 15_000);
});
