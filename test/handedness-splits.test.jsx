import { describe, expect, it } from 'vitest';
import { normalizeHandednessSplits } from '../client/src/api/mlb.js';

describe('normalizeHandednessSplits', () => {
  it('keeps explicit left and right pitcher split rows', () => {
    const rows = normalizeHandednessSplits([
      { split: { code: 'vl' }, stat: { avg: '.285' } },
      { split: { code: 'vr' }, stat: { avg: '.310' } },
    ]);

    expect(rows).toEqual([
      { side: 'LHP', stat: { avg: '.285' } },
      { side: 'RHP', stat: { avg: '.310' } },
    ]);
  });

  it('discards aggregate and unknown split rows', () => {
    const rows = normalizeHandednessSplits([
      { split: { code: 'vl' }, stat: { avg: '.285' } },
      { split: { code: 'all' }, stat: { avg: '.300' } },
      { split: { description: 'Platoon' }, stat: { avg: '.301' } },
      { split: { code: 'vr' } },
    ]);

    expect(rows).toEqual([{ side: 'LHP', stat: { avg: '.285' } }]);
  });
});
