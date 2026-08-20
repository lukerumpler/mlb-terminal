import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../client/src/App.jsx";

const TABS = [
  "Overview",
  "Talent",
  "League",
  "Intelligence",
  "Scouting Notes",
  "Intel Feed",
  "Settings",
];

beforeEach(() => {
  cleanup();
  global.__consoleErrors.length = 0;
});

describe("SKIP app — mobile navigation", () => {
  it("opens the labeled mobile drawer, navigates, and closes the drawer", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    render(<App />);
    const openButton = document.querySelector(".skip-mobile-nav-toggle");
    expect(openButton).toBeTruthy();
    await user.click(openButton);
    expect(
      screen.getByRole("button", { name: "Close navigation" })
    ).toBeInTheDocument();
    expect(
      document.querySelector(".skip-sidebar.skip-mobile-nav-open")
    ).toBeTruthy();
    const talentButton = document.querySelector(
      '.skip-sidebar button[title="Talent"]'
    );
    expect(talentButton).toBeTruthy();
    await user.click(talentButton);
    await waitFor(() =>
      expect(
        document.querySelector(".skip-sidebar.skip-mobile-nav-open")
      ).toBeNull()
    );
    expect(document.querySelector(".skip-topbar")?.textContent).toContain(
      "Talent"
    );
    expect(screen.getByRole("tab", { name: "Players" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("supports touch-safe Escape dismissal and focus restoration for the mobile drawer", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    render(<App />);
    const openButton = document.querySelector(".skip-mobile-nav-toggle");
    const firstNavItem = document.querySelector(
      '.skip-sidebar button[title="Overview"]'
    );
    expect(openButton).toBeTruthy();
    expect(firstNavItem).toBeTruthy();
    await user.click(openButton);
    await waitFor(() => expect(document.activeElement).toBe(firstNavItem));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        document.querySelector(".skip-sidebar.skip-mobile-nav-open")
      ).toBeNull()
    );
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(openButton));
  });

  it("keeps the desktop sidebar mounted when the mobile drawer is inactive", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    render(<App />);
    expect(
      screen.getByRole("navigation", { name: "SKIP workspace navigation" })
    ).toBeInTheDocument();
    expect(
      document.querySelector(".skip-sidebar.skip-mobile-nav-open")
    ).toBeNull();
  });
});

describe("SKIP app — full tab cycle", () => {
  it("mounts without crashing", async () => {
    render(<App />);
    // Overview is the default tab; give its first async effect a tick.
    await waitFor(() =>
      expect(document.body.textContent.length).toBeGreaterThan(0)
    );
  });

  for (const label of TABS) {
    it(`renders the "${label}" tab without an error-boundary fallback`, async () => {
      const user = userEvent.setup();
      render(<App />);

      const navButton = await waitFor(() => {
        const button = document.querySelector(
          `.skip-sidebar button[title="${label.replace(/"/g, '\\"')}"]`
        );
        if (!button)
          throw new Error(`Workspace navigation button not found: ${label}`);
        return button;
      });
      await user.click(navButton);

      // Let lazy() + Suspense + any first-render useEffect settle.
      await waitFor(
        () => {
          expect(document.body.textContent).not.toMatch(
            /This tab failed to load/
          );
        },
        { timeout: 10000 }
      );

      // Give async data effects (which all fail fast against the mocked
      // offline fetch) a moment to resolve and re-render before asserting.
      await new Promise(r => setTimeout(r, 300));

      expect(document.body.textContent).not.toMatch(/This tab failed to load/);
    });
  }
});
