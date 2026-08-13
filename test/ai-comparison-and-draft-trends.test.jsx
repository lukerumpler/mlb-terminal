import { describe, expect, it } from 'vitest';
import comparisonSummary, { hasValidComparisonPayload, fallbackSummary } from '../server/api/comparison-summary.js';
import { normalizeDraftTrend } from '../client/src/pages/OtherPages.jsx';

describe('AI comparison summary contract', () => {
  const player = name => ({
    name,
    playerType: 'hitter',
    axes: [
      { axis: 'Power', pct: 90, rawLabel: '35 HR' },
      { axis: 'Contact', pct: 70, rawLabel: '.290 AVG' },
    ],
  });

  it('accepts two same-type players with percentile axes', () => {
    expect(hasValidComparisonPayload({ players: [player('A'), player('B')] })).toBe(true);
  });

  it('validates the fallback summary helper directly', () => {
    const summary = fallbackSummary([player('Slugger'), player('Contact')]);
    expect(summary).toBeTruthy();
    expect(summary.recommendation).toBeTruthy();
    expect(typeof summary.recommendation).toBe('string');
  });

  it('rejects incomplete, mismatched, or empty comparison payloads', () => {
    expect(hasValidComparisonPayload({ players: [player('A')] })).toBe(false);
    expect(hasValidComparisonPayload({ players: [player('A'), { ...player('B'), playerType: 'pitcher' }] })).toBe(false);
    expect(hasValidComparisonPayload({ players: [player('A'), { name: 'B', playerType: 'hitter', axes: [] }] })).toBe(false);
  });
});

describe('Draft historical trend normalization', () => {
  it('keeps the three requested seasons, orders them, and removes duplicate seasons', () => {
    expect(normalizeDraftTrend([
      { season: 2026, stat: { ops: 0.91 } },
      { season: 2024, stat: { ops: 0.72 } },
      { season: 2025, stat: { ops: 0.81 } },
      { season: 2023, stat: { ops: 0.65 } },
      { season: 2025, stat: { ops: 0.82 } },
    ], false)).toEqual([
      { season: 2024, value: 0.72 },
      { season: 2025, value: 0.81 },
      { season: 2026, value: 0.91 },
    ]);
  });

  it('uses ERA for pitchers and leaves incomplete history unavailable to the UI', () => {
    expect(normalizeDraftTrend([
      { season: 2024, stat: { era: '3.40' } },
      { season: 2025, stat: { era: '2.90' } },
    ], true)).toEqual([
      { season: 2024, value: 3.4 },
      { season: 2025, value: 2.9 },
    ]);
  });
});
