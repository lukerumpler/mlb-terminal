import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge, {
  normalizeStatus,
} from "../client/src/components/StatusBadge.jsx";

describe("StatusBadge", () => {
  it("normalizes existing source-state names into semantic status names", () => {
    expect(normalizeStatus("ready")).toBe("verified");
    expect(normalizeStatus("source-gap")).toBe("coverage-gap");
    expect(normalizeStatus("upstream-unavailable")).toBe("unavailable");
    expect(normalizeStatus("derived")).toBe("estimated");
    expect(normalizeStatus("calculated")).toBe("calculated");
  });

  it.each([
    ["verified", "Verified"],
    ["estimated", "Estimated"],
    ["calculated", "Calculated"],
    ["tier-1", "Tier 1 · Official"],
    ["tier-2", "Tier 2 · Backup"],
    ["tier-3", "Tier 3 · Secondary"],
    ["cached-fallback", "Stale Fallback"],
    ["unavailable", "Unavailable"],
    ["coverage-gap", "Coverage Gap"],
    ["loading", "Loading"],
  ])("renders the %s status as visible text", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(
      screen.getByRole("status", { name: `Data status: ${label}` })
    ).toHaveTextContent(label);
  });
});
