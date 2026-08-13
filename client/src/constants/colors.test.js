import { describe, expect, it } from 'vitest';
import { C, px, sans } from './colors.js';

describe('SKIP design tokens', () => {
  it('keeps the core dashboard colors theme-aware', () => {
    expect(C.bg).toBe('var(--bg)');
    expect(C.surface).toBe('var(--surface)');
    expect(C.navy).toBe('var(--navy)');
    expect(C.amber).toBe('var(--amber)');
  });

  it('applies the intended typography families to helper styles', () => {
    expect(px({ fontSize: 12 })).toMatchObject({
      fontFamily: "'DM Mono', monospace",
      fontSize: 12,
    });
    expect(sans({ fontWeight: 700 })).toMatchObject({
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      fontWeight: 700,
    });
  });
});
