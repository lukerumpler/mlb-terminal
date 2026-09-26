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
});
