import { describe, it, expect } from 'vitest';
import { compareValues } from '../client/src/lib/sorting.js';

// Regression coverage for the 2026-08-11 fix — see src/lib/sorting.js's
// header comment for the full story. The bug: ProspectsPage.jsx and
// api/feed.js each had a hand-rolled comparator shaped like
// `av > bv ? 1 : -1`, which never returns 0 for ties. These tests exist
// specifically to catch that regression coming back, not to re-test that
// basic ascending/descending ordering works (that part was never broken).
describe('compareValues', () => {
  it('returns exactly 0 for equal values — the specific thing the old comparator got wrong', () => {
    expect(compareValues(50, 50, true)).toBe(0);
    expect(compareValues(50, 50, false)).toBe(0);
    expect(compareValues('AAA', 'AAA', true)).toBe(0);
  });

  it('orders ascending correctly for unequal numeric values', () => {
    expect(compareValues(45, 50, true)).toBeLessThan(0);
    expect(compareValues(50, 45, true)).toBeGreaterThan(0);
  });

  it('orders descending correctly for unequal numeric values', () => {
    expect(compareValues(45, 50, false)).toBeGreaterThan(0);
    expect(compareValues(50, 45, false)).toBeLessThan(0);
  });

  it('works for strings the same way it works for numbers', () => {
    expect(compareValues('A', 'B', true)).toBeLessThan(0);
    expect(compareValues('B', 'A', true)).toBeGreaterThan(0);
  });

  it('keeps sort stable for tied values — the actual user-visible symptom of the bug', () => {
    // Same shape as ProspectsPage.jsx's prospect list: several entries
    // share a sort key (FV grade), and a correct sort must preserve their
    // original relative order rather than shuffling them on every re-sort.
    const rows = [
      { name: 'A', fv: 50 }, { name: 'B', fv: 45 }, { name: 'C', fv: 50 },
      { name: 'D', fv: 55 }, { name: 'E', fv: 50 },
    ];
    const sorted = [...rows].sort((a, b) => compareValues(a.fv, b.fv, true));
    expect(sorted.map(r => r.name)).toEqual(['B', 'A', 'C', 'E', 'D']);

    // Re-sorting the already-sorted (stable) output must be a no-op — a
    // tie-less comparator would instead flip A/C/E's relative order here.
    const resorted = [...sorted].sort((a, b) => compareValues(a.fv, b.fv, true));
    expect(resorted.map(r => r.name)).toEqual(['B', 'A', 'C', 'E', 'D']);
  });
});
