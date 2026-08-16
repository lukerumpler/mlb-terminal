import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import handler, { __resetFanGraphsProviderStateForTests, __seedFanGraphsModelCacheForTests } from '../server/api/fangraphs-models.js';

function makeResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers.set(name, String(value)); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function makeRequest(url = '/api/fangraphs-models?team=LAD&season=2026') {
  return {
    method: 'GET',
    url,
    headers: { 'x-forwarded-for': 'provider-blocked-test' },
    socket: { remoteAddress: 'provider-blocked-test' },
  };
}

describe('FanGraphs provider-blocked proxy behavior', () => {
  beforeEach(() => {
    __resetFanGraphsProviderStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a stale verified snapshot when both model sources are Cloudflare-blocked', async () => {
    __seedFanGraphsModelCacheForTests('LAD', 2026, {
      found: true,
      retrievedAt: '2026-08-15T12:00:00.000Z',
      source: 'FanGraphs',
      playoffOdds: 81.2,
      teamWar: 39.7,
      statuses: { playoffOdds: 'live', teamWar: 'live' },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<title>Just a moment...</title> Cloudflare challenge', { status: 403 })));

    const response = makeResponse();
    await handler(makeRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      freshness: 'stale-cached',
      playoffOdds: 81.2,
      teamWar: 39.7,
      staleReason: 'FanGraphs provider blocked the request',
    }));
  });

  it('coalesces blocked model sources and suppresses repeat upstream work during cooldown', async () => {
    const fetchMock = vi.fn(async () => new Response('<html><title>Just a moment...</title> Cloudflare challenge</html>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = makeResponse();
    const second = makeResponse();
    await Promise.all([
      handler(makeRequest(), first),
      handler(makeRequest(), second),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.statusCode).toBe(502);
    expect(first.body).toEqual(expect.objectContaining({ providerBlocked: true }));
    expect(second.statusCode).toBe(502);
    expect(second.body).toEqual(expect.objectContaining({ providerBlocked: true }));

    const cooldownResponse = makeResponse();
    await handler(makeRequest(), cooldownResponse);
    expect(cooldownResponse.statusCode).toBe(503);
    expect(cooldownResponse.body.error).toMatch(/daily refresh already attempted/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
