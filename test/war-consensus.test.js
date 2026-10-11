import { describe, expect, it } from 'vitest';
import * as server from '../server/war-consensus.js';
import * as client from '../client/src/lib/warConsensus.js';

const { buildWarConsensus, summarizeWarValues, classifyAgreement, describeAgreement, AGREEMENT_THRESHOLDS } = server;

describe('summarizeWarValues', () => {
  it('returns null when nothing is usable', () => {
    expect(summarizeWarValues([])).toBeNull();
    expect(summarizeWarValues([{ provider: 'A', value: null }, { provider: 'B', value: '' }, { provider: 'C', value: 'x' }])).toBeNull();
  });

  it('does not treat null or blank as 0', () => {
    const s = summarizeWarValues([{ provider: 'A', value: 40 }, { provider: 'B', value: null }, { provider: 'C', value: '   ' }]);
    expect(s).toMatchObject({ value: 40, n: 1, providers: ['A'] });
  });

  it('averages two sources and reports the spread', () => {
    expect(summarizeWarValues([{ provider: 'fWAR', value: 40 }, { provider: 'bWAR', value: 36 }])).toMatchObject({
      value: 38, median: 38, min: 36, max: 40, spread: 4, n: 2,
    });
  });

  it('works with three or more sources and reports a median', () => {
    const s = summarizeWarValues([
      { provider: 'A', value: 30 }, { provider: 'B', value: 31 }, { provider: 'C', value: 38 },
    ]);
    expect(s.value).toBe(33);
    expect(s.median).toBe(31);
    expect(s.spread).toBe(8);
    expect(s.n).toBe(3);
  });

  it('keeps negative values and a true zero', () => {
    expect(summarizeWarValues([{ provider: 'A', value: -2.4 }, { provider: 'B', value: 0 }]).value).toBe(-1.2);
    expect(summarizeWarValues([{ provider: 'A', value: 0 }]).value).toBe(0);
    expect(Object.is(summarizeWarValues([{ provider: 'A', value: -0.04 }, { provider: 'B', value: 0 }]).value, -0)).toBe(false);
  });

  it('passes a lone source through unrounded', () => {
    expect(summarizeWarValues([{ provider: 'A', value: 40.123 }]).value).toBe(40.123);
  });
});

describe('agreement grade', () => {
  const grade = (a, b) => buildWarConsensus([{ provider: 'F', total: a }, { provider: 'B', total: b }]).agreement;
  it('is high within the high threshold, moderate within the next band, else low', () => {
    expect(grade(40, 38)).toBe('high');
    expect(grade(40, 40 - AGREEMENT_THRESHOLDS.highWithin)).toBe('high');
    expect(grade(40, 35)).toBe('moderate');
    expect(grade(40, 40 - AGREEMENT_THRESHOLDS.moderateWithin)).toBe('moderate');
    expect(grade(40, 30)).toBe('low');
  });

  it('flags single-source and unavailable explicitly', () => {
    expect(classifyAgreement(summarizeWarValues([{ provider: 'F', value: 40 }]))).toBe('single-source');
    expect(classifyAgreement(null)).toBe('unavailable');
  });

  it('accepts custom thresholds', () => {
    const c = buildWarConsensus([{ provider: 'F', total: 40 }, { provider: 'B', total: 38 }], { thresholds: { highWithin: 1, moderateWithin: 3 } });
    expect(c.agreement).toBe('moderate');
  });
});

describe('buildWarConsensus', () => {
  it('blends pitching across providers but never mixes batting with another provider unless both supply it', () => {
    const c = buildWarConsensus([
      { provider: 'FanGraphs', total: 40, batting: 25, pitching: 15, defensive: 4 },
      { provider: 'Baseball-Reference', total: 36, pitching: 13, defensive: 2 },
    ]);
    expect(c.total.value).toBe(38);
    expect(c.pitching).toMatchObject({ value: 14, n: 2 });
    expect(c.batting).toMatchObject({ value: 25, n: 1, providers: ['FanGraphs'] });
    expect(c.defensive).toMatchObject({ value: 3, n: 2 });
    expect(c.providerCount).toBe(2);
  });

  it('requires two providers before defensive counts as a blend', () => {
    const c = buildWarConsensus([{ provider: 'FanGraphs', total: 40, defensive: 4 }, { provider: 'Baseball-Reference', total: 36 }]);
    expect(c.defensive).toBeNull();
  });

  it('scales to more than two providers', () => {
    const c = buildWarConsensus([
      { provider: 'FanGraphs', total: 40 },
      { provider: 'Baseball-Reference', total: 36 },
      { provider: 'Baseball Prospectus', total: 38 },
    ]);
    expect(c.total).toMatchObject({ value: 38, median: 38, spread: 4, n: 3 });
    expect(c.providerCount).toBe(3);
  });

  it('is empty and safe with no usable input', () => {
    expect(buildWarConsensus([])).toMatchObject({ total: null, agreement: 'unavailable', providerCount: 0 });
    expect(buildWarConsensus(undefined)).toMatchObject({ total: null, agreement: 'unavailable' });
    expect(buildWarConsensus([null, undefined])).toMatchObject({ total: null });
  });

  it('describes each grade in plain language', () => {
    expect(describeAgreement(buildWarConsensus([{ provider: 'F', total: 40 }, { provider: 'B', total: 38 }]))).toBe('Sources agree (spread 2.0 WAR)');
    expect(describeAgreement(buildWarConsensus([{ provider: 'F', total: 40 }, { provider: 'B', total: 30 }]))).toMatch(/diverge.*approximate/);
    expect(describeAgreement(buildWarConsensus([{ provider: 'F', total: 40 }]))).toMatch(/Single source/);
    expect(describeAgreement(buildWarConsensus([]))).toBe('Unavailable');
  });
});

describe('server and client copies stay identical', () => {
  it('exports the same functions and gives the same answers', () => {
    expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort());
    const input = [
      { provider: 'FanGraphs', total: 40.4, batting: 25, pitching: 15.4, defensive: 4.1 },
      { provider: 'Baseball-Reference', total: 35.9, pitching: 12.8, defensive: 2.2 },
      { provider: 'Third', total: '38', batting: null, pitching: ' ', defensive: 3 },
    ];
    expect(client.buildWarConsensus(input)).toEqual(server.buildWarConsensus(input));
    expect(client.describeAgreement(client.buildWarConsensus(input))).toBe(server.describeAgreement(server.buildWarConsensus(input)));
  });
});
