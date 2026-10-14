/*
Our goal is to make sure the three places that work out a team's blended WAR (the server's blend, the browser's blend, and the
"crowd view" that averages every website) always give the same answer, never produce a broken number (NaN) or one outside the
range of what the websites said, and that the dollars-per-WAR headline always sits inside its range. A few hand-picked examples
can miss the odd corners (negative values, zeros, blank cells, text like "n/a"), so we throw thousands of random inputs at the code.

To solve this we are going to:
  1. Make a random number generator that starts from a fixed seed, so any failure can be reproduced exactly
  2. Build thousands of random sets of WAR values from 1 to 4 websites, some negative, some zero, some blank or "n/a"
  3. Run each set through every version of our code and check the rules (they agree, every number is real, everything is in range)
  4. Cross-check that the agreement grade only ever gets worse as the websites disagree more, and that one website is never graded

WAR values are written in tenths of a win (like 38.5), which is how the websites publish them.
*/
import { describe, expect, it } from 'vitest';
import { buildWarConsensus, summarizeWarValues, classifyAgreement } from '../server/war-consensus.js';
import * as clientConsensus from '../client/src/lib/warConsensus.js';
import { calculateBlendedWar, calculateEfficiencyRange, calculateSalaryWarEfficiency } from '../server/api/team-efficiency.js';
import { blendTeamWarRow, teamWarConsensus } from '../client/src/api/mlb.js';

// Section A: Our random number generator

function makeRng(seed) {
  /*
  Our "makeRng" is a function that makes a random number generator we can repeat. When we give it:
                  a seed (any whole number)
  it returns to us:
                  a function that gives a new number between 0 and 1 each time we call it, always the same
                  numbers in the same order for the same seed, so a failing case can be run again
  */
  let state = seed >>> 0;                                                      // Keep the seed as a positive whole number
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;                    // A simple, well-known formula for the next state
    return state / 2 ** 32;                                                    // Turn it into a number between 0 and 1
  };
}

function randomWar(rng) {
  return Math.round(rng() * 1200 - 200) / 10;                                  // A WAR between -20.0 and 100.0 in tenths, so negatives and zero show up
}

function maybeMissing(rng, value) {
  /*
  Our "maybeMissing" is a function that sometimes ruins a value the way a real website might. When we give it:
                  a random generator and a good value
  it returns to us:
                  15% of the time null, 5% of the time an empty string, 5% of the time "n/a", otherwise the good value
  */
  const roll = rng();
  if (roll < 0.15) return null;
  if (roll < 0.20) return '';
  if (roll < 0.25) return 'n/a';
  return value;
}

// -0 and 0 are the same number once they are saved as JSON (JSON.stringify(-0) is '0') and they print the same,
// so we compare them as plain numbers. Adding 0 turns -0 into 0.
const norm = value => (value == null ? value : value + 0);


// Section B: Our checks

describe('consensus invariants (fuzz, seeded)', () => {
  it('server and client modules agree and never emit NaN or out-of-range values', () => {
    const rng = makeRng(20261011);
    for (let i = 0; i < 4000; i += 1) {
      const websiteCount = 1 + Math.floor(rng() * 4);                          // Between 1 and 4 websites
      const rows = [];
      for (let k = 0; k < websiteCount; k += 1) {
        rows.push({
          provider: `P${k}`,
          total: maybeMissing(rng, randomWar(rng)),
          batting: maybeMissing(rng, randomWar(rng)),
          pitching: maybeMissing(rng, randomWar(rng)),
          defensive: maybeMissing(rng, randomWar(rng)),
        });
      }

      const serverResult = buildWarConsensus(rows);
      const clientResult = clientConsensus.buildWarConsensus(rows);
      expect(clientResult).toEqual(serverResult);                              // The browser copy must match the server copy exactly

      for (const key of ['total', 'batting', 'pitching', 'defensive']) {
        const summary = serverResult[key];
        if (!summary) {
          continue;                                                            // Nobody gave this number, so there is nothing to check
        }
        for (const number of [summary.value, summary.median, summary.min, summary.max, summary.spread]) {
          expect(Number.isFinite(number)).toBe(true);                          // Every number is real, never NaN or infinity
        }
        expect(summary.value).toBeGreaterThanOrEqual(summary.min - 1e-9);      // The average sits between the lowest and highest
        expect(summary.value).toBeLessThanOrEqual(summary.max + 1e-9);
        expect(summary.median).toBeGreaterThanOrEqual(summary.min - 1e-9);
        expect(summary.median).toBeLessThanOrEqual(summary.max + 1e-9);
        expect(summary.spread).toBeGreaterThanOrEqual(0);                      // The gap between websites can never be negative
        expect(summary.n).toBe(summary.sources.length);                        // We count exactly the websites we list
      }

      expect(serverResult.providerCount).toBe(serverResult.total ? serverResult.total.n : 0);
      expect(['unavailable', 'single-source', 'high', 'moderate', 'low']).toContain(serverResult.agreement);
    }
  });

  it('the server blend, the client blend and the consensus mean always report the same total', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 4000; i += 1) {
      const fanGraphs = maybeMissing(rng, randomWar(rng));
      const baseballReference = maybeMissing(rng, randomWar(rng));

      const server = calculateBlendedWar({ fanGraphsWar: fanGraphs, baseballReferenceWar: baseballReference });
      const client = blendTeamWarRow({ totalWAR: fanGraphs }, { totalWAR: baseballReference });
      const consensus = buildWarConsensus([
        { provider: 'FanGraphs', total: fanGraphs },
        { provider: 'Baseball-Reference', total: baseballReference },
      ]);
      const expected = consensus.total ? consensus.total.value : null;         // The "crowd view" average is our answer key

      expect(norm(server.blendedWAR ?? null)).toBe(norm(expected));
      expect(norm(client.totalWAR ?? null)).toBe(norm(expected));
      expect(norm(teamWarConsensus({ totalWAR: fanGraphs }, { totalWAR: baseballReference }).total?.value ?? null)).toBe(norm(expected));
    }
  });

  it('the efficiency headline always sits inside the cross-source range', () => {
    const rng = makeRng(99);
    let checked = 0;                                                           // How many cases had a range to check
    for (let i = 0; i < 4000; i += 1) {
      const fanGraphs = randomWar(rng);
      const baseballReference = randomWar(rng);
      const payrollUsd = Math.round((50 + rng() * 350) * 1e6);                 // A payroll between 50 and 400 million dollars

      const total = buildWarConsensus([
        { provider: 'F', total: fanGraphs },
        { provider: 'B', total: baseballReference },
      ]).total;
      const range = calculateEfficiencyRange({ payrollUsd, totalSummary: total });
      const headline = calculateSalaryWarEfficiency({ payrollUsd, totalWar: total.value });
      if (!range) {
        continue;                                                              // No range when a website says zero or less, nothing to check
      }
      checked += 1;

      expect(headline.warPer100m).toBeGreaterThanOrEqual(range.warPer100mLow);
      expect(headline.warPer100m).toBeLessThanOrEqual(range.warPer100mHigh);
      expect(headline.dollarsPerWar).toBeGreaterThanOrEqual(range.dollarsPerWarLow);
      expect(headline.dollarsPerWar).toBeLessThanOrEqual(range.dollarsPerWarHigh);
    }
    expect(checked).toBeGreaterThan(500);                                      // Sanity check, enough cases really had a range
  });

  it('agreement grade is monotone in spread and a single source is never graded', () => {
    const grade = spread => classifyAgreement({ n: 2, spread });               // The grade two websites get for a given gap
    const order = ['high', 'moderate', 'low'];                                 // From best agreement to worst
    let lastPosition = 0;
    for (let spread = 0; spread <= 20; spread += 0.1) {
      const position = order.indexOf(grade(Number(spread.toFixed(1))));
      expect(position).toBeGreaterThanOrEqual(lastPosition);                   // A bigger gap can never earn a better grade
      lastPosition = position;
    }
    expect(classifyAgreement(summarizeWarValues([{ provider: 'F', value: 40 }]))).toBe('single-source');   // One website has nothing to agree with
  });
});
