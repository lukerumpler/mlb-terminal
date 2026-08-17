import React from "react";
import { describe, expect, it } from "vitest";
import { getPlayerDataConfidence } from "../client/src/lib/playerDataConfidence.js";
import { getProviderIdConfidenceSourceCheck, PlayerDataConfidenceBadge } from "../client/src/pages/PlayersPage.jsx";

describe("player data confidence", () => {
  it("scores complete current-season source groups as high confidence", () => {
    const confidence = getPlayerDataConfidence({
      identity: 123,
      seasonStats: { season: 2026, gamesPlayed: 80 },
      savant: { percentile: { hardHit: 90 } },
      contract: { aav: 30_000_000 },
      teamFinancials: { tax: { taxPayroll: 300_000_000 } },
      dataMode: "live",
      freshnessAgeMs: 60_000,
    });
    expect(confidence.score).toBe(100);
    expect(confidence.label).toBe("High");
    expect(confidence.readyCount).toBe(5);
    expect(confidence.freshnessLabel).toBe("Updated 1m ago");
  });

  it("penalizes fallback and cached data only for the evidence we know about", () => {
    const confidence = getPlayerDataConfidence({
      identity: 123,
      seasonStats: { season: 2025, gamesPlayed: 80 },
      isFallback: true,
      dataMode: "cached",
    });
    expect(confidence.score).toBe(34);
    expect(confidence.label).toBe("Limited");
    expect(confidence.reasons.join(" ")).toContain("fallback season");
    expect(confidence.reasons.join(" ")).toContain(
      "Player-level freshness not provided"
    );
  });

  it("keeps unknown player freshness explicit instead of claiming the payload is current", () => {
    const confidence = getPlayerDataConfidence({
      identity: 123,
      seasonStats: { gamesPlayed: 1 },
    });
    expect(confidence.modeLabel).toBe("Response mode not provided");
    expect(confidence.freshnessLabel).toContain("not provided");
    expect(confidence.score).toBe(50);
  });

  it("renders an accessible badge with an explanatory breakdown", () => {
    const confidence = getPlayerDataConfidence({
      identity: 123,
      seasonStats: { gamesPlayed: 1 },
      savant: {},
    });
    const element = PlayerDataConfidenceBadge({ confidence, compact: true });
    expect(element.props.role).toBe("note");
    expect(element.props["data-testid"]).toBe("player-data-confidence");
    expect(element.props["aria-label"]).toContain("CONFIDENCE");
    expect(element.props.title).toContain("source-completeness indicator");
  });

  it("shows exact-name provider-ID confidence in the profile source strip", () => {
    const check = getProviderIdConfidenceSourceCheck({
      mlbId:'660271',
      providerIdentity:{
        mlb:{ id:'660271' },
        baseballReference:{
          id:'ohtansh01',
          canonicalUrl:'https://www.baseball-reference.com/players/o/ohtansh01.shtml',
          confidence:'exact-name',
          matchedName:'Shohei Ohtani',
          provenance:'Exact normalized-name verification',
        },
      },
    }, { id:660271, fullName:'Shohei Ohtani' });
    expect(check).toMatchObject({ label:'B-Ref ID', ready:true, source:'Exact name' });
    expect(check.detail).toContain('ohtansh01');
  });

  it("keeps provider-ID confidence unavailable for a near-name mapping", () => {
    const check = getProviderIdConfidenceSourceCheck({
      mlbId:'660271',
      providerIdentity:{
        mlb:{ id:'660271' },
        baseballReference:{
          id:'ohtansh01',
          canonicalUrl:'https://www.baseball-reference.com/players/o/ohtansh01.shtml',
          confidence:'exact-name',
          matchedName:'Shohei Ohtan',
        },
      },
    }, { id:660271, fullName:'Shohei Ohtani' });
    expect(check).toMatchObject({ label:'B-Ref ID', ready:false, source:'Unavailable' });
    expect(check.detail).toContain('Near-name matches are intentionally rejected');
  });
});
