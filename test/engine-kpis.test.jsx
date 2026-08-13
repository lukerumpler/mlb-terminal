import { describe, it, expect } from 'vitest';
import { computeKPIs, getStrengths, getRisks } from '../client/src/engine/skip.js';

// Regression coverage for a bug found in a debug pass: `parseInt(stats.
// plateAppearances) || 1` meant a stats object missing plateAppearances
// got a fake denominator of 1, so bb/pa and k/pa blew up into nonsense
// (e.g. "9800.0% BB rate", "14800.0% K rate") instead of degrading
// gracefully. Real MLB API responses always include the field, so this
// never fired against live data — but any other stats source (a partial
// response, a differently-shaped feed) would have hit it silently.

const statsWithPA = { ops:'0.850', avg:'0.280', baseOnBalls:70, strikeOuts:110, plateAppearances:600, slg:'0.480' };
const statsNoPA = { ops:'0.850', avg:'0.280', baseOnBalls:98, strikeOuts:148, slg:'0.480' }; // plateAppearances missing entirely
const statsZeroPA = { ...statsWithPA, plateAppearances:0 };

describe('computeKPIs — plateAppearances edge cases', () => {
  it('produces a normal, clamped DQS when plateAppearances is present', () => {
    const kpis = computeKPIs(statsWithPA, false);
    expect(kpis.DQS).toBeGreaterThanOrEqual(20);
    expect(kpis.DQS).toBeLessThanOrEqual(99);
    expect(Number.isNaN(kpis.DQS)).toBe(false);
  });

  it('does not blow up or NaN when plateAppearances is missing', () => {
    const kpis = computeKPIs(statsNoPA, false);
    expect(kpis.DQS).toBeGreaterThanOrEqual(20);
    expect(kpis.DQS).toBeLessThanOrEqual(99);
    expect(Number.isNaN(kpis.DQS)).toBe(false);
  });

  it('treats plateAppearances: 0 the same as missing, not as a real zero denominator', () => {
    const kpis = computeKPIs(statsZeroPA, false);
    expect(kpis.DQS).toBeGreaterThanOrEqual(20);
    expect(kpis.DQS).toBeLessThanOrEqual(99);
  });
});

describe('getStrengths — BB rate flag', () => {
  it('shows a real BB rate flag when plateAppearances is present and BB% qualifies', () => {
    const highBB = { ...statsWithPA, baseOnBalls:80 }; // 80/600 = 13.3%, above the >=12% threshold
    const strengths = getStrengths(highBB, computeKPIs(highBB, false), false);
    const bbFlag = strengths.find(s => s.includes('BB rate'));
    expect(bbFlag).toBeDefined();
    expect(bbFlag).toContain('13.3%');
  });

  it('never shows a triple/quadruple-digit percentage when plateAppearances is missing', () => {
    const strengths = getStrengths(statsNoPA, computeKPIs(statsNoPA, false), false);
    const bbFlag = strengths.find(s => s.includes('BB rate'));
    // The bug's exact symptom: 98 BB with no PA data used to render "9800.0% BB rate".
    expect(bbFlag).toBeUndefined();
    strengths.forEach(s => expect(s).not.toMatch(/\d{3,}\.\d%/));
  });
});

describe('getRisks — K rate flag', () => {
  it('never shows a triple/quadruple-digit percentage when plateAppearances is missing', () => {
    const risks = getRisks(statsNoPA, {}, false);
    const kFlag = risks.find(s => s.includes('K rate'));
    // The bug's exact symptom: 148 K with no PA data used to render "14800.0% K rate".
    expect(kFlag).toBeUndefined();
    risks.forEach(s => expect(s).not.toMatch(/\d{3,}\.\d%/));
  });

  it('shows a real K rate flag when plateAppearances is present and K% qualifies', () => {
    const highK = { ...statsWithPA, strikeOuts:200 }; // 200/600 = 33.3%, above the >27% threshold
    const risks = getRisks(highK, {}, false);
    const kFlag = risks.find(s => s.includes('K rate'));
    expect(kFlag).toBeDefined();
    expect(kFlag).toContain('33.3%');
  });
});
