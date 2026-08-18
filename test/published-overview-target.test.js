import { describe, expect, it } from 'vitest';
import { LOCAL_PUBLISHED_OVERVIEW_FALLBACK, resolvePublishedOverviewTarget } from './helpers/publishedOverviewTarget.js';

describe('published Overview E2E target selection', () => {
  it('uses the explicit deployment candidate when one is supplied', () => {
    expect(resolvePublishedOverviewTarget({ SKIP_LIVE_URL: 'https://candidate.example/?e2e=overview-default', CI: 'true' })).toBe('https://candidate.example/?e2e=overview-default');
  });

  it('requires an explicit deployment candidate in CI', () => {
    expect(() => resolvePublishedOverviewTarget({ CI: 'true' })).toThrow(/SKIP_LIVE_URL/);
  });

  it('keeps the managed-Manus target as a local-only fallback', () => {
    expect(resolvePublishedOverviewTarget({})).toBe(LOCAL_PUBLISHED_OVERVIEW_FALLBACK);
  });
});
