import { describe, expect, it } from "vitest";
import { buildRosterSavantKey } from "../client/src/lib/rosterSavantKey.js";

describe("roster Savant effect identity", () => {
  it("stays stable when polling replaces player objects but not roster identity", () => {
    const first = {
      hitting: [
        { id: 2, stat: { plateAppearances: 120 } },
        { id: 1, stat: { plateAppearances: 180 } },
      ],
      pitching: [{ id: 3, stat: { inningsPitched: 90 } }],
    };
    const refreshed = {
      hitting: [
        { id: 1, stat: { plateAppearances: 180, ops: ".812" } },
        { id: 2, stat: { plateAppearances: 120, ops: ".701" } },
      ],
      pitching: [{ id: 3, stat: { inningsPitched: 90, era: "3.40" } }],
    };

    expect(buildRosterSavantKey(first)).toBe(buildRosterSavantKey(refreshed));
  });

  it("changes when a top roster identity changes", () => {
    const before = { hitting: [{ id: 1, stat: { plateAppearances: 180 } }] };
    const after = { hitting: [{ id: 9, stat: { plateAppearances: 180 } }] };

    expect(buildRosterSavantKey(before)).not.toBe(buildRosterSavantKey(after));
  });
});
