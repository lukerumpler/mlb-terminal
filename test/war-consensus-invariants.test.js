import { describe, expect, it } from 'vitest';
import { buildWarConsensus, summarizeWarValues, classifyAgreement } from '../server/war-consensus.js';
import * as clientConsensus from '../client/src/lib/warConsensus.js';
import { calculateBlendedWar, calculateEfficiencyRange, calculateSalaryWarEfficiency } from '../server/api/team-efficiency.js';
import { blendTeamWarRow, teamWarConsensus } from '../client/src/api/mlb.js';

// Seeded so a failure is reproducible. Values are tenths of a win, the precision
// providers publish, drawn from a range that includes negatives and real zeros.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const tenth = r => Math.round((r() * 160 - 40)) / 10; // -4.0 .. 12.0 ... scaled below
const war = r => Math.round(r() * 1200 - 200) / 10;     // -20.0 .. 100.0
// -0 and 0 are the same number once serialized (JSON.stringify(-0) === '0') and format
// identically, so compare numerically: `v + 0` folds -0 into 0.
const norm = v => (v == null ? v : v + 0);
const maybe = (r, v) => { const x = r(); return x < 0.15 ? null : x < 0.2 ? '' : x < 0.25 ? 'n/a' : v; };

describe('consensus invariants (fuzz, seeded)', () => {
  it('server and client modules agree and never emit NaN or out-of-range values', () => {
    const r = rng(20261011);
    for (let i = 0; i < 4000; i += 1) {
      const rows = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, k) => ({
        provider: `P${k}`, total: maybe(r, war(r)), batting: maybe(r, war(r)), pitching: maybe(r, war(r)), defensive: maybe(r, war(r)),
      }));
      const a = buildWarConsensus(rows);
      const b = clientConsensus.buildWarConsensus(rows);
      expect(b).toEqual(a);
      for (const key of ['total', 'batting', 'pitching', 'defensive']) {
        const s = a[key];
        if (!s) continue;
        for (const v of [s.value, s.median, s.min, s.max, s.spread]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(s.value).toBeGreaterThanOrEqual(s.min - 1e-9);
        expect(s.value).toBeLessThanOrEqual(s.max + 1e-9);
        expect(s.median).toBeGreaterThanOrEqual(s.min - 1e-9);
        expect(s.median).toBeLessThanOrEqual(s.max + 1e-9);
        expect(s.spread).toBeGreaterThanOrEqual(0);
        expect(s.n).toBe(s.sources.length);
      }
      expect(a.providerCount).toBe(a.total ? a.total.n : 0);
      expect(['unavailable', 'single-source', 'high', 'moderate', 'low']).toContain(a.agreement);
    }
  });

  it('the server blend, the client blend and the consensus mean always report the same total', () => {
    const r = rng(7);
    for (let i = 0; i < 4000; i += 1) {
      const f = maybe(r, war(r));
      const b = maybe(r, war(r));
      const server = calculateBlendedWar({ fanGraphsWar: f, baseballReferenceWar: b });
      const client = blendTeamWarRow({ totalWAR: f }, { totalWAR: b });
      const consensus = buildWarConsensus([{ provider: 'FanGraphs', total: f }, { provider: 'Baseball-Reference', total: b }]);
      const expected = consensus.total ? consensus.total.value : null;
      expect(norm(server.blendedWAR ?? null)).toBe(norm(expected));
      expect(norm(client.totalWAR ?? null)).toBe(norm(expected));
      expect(norm(teamWarConsensus({ totalWAR: f }, { totalWAR: b }).total?.value ?? null)).toBe(norm(expected));
    }
  });

  it('the efficiency headline always sits inside the cross-source range', () => {
    const r = rng(99);
    let checked = 0;
    for (let i = 0; i < 4000; i += 1) {
      const f = war(r);
      const b = war(r);
      const payrollUsd = Math.round((50 + r() * 350) * 1e6);
      const total = buildWarConsensus([{ provider: 'F', total: f }, { provider: 'B', total: b }]).total;
      const range = calculateEfficiencyRange({ payrollUsd, totalSummary: total });
      const head = calculateSalaryWarEfficiency({ payrollUsd, totalWar: total.value });
      if (!range) continue;
      checked += 1;
      expect(head.warPer100m).toBeGreaterThanOrEqual(range.warPer100mLow);
      expect(head.warPer100m).toBeLessThanOrEqual(range.warPer100mHigh);
      expect(head.dollarsPerWar).toBeGreaterThanOrEqual(range.dollarsPerWarLow);
      expect(head.dollarsPerWar).toBeLessThanOrEqual(range.dollarsPerWarHigh);
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('agreement grade is monotone in spread and a single source is never graded', () => {
    const grade = spread => classifyAgreement({ n: 2, spread });
    const order = ['high', 'moderate', 'low'];
    let last = 0;
    for (let s = 0; s <= 20; s += 0.1) {
      const idx = order.indexOf(grade(Number(s.toFixed(1))));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    expect(classifyAgreement(summarizeWarValues([{ provider: 'F', value: 40 }]))).toBe('single-source');
  });
});
