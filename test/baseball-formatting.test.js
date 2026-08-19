import { describe, expect, it } from 'vitest';
import { fmtScorebookRate, fmtWinPct } from '../client/src/lib/formatting.js';

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

describe('baseball AVG and OPS formatting', () => {
  it('uses scorebook notation for batting average and OPS while retaining values above one', () => {
    expect(fmtScorebookRate(0.276)).toBe('.276');
    expect(fmtScorebookRate('0.845')).toBe('.845');
    expect(fmtScorebookRate(1.017)).toBe('1.017');
    expect(fmtScorebookRate(0)).toBe('.000');
  });
});
