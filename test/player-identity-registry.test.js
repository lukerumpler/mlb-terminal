import { describe, expect, it } from "vitest";
import {
  getStoredPlayerProviderIdentity,
  isUsablePlayerProviderIdentity,
  storePlayerProviderIdentity,
} from "../client/src/lib/playerIdentityRegistry.js";

function makeStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function identity() {
  return {
    mlb: { id: "660271" },
    baseballReference: {
      id: "ohtansh01",
      canonicalUrl: "https://www.baseball-reference.com/players/o/ohtansh01.shtml",
      confidence: "exact-name",
      matchedName: "Shohei Ohtani",
    },
  };
}

describe("player identity registry", () => {
  it("persists only an exact player-name and canonical-ID match", () => {
    const storage = makeStorage();
    expect(isUsablePlayerProviderIdentity(identity(), { mlbId: "660271", fullName: "Shohei Ohtani" })).toBe(true);
    expect(storePlayerProviderIdentity({ mlbId: "660271", fullName: "Shohei Ohtani", identity: identity(), storage, now: 100 })).toBe(true);
    expect(getStoredPlayerProviderIdentity({ mlbId: "660271", fullName: "Shohei Ohtani", storage, now: 101 })).toEqual(identity());
  });

  it("does not reuse a cached provider identity for a different player name", () => {
    const storage = makeStorage();
    storePlayerProviderIdentity({ mlbId: "660271", fullName: "Shohei Ohtani", identity: identity(), storage, now: 100 });
    expect(getStoredPlayerProviderIdentity({ mlbId: "660271", fullName: "Shohei Otani", storage, now: 101 })).toBeNull();
  });
});
