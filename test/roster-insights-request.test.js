import { describe, expect, it } from "vitest";
import { shouldStartRosterInsightsRequest } from "../client/src/lib/rosterInsightsRequest.js";

const base = {
  hasLiveData: true,
  hasInsights: false,
  hitterCount: 9,
  pitcherCount: 8,
};

describe("roster insights request guard", () => {
  it("starts once when live roster data is available", () => {
    expect(shouldStartRosterInsightsRequest({
      ...base,
      inFlightKey: null,
      requestKey: "LAD:0",
    })).toBe(true);
  });

  it("does not duplicate an in-flight request while roster data settles", () => {
    expect(shouldStartRosterInsightsRequest({
      ...base,
      inFlightKey: "LAD:0",
      requestKey: "LAD:0",
    })).toBe(false);
  });

  it("allows a new team or explicit retry key", () => {
    expect(shouldStartRosterInsightsRequest({
      ...base,
      inFlightKey: "LAD:0",
      requestKey: "SEA:0",
    })).toBe(true);
    expect(shouldStartRosterInsightsRequest({
      ...base,
      inFlightKey: "LAD:0",
      requestKey: "LAD:1",
    })).toBe(true);
  });

  it("waits for live data and at least one roster group", () => {
    expect(shouldStartRosterInsightsRequest({
      ...base,
      hasLiveData: false,
      inFlightKey: null,
      requestKey: "LAD:0",
    })).toBe(false);
    expect(shouldStartRosterInsightsRequest({
      ...base,
      hitterCount: 0,
      pitcherCount: 0,
      inFlightKey: null,
      requestKey: "LAD:0",
    })).toBe(false);
  });
});
