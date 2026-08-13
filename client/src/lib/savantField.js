// Shared "try several plausible column names" helper for Savant CSV
// leaderboards that don't publish a fixed schema — see api/savant.js's
// per-endpoint comments for which ones this applies to, and why. Originally
// written once inside PitchShapePanel.jsx (Roadmap #1); pulled out here once
// ContactPointPanel.jsx (Roadmap #3) needed the exact same pattern, rather
// than letting a second copy drift from the first the way this project's
// own progress log has already flagged happening with unrelated duplicated
// logic (see fvMovers/fvDelta in ProspectsPage.jsx, Roadmap #6).
export function pickSavantField(row, ...keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  }
  return null;
}
