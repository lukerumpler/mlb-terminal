import { describe, expect, it } from 'vitest';
import { appRouter } from '../server/routers';

describe('Server roster insights fallback', () => {
  it('does not emit a run-prevention strength when team.era is null or missing', async () => {
    const caller = appRouter.createCaller({ user: null });
    // We test the inner fallback logic indirectly or via AI router mock
    const res = await caller.ai.rosterInsights({
      team: { name: 'Los Angeles Dodgers', rs: 613, ra: 470, ops: 0.766, era: null, pct: 0.602 },
      roster: { hitting: [], pitching: [] },
    });
    const hasEraStrength = res.strengths.some(s => s.title.includes('Run prevention'));
    expect(hasEraStrength).toBe(false);
  });
});
