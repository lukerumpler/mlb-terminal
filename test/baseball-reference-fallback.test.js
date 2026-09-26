import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  __resetFanGraphsProviderStateForTests,
  parseBaseballReferenceTeamWarHtml,
} from '../server/api/fangraphs-models.js';
import handler from '../server/api/fangraphs-models.js';

const baseballReferenceHtml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/baseball-reference-team-war.html'), 'utf8');

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

describe('Baseball-Reference aggregate WAR fallback', () => {
  beforeEach(() => __resetFanGraphsProviderStateForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('parses explicit team links and total WAR values', () => {
    expect(parseBaseballReferenceTeamWarHtml(baseballReferenceHtml, 2026)).toEqual([
      { team: 'Los Angeles Dodgers', battingWAR: null, pitchingWAR: null, totalWAR: 38, season: 2026 },
      { team: 'San Diego Padres', battingWAR: null, pitchingWAR: null, totalWAR: 30, season: 2026 },
    ]);
  });

  it('falls back after FanGraphs failure and labels the response source', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Cloudflare challenge', { status: 403 }))
      .mockResolvedValueOnce(new Response('Cloudflare challenge', { status: 403 }))
      .mockResolvedValueOnce(new Response(baseballReferenceHtml, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = makeResponse();
    await handler({
      method: 'GET',
      url: '/api/fangraphs-models?mode=aggregate&season=2026',
      headers: { 'x-forwarded-for': 'baseball-reference-fallback-test' },
      socket: { remoteAddress: 'baseball-reference-fallback-test' },
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      source: 'Baseball-Reference',
      fallback: true,
      teams: expect.arrayContaining([
        expect.objectContaining({ team: 'San Diego Padres', totalWAR: 30 }),
      ]),
      statuses: expect.objectContaining({ teamWar: 'fallback-live' }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
