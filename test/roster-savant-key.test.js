import { describe, expect, it } from "vitest";
import { buildRosterSavantKey } from "../client/src/lib/rosterSavantKey.js";
import { selectTopSavantRosterPlayers } from "../client/src/lib/rosterSavantSelection.js";

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

  it("selects the highest-workload rows without mutating state-backed roster order", () => {
    const roster = {
      hitting: [
        { id: 2, stat: { plateAppearances: 120 } },
        { id: 1, stat: { plateAppearances: 180 } },
        { id: 3, stat: { pa: 150 } },
      ],
      pitching: [
        { id: 5, stat: { inningsPitched: 60 } },
        { id: 4, stat: { ip: 90 } },
      ],
    };

    const selected = selectTopSavantRosterPlayers(roster, 2);

    expect(selected.hitters.map(player => player.id)).toEqual([1, 3]);
    expect(selected.pitchers.map(player => player.id)).toEqual([4, 5]);
    expect(roster.hitting.map(player => player.id)).toEqual([2, 1, 3]);
    expect(roster.pitching.map(player => player.id)).toEqual([5, 4]);
  });
});
