import { describe, expect, it } from 'vitest';
import { getRepeaterTierExplanation } from '../shared/luxuryTax.js';
import { buildSideBySideValuationModel } from '../client/src/lib/pdfExports.js';
import { readLowDataMode, setLowDataMode } from '../client/src/lib/lowData.js';

describe('Low Data Mode', () => {
  it('persists a user preference while keeping the setting reversible', () => {
    setLowDataMode(false);
    expect(readLowDataMode()).toBe(false);
    setLowDataMode(true);
    expect(readLowDataMode()).toBe(true);
    setLowDataMode(false);
    expect(readLowDataMode()).toBe(false);
  });
});

describe('side-by-side valuation PDF model', () => {
  it('normalizes two player profiles and keeps percentile values bounded', () => {
    const model = buildSideBySideValuationModel({
      players: [
        { playerName:'Player A', axes:[{ label:'Power', value:99 }, { label:'Contact', value:82 }] },
        { playerName:'Player B', axes:[{ label:'Power', value:64 }, { label:'Contact', value:101 }] },
      ],
      summary: { headline:'Player A leads power', recommendation:'Choose Player A for impact power.', caveat:'Percentiles are source-backed.' },
    });
    expect(model.players).toHaveLength(2);
    expect(model.players[1].axes[1]).toEqual({ label:'Contact', value:100 });
    expect(model.summary.recommendation).toContain('Player A');
  });
});

describe('CBT repeater-tier tooltip explanations', () => {
  it('explains first, second, third-plus, and unavailable tiers', () => {
    expect(getRepeaterTierExplanation(1)).toMatchObject({ rate:'20% base rate' });
    expect(getRepeaterTierExplanation(2).detail).toContain('higher base rate');
    expect(getRepeaterTierExplanation(3).detail).toContain('highest base rate');
    expect(getRepeaterTierExplanation(null).detail).toContain('does not provide verified consecutive-year CBT history');
  });
});
