import React from "react";
import { describe, expect, it } from "vitest";
import { getPlayerDataConfidence } from "../client/src/lib/playerDataConfidence.js";
import { PlayerDataConfidenceBadge, PlayerIdentityConfidenceBadge, getPlayerIdentityConfidence } from "../client/src/pages/PlayersPage.jsx";
import { PlayerProfileHydrationSkeleton } from "../client/src/components/PageSkeletons.jsx";

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

  it("labels only an exact canonical external identity match as verified", () => {
    const confidence = getPlayerIdentityConfidence({
      status: "verified",
      baseballReference: { id: "ohtansh01", confidence: "exact-name" },
    });
    expect(confidence).toMatchObject({ tone: "teal", label: "IDENTITY VERIFIED" });
    const element = PlayerIdentityConfidenceBadge({ identity: { status: "verified", baseballReference: { id: "ohtansh01", confidence: "exact-name" } }, compact: true });
    expect(element.props["data-testid"]).toBe("player-identity-confidence");
    expect(element.props["aria-label"]).toContain("IDENTITY VERIFIED");
    expect(element.props.title).toContain("exact normalized name");
  });

  it("keeps in-progress and missing external identity states explicit", () => {
    expect(getPlayerIdentityConfidence(null, { pending: true })).toMatchObject({ tone: "amber", label: "IDENTITY CHECKING" });
    expect(getPlayerIdentityConfidence({ status: "not-found" })).toMatchObject({ tone: "slate", label: "IDENTITY UNAVAILABLE" });
  });

  it("provides an in-place supplemental hydration skeleton without hiding the core profile", () => {
    const element = PlayerProfileHydrationSkeleton();
    expect(element.props.role).toBe("status");
    expect(element.props["aria-label"]).toBe("Loading supplemental player profile data");
    expect(element.props.className).toBe("skip-profile-hydration-skeleton");
  });
});
