import { describe, expect, it } from 'vitest';
import { fmtWinPct } from '../client/src/lib/formatting.js';

describe('baseball winning-percentage formatting', () => {
  it('uses scorebook-style leading-decimal notation for fractional record percentages', () => {
    expect(fmtWinPct(0.598)).toBe('.598');
    expect(fmtWinPct('0.625')).toBe('.625');
    expect(fmtWinPct(0.5946)).toBe('.595');
  });

  it('preserves valid boundary values and reports unavailable or invalid input honestly', () => {
    expect(fmtWinPct(0)).toBe('.000');
    expect(fmtWinPct(1)).toBe('1.000');
    expect(fmtWinPct(null)).toBe('—');
    expect(fmtWinPct(1.2)).toBe('—');
  });
});
