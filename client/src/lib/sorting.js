// compareValues — a correct ascending/descending comparator for
// Array.prototype.sort.
//
// Added 2026-08-11 to fix a real bug: ProspectsPage.jsx's sortedBatters/
// sortedPitchers and api/feed.js's fetchFeeds() each hand-rolled a
// comparator shaped like `av > bv ? 1 : -1` (or the `< ? -1 : 1` mirror) —
// with no equality branch, so it NEVER returns 0. That's a real violation
// of the contract Array.prototype.sort requires (compare(x, x) must be 0),
// and it's demonstrably not just theoretical: it breaks sort *stability* —
// tied elements get reordered relative to each other on every re-sort
// instead of keeping their original relative order, which is the one thing
// JS's sort is contractually guaranteed to give you for free. Prospect FV
// grades cluster heavily (many 45s/50s/55s) and multiple feed items can
// legitimately share an isoDate, so ties are the common case at both call
// sites this replaces, not an edge case worth ignoring.
//
// Every OTHER comparator already in this codebase (OtherPages.jsx's
// leaderboard/trade sorts, etc.) already gets this right via plain
// subtraction or .localeCompare, both of which naturally return 0 for
// equal inputs — this just gives the two call sites that didn't a shared,
// correct implementation instead of two independent copies of the same
// bug.
//
// `av`/`bv` may be numbers or strings (mirrors the `>`/`<` comparisons
// already in use at both call sites — works correctly for either, same as
// native `>`/`<` do).
export function compareValues(av, bv, ascending = true) {
  const cmp = av > bv ? 1 : av < bv ? -1 : 0;
  // `-cmp` when cmp is 0 produces -0 in JS — harmless for Array.sort itself
  // (which only cares about sign), but a needless surprise for anything
  // that does a strict equality check on the result (as this file's own
  // test does). `|| 0` normalizes -0 back to 0 without changing behavior
  // for any non-zero cmp.
  return (ascending ? cmp : -cmp) || 0;
}
