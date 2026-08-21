// @vitest-environment node
import { describe, expect, it } from 'vitest';

const apiOrigin = String(process.env.VITE_API_BASE || '').replace(/\/$/, '');
const browserOrigin = String(process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(value => value.trim())
  .find(Boolean);

describe('production origin contract', () => {
  it('allows the configured production frontend to read the lightweight managed API health endpoint', async () => {
    expect(apiOrigin).toMatch(/^https:\/\//);
    expect(browserOrigin).toMatch(/^https:\/\//);

    const response = await fetch(`${apiOrigin}/api/cache-health`, {
      headers: { Origin: browserOrigin },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get('access-control-allow-origin')).toBe(browserOrigin);
    expect(response.headers.get('vary') || '').toMatch(/origin/i);
  }, 20_000);
});
