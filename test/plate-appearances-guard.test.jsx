import { describe, it, expect } from 'vitest';
import { computeKPIs, getStrengths, getRisks } from '../client/src/engine/skip.js';

// Regression coverage for a real bug found during local mock-data QA of the
// player-profile page: computeKPIs/getStrengths/getRisks all defaulted a
// missing `plateAppearances` to `1` (`parseInt(stats.plateAppearances) || 1`),
// so bb/pa and k/pa silently blew up to values like 98/1 and 148/1 instead
// of failing safely — surfacing in the UI as "9800.0% BB rate" and
// "14800.0% K rate". Real MLB Stats API responses always include
// plateAppearances, so this essentially never fires against production
// data, but nothing should render a triple-digit-thousands percentage no
// matter how it gets there — these lock in the safe behavior directly.

const statsWithoutPA = {
  ops: '.850', avg: '.280', baseOnBalls: 98, strikeOuts: 148,
  slg: '.520', homeRuns: 30, stolenBases: 5,
  // plateAppearances deliberately omitted
};

describe('plateAppearances guard (engine/skip.js)', () => {
  it('computeKPIs does not blow up DQS when plateAppearances is missing', () => {
    const kpis = computeKPIs(statsWithoutPA, false);
    // With the old `|| 1` fallback this was clamp(30 + 98*300 - 148*150),
    // wildly out of the intended 0-99 KPI scale even after clamping to a
    // boundary. With the fix, bb/pa and k/pa both fall back to 0, so DQS
    // should sit at the neutral base term (30) rather than at a clamped
    // extreme driven by nonsense math.
    expect(kpis.DQS).toBe(30);
    expect(kpis.DQS).toBeGreaterThanOrEqual(0);
    expect(kpis.DQS).toBeLessThanOrEqual(99);
  });

  it('computeKPIs uses the real rate once plateAppearances is present', () => {
    const withPA = { ...statsWithoutPA, plateAppearances: 420 };
    const kpis = computeKPIs(withPA, false);
    // bb/pa = 98/420 ≈ .233, k/pa = 148/420 ≈ .352
    const expectedDQS = Math.max(0, Math.min(99, Math.round(30 + (98 / 420) * 300 - (148 / 420) * 150)));
    expect(kpis.DQS).toBe(expectedDQS);
  });

  it('getStrengths never emits a nonsensical BB-rate percentage when PA is missing', () => {
    const kpis = computeKPIs(statsWithoutPA, false);
    const strengths = getStrengths(statsWithoutPA, kpis, false);
    const bbLine = strengths.find(s => s.includes('BB rate'));
    expect(bbLine).toBeUndefined(); // no PA -> no rate claim at all, not a wrong one
    for (const line of strengths) {
      // Nothing in this list should ever contain an absurd percentage like
      // "9800.0%" — regex catches any 3+-digit-before-decimal percentage.
      expect(line).not.toMatch(/\b\d{3,}\.\d%/);
    }
  });

  it('getStrengths reports the real BB rate once plateAppearances is present', () => {
    const withPA = { ...statsWithoutPA, plateAppearances: 420 };
    const kpis = computeKPIs(withPA, false);
    const strengths = getStrengths(withPA, kpis, false);
    const bbLine = strengths.find(s => s.includes('BB rate'));
    expect(bbLine).toBeDefined();
    expect(bbLine).toContain('23.3%'); // 98/420 = 23.33...%
  });

  it('getRisks never emits a nonsensical K-rate percentage when PA is missing', () => {
    const risks = getRisks(statsWithoutPA, { currentAge: 28 }, false);
    const kLine = risks.find(s => s.includes('K rate'));
    expect(kLine).toBeUndefined();
    for (const line of risks) {
      expect(line).not.toMatch(/\b\d{3,}\.\d%/);
    }
  });

  it('getRisks reports the real K rate once plateAppearances is present', () => {
    const withPA = { ...statsWithoutPA, plateAppearances: 420 };
    const risks = getRisks(withPA, { currentAge: 28 }, false);
    const kLine = risks.find(s => s.includes('K rate'));
    expect(kLine).toBeDefined();
    expect(kLine).toContain('35.2%'); // 148/420 = 35.23...%
  });
});
