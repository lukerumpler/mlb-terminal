import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../client/src/App.jsx";

vi.mock("../client/src/hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, isLoggedIn: false, isLoading: false }),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    notes: {
      sync: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

const TABS = [
  "Team Overview",
  "Player",
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
      '.skip-sidebar button[title="Player"]'
    );
    expect(talentButton).toBeTruthy();
    await user.click(talentButton);
    await waitFor(() =>
      expect(
        document.querySelector(".skip-sidebar.skip-mobile-nav-open")
      ).toBeNull()
    );
    expect(document.querySelector(".skip-topbar")?.textContent).toContain(
      "Player"
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
      '.skip-sidebar button[title="Team Overview"]'
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

// The sidebar only exposes each workspace's *default* tab (title={t.label}
// on WORKSPACE_GROUPS, clicking always sets tab to t.defaultTab) — the tab
// cycle above, driven by that same sidebar, can never actually reach a
// workspace's other sub-tabs. Those are a second click away, inside the
// role="tablist" sub-nav that only renders once you're already on that
// workspace. Six real pages were getting zero automated coverage as a
// result: Prospects, Draft Board, AMD / IMD, Knowledge, Follow List, and
// Alerts. (This is also exactly how a stale/wrong workspace sub-tab
// description — Follow List's used to say "Tracked players and follow-up
// activity", which isn't what that page does — went unnoticed: nothing
// ever rendered it in a test.)
const WORKSPACE_SUBTABS = [
  { workspaceLabel: "Player", subTabLabels: ["Prospects", "Draft Board"] },
  { workspaceLabel: "Intelligence", subTabLabels: ["AMD / IMD", "Knowledge"] },
  { workspaceLabel: "Intel Feed", subTabLabels: ["Follow List"] },
  { workspaceLabel: "Settings", subTabLabels: ["Alerts"] },
];

describe("SKIP app — workspace sub-tabs (a second click past the sidebar)", () => {
  for (const { workspaceLabel, subTabLabels } of WORKSPACE_SUBTABS) {
    for (const subTabLabel of subTabLabels) {
      it(`renders the "${subTabLabel}" sub-tab (under the ${workspaceLabel} workspace) without an error-boundary fallback`, async () => {
        const user = userEvent.setup();
        render(<App />);

        const navButton = await waitFor(() => {
          const button = document.querySelector(
            `.skip-sidebar button[title="${workspaceLabel.replace(/"/g, '\\"')}"]`
          );
          if (!button)
            throw new Error(`Workspace navigation button not found: ${workspaceLabel}`);
          return button;
        });
        await user.click(navButton);

        const subTabButton = await waitFor(() =>
          screen.getByRole("tab", { name: subTabLabel })
        );
        await user.click(subTabButton);

        await waitFor(
          () => {
            expect(document.body.textContent).not.toMatch(
              /This tab failed to load/
            );
          },
          { timeout: 10000 }
        );

        await new Promise(r => setTimeout(r, 300));

        expect(document.body.textContent).not.toMatch(/This tab failed to load/);
        expect(
          screen.getByRole("tab", { name: subTabLabel })
        ).toHaveAttribute("aria-selected", "true");
      });
    }
  }

  it('renders "About Me" without an error-boundary fallback', async () => {
    // Not part of TABS/WORKSPACE_GROUPS at all — its own always-visible,
    // bottom-pinned sidebar button.
    const user = userEvent.setup();
    render(<App />);

    const aboutButton = await waitFor(() => {
      const button = screen.getByText("About Me").closest("button");
      if (!button) throw new Error("About Me button not found");
      return button;
    });
    await user.click(aboutButton);

    await waitFor(
      () => {
        expect(document.body.textContent).not.toMatch(
          /This tab failed to load/
        );
      },
      { timeout: 10000 }
    );

    await new Promise(r => setTimeout(r, 300));

    expect(document.body.textContent).not.toMatch(/This tab failed to load/);
  });
});
