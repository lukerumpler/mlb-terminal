import { describe, expect, it } from 'vitest';
import { blendTeamWarRow } from '../client/src/api/mlb.js';

describe('dashboard blended WAR mapping', () => {
  it('averages matched provider totals and comparable defensive WAR', () => {
    expect(blendTeamWarRow(
      { totalWAR: 40, defensiveWAR: 4 },
      { totalWAR: 36, defensiveWAR: 2 },
    )).toEqual({
      totalWAR: 38,
      fWAR: 40,
      bWAR: 36,
      defensiveWAR: 3,
      methodology: 'Blended fWAR/bWAR average',
      defensiveMethodology: 'Average of comparable defensive WAR',
    });
  });

  it('keeps a single-provider fallback explicitly labeled', () => {
    expect(blendTeamWarRow({ totalWAR: 40 }, null)).toMatchObject({
      totalWAR: 40,
      fWAR: 40,
      bWAR: null,
      methodology: 'fWAR',
      defensiveWAR: null,
    });
  });

  it('never returns NaN: unparseable provider values are unavailable (null)', () => {
    const none = blendTeamWarRow({ totalWAR: '\u2014' }, { totalWAR: 'n/a' });
    expect(none).toMatchObject({ totalWAR: null, fWAR: null, bWAR: null, methodology: 'Unavailable' });
    expect(Number.isNaN(none.totalWAR)).toBe(false);
  });

  it('falls back to the one usable provider when the other is unparseable', () => {
    expect(blendTeamWarRow({ totalWAR: 'n/a' }, { totalWAR: 10 })).toMatchObject({ totalWAR: 10, fWAR: null, bWAR: 10, methodology: 'bWAR/rWAR' });
  });

  it('keeps negative totals signed and a real zero as zero', () => {
    expect(blendTeamWarRow({ totalWAR: -2 }, { totalWAR: -1 }).totalWAR).toBe(-1.5);
    expect(blendTeamWarRow({ totalWAR: 0 }, null)).toMatchObject({ totalWAR: 0, fWAR: 0 });
  });
});
