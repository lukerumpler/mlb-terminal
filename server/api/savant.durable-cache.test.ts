import { afterEach, describe, expect, it, vi } from 'vitest';

const { readDurableCache, writeDurableCache } = vi.hoisted(() => ({
  readDurableCache: vi.fn(),
  writeDurableCache: vi.fn(),
}));
vi.mock('../durable-cache', () => ({ readDurableCache, writeDurableCache }));

import handler, { __resetSavantStateForTests } from './savant.js';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  json: (value: unknown) => MockResponse;
};

function createResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { response.statusCode = code; return response; },
    setHeader(name, value) { response.headers[name] = value; return response; },
    json(value) { response.body = value; return response; },
  };
  return response;
}

function createRequest() {
  return {
    method: 'GET',
    query: { endpoint: 'team_exit_velocity', year: '2026', team: 'LAD' },
    headers: {},
    socket: { remoteAddress: 'durable-cache-test' },
  };
}

describe('Savant durable shared cache', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    readDurableCache.mockReset();
    writeDurableCache.mockReset();
    __resetSavantStateForTests();
  });

  it('serves a fresh durable response without calling Baseball Savant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    readDurableCache.mockResolvedValue({
      source: 'Baseball Savant',
      data: [{ launch_speed: '97' }],
      freshUntil: new Date('2026-08-17T00:00:00.000Z'),
      staleUntil: new Date('2026-08-24T00:00:00.000Z'),
    });
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = createResponse();
    await handler(createRequest(), response);

    expect(upstream).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.headers['X-Provider-Cache']).toBe('DURABLE-HIT');
    expect(response.body).toEqual([{ launch_speed: '97' }]);
  });

  it('serves stale durable data when the provider fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'));
    readDurableCache.mockResolvedValue({
      source: 'Baseball Savant',
      data: [{ launch_speed: '97' }],
      freshUntil: new Date('2026-08-17T00:00:00.000Z'),
      staleUntil: new Date('2026-08-24T00:00:00.000Z'),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')));

    const response = createResponse();
    await handler(createRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.headers['X-Provider-Cache']).toBe('STALE');
    expect(response.headers['X-Provider-Freshness']).toBe('stale-cached');
    expect(response.body).toEqual([{ launch_speed: '97' }]);
  });
});

