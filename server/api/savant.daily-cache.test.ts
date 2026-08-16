import { afterEach, describe, expect, it, vi } from 'vitest';
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
    socket: { remoteAddress: 'nightly-cache-test' },
  };
}

describe('Savant daily proxy cache', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    __resetSavantStateForTests();
  });

  it('does not call Baseball Savant again within the same daily cache window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T02:00:00.000Z'));
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'launch_speed,launch_angle\n97,12\n',
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', upstream);

    const first = createResponse();
    const second = createResponse();
    await handler(createRequest(), first);
    vi.setSystemTime(new Date('2026-08-15T23:00:00.000Z'));
    await handler(createRequest(), second);

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(first.headers['X-Provider-Cache']).toBe('MISS');
    expect(second.headers['X-Provider-Cache']).toBe('HIT');
    expect(second.headers['Cache-Control']).toContain('s-maxage=86400');
  });

  it('rejects an HTML leaderboard response instead of treating it as CSV data', async () => {
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<!DOCTYPE html><html><body>Interactive leaderboard</body></html>',
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', upstream);

    const response = createResponse();
    await handler(createRequest(), response);

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(502);
    expect(response.body).toMatchObject({
      error: 'Savant returned HTML — endpoint may be unavailable for this year',
      year: '2026',
    });
    expect(response.headers['X-Provider-Cache']).toBeUndefined();
  });
});
