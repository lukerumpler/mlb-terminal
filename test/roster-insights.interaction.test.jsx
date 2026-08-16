import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../client/src/App.jsx";

beforeEach(() => cleanup());

describe("Roster Insights rendered filters", () => {
  it("updates position and stat sorting controls in the Overview panel", async () => {
    const user = userEvent.setup();
    localStorage.removeItem("skip-roster-sample-defaults");
    render(<App />);
    await screen.findByText("AI Scout Insights");

    const allPositionsButton = await screen.findByRole("button", {
      name: "Show all roster positions",
    });
    const statSelect = await screen.findByRole("combobox", {
      name: "Sort roster insights by player statistic",
    });
    const minimumPaSelect = await screen.findByRole("combobox", {
      name: "Minimum plate appearances",
    });
    const qualifiedPreset = await screen.findByRole("button", {
      name: "Qualified hitters",
    });
    await user.click(qualifiedPreset);
    expect(qualifiedPreset).toHaveAttribute("aria-pressed", "true");
    expect(statSelect).toHaveValue("ops");
    expect(minimumPaSelect).toHaveValue("150");
    await user.click(allPositionsButton);
    await user.selectOptions(statSelect, "ops");
    await user.selectOptions(minimumPaSelect, "150");

    expect(allPositionsButton).toBeInTheDocument();
    expect(statSelect).toHaveValue("ops");
    expect(minimumPaSelect).toHaveValue("150");
    await waitFor(() => {
      expect(document.body.textContent).toContain("Team Leaders");
    });
  });
});
