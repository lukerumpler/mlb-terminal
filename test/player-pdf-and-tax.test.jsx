import { describe, expect, it } from 'vitest';
import { buildMultiYearTaxProjection, calculateCbtTax, getRepeaterTier, getSurchargeBand } from '../shared/luxuryTax.js';
import { buildExecutiveScoutingSummaryModel, buildPlayerValuationCardModel } from '../client/src/lib/pdfExports.js';

describe('luxury-tax repeater model', () => {
  it('maps consecutive-year history to MLB repeater tiers', () => {
    expect(getRepeaterTier(1)).toMatchObject({ label: 'First-year CBT payer', baseRate: 0.2 });
    expect(getRepeaterTier(2)).toMatchObject({ label: 'Second consecutive year', baseRate: 0.3 });
    expect(getRepeaterTier(3)).toMatchObject({ label: 'Third consecutive year or more', baseRate: 0.5 });
    expect(getRepeaterTier(null).label).toBe('History unavailable');
  });

  it('maps official surcharge bands without silently assigning a repeater rate', () => {
    expect(getSurchargeBand(15_000_000).rate).toBe(0);
    expect(getSurchargeBand(25_000_000).rate).toBe(0.12);
    expect(getSurchargeBand(65_000_000).rate).toBe(0.6);
    // First $20M at 20% ($4M), next $5M at 32% ($1.6M) = $5,600,000 total tax.
    expect(calculateCbtTax(25_000_000, 1)).toBe(5_600_000);
    expect(calculateCbtTax(25_000_000, null)).toBeNull();
  });

  it('returns exposure rows but null tax bills when repeater history is unavailable', () => {
    const projection = buildMultiYearTaxProjection({
      baseAav: 30_000_000,
      currentPlayerAav: 30_000_000,
      currentTaxPayroll: 260_000_000,
      currentSeason: 2026,
      repeaterYears: null,
      years: 5,
    });
    expect(projection.status).toBe('available');
    expect(projection.rows).toHaveLength(5);
    expect(projection.rows[0]).toMatchObject({ season: 2026, threshold: 244_000_000, repeaterTier: 'History unavailable' });
    expect(projection.rows[0].overage).toBe(16_000_000);
    expect(projection.rows[0].estimatedTax).toBeNull();
  });
});

describe('player PDF export models', () => {
  const common = {
    playerName: 'Example Player',
    teamName: 'Example Club',
    position: 'OF',
    season: '2026',
    verdict: 'PRIORITY TARGET',
    score: 82,
    archetype: 'Power / OBP',
    kpis: { CAS: 88, DQS: 76, DPI: 91, TPVI: 84 },
    teamFinancials: { source: 'Spotrac', tax: { taxPayroll: 260_000_000, taxThreshold: 244_000_000, repeaterTier: 'History unavailable' } },
    projection: { rows: [{ season: 2026, estimatedTax: null, repeaterTier: 'History unavailable' }] },
  };

  it('builds a valuation-card model with exact percentile axes and financial context', () => {
    const model = buildPlayerValuationCardModel({
      ...common,
      axes: [{ label: 'Contact', value: 88 }, { label: 'Power', value: 91 }],
      headlineRows: [{ label: 'OPS', value: '.912' }],
      contractData: { contractAvailable: true, status: 'Under Contract', aav: 30_000_000, total: 120_000_000 },
    });
    expect(model.axes).toEqual([{ label: 'Contact', value: 88 }, { label: 'Power', value: 91 }]);
    expect(model.contract).toMatchObject({ status: 'Under Contract', aav: 30_000_000 });
    expect(model.sources).toContain('Spotrac');
  });

  it('builds an executive summary with strengths, risks, and a recommendation', () => {
    const model = buildExecutiveScoutingSummaryModel({
      ...common,
      strengths: ['Impact power'],
      risks: ['Tax history unavailable'],
      recommendation: 'Pursue only within the projected value band.',
    });
    expect(model.strengths).toEqual(['Impact power']);
    expect(model.risks).toEqual(['Tax history unavailable']);
    expect(model.recommendation).toContain('projected value band');
  });
});
