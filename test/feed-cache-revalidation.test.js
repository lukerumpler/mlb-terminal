import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetFeedClientStateForTests, fetchFeeds } from '../client/src/api/feed.js';

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

const providerPayload = {
  items: [{ id:'post-1', handle:'MLB', sourceKey:'MLB', text:'Verified source post', isoDate:'2026-08-18T00:00:00.000Z' }],
  sourceStatuses: [{ tier:1, key:'MLB', label:'MLB', ok:true }],
  sources: ['MLB'],
  status: 'tier-1',
};

describe('Intel Feed stale revalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));
    __resetFeedClientStateForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetFeedClientStateForTests();
  });

  it('revalidates a stale snapshot once, then serves it with a bounded retry cooldown if the refresh fails', async () => {
    fetch.mockResolvedValueOnce(response(providerPayload));
    const first = await fetchFeeds(['MLB'], 12);
    expect(first.freshness).toBe('live');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    fetch.mockRejectedValueOnce(new Error('temporary source outage'));
    const stale = await fetchFeeds(['MLB'], 12);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(stale.status).toBe('cached-fallback');
    expect(stale.freshness).toBe('stale-cached');
    expect(stale.items).toHaveLength(1);

    const cooledDown = await fetchFeeds(['MLB'], 12);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cooledDown.reason).toBe('revalidation-cooldown');
    expect(cooledDown.items).toHaveLength(1);
  });
});
