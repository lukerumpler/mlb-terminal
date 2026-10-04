import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchFeed, fetchTeamNews, lowData, traceFns } = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchTeamNews: vi.fn(),
  lowData: { value: false },
  traceFns: { trace: vi.fn(() => []), queue: vi.fn(() => ({ activeRequests: 0, queuedRequests: 0 })) },
}));

vi.mock("../client/src/api/feed.js", () => ({ fetchFeed, fetchTeamNews }));
vi.mock("../client/src/lib/lowData.js", () => ({ useLowDataMode: () => lowData.value }));
vi.mock("../client/src/api/mlb.js", () => ({
  __getMlbRequestTraceForTests: () => traceFns.trace(),
  __getMlbQueueSnapshotForTests: () => traceFns.queue(),
}));

import TeamBadge from "../client/src/components/TeamBadge.jsx";
import TeamNewsPanel from "../client/src/components/TeamNewsPanel.jsx";
import PlayerNewsPanel from "../client/src/components/PlayerNewsPanel.jsx";
import RequestDiagnosticsPanel from "../client/src/components/RequestDiagnosticsPanel.jsx";

beforeEach(() => {
  fetchFeed.mockReset();
  fetchTeamNews.mockReset();
  lowData.value = false;
  traceFns.trace.mockReset().mockReturnValue([]);
  traceFns.queue.mockReset().mockReturnValue({ activeRequests: 0, queuedRequests: 0 });
});
afterEach(cleanup);

const article = (over = {}) => ({
  id: "a1",
  url: "https://example.com/story",
  title: "Padres sign a pitcher",
  text: "Padres sign a pitcher to a deal",
  sourceLabel: "MLB.com",
  isoDate: "2026-10-02T12:00:00.000Z",
  ...over,
});

describe("TeamBadge", () => {
  it("renders the official logo for a real team id", () => {
    render(<TeamBadge teamId={135} teamAbbr="SD" />);
    const img = screen.getByRole("img", { name: "SD" });
    expect(img).toHaveAttribute("src", "https://www.mlbstatic.com/team-logos/135.svg");
  });

  it("falls back to the abbreviation when there is no team id", () => {
    render(<TeamBadge teamAbbr="SD" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("SD")).toHaveTextContent("SD");
  });

  it("shows a dash and an honest label when nothing is known", () => {
    render(<TeamBadge />);
    expect(screen.getByLabelText("Team logo unavailable")).toHaveTextContent("—");
  });

  it("does not load the remote logo in Low Data Mode and says so", () => {
    lowData.value = true;
    render(<TeamBadge teamId={135} teamAbbr="SD" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("SD logo hidden in Low Data Mode")).toBeInTheDocument();
  });
});

describe("TeamNewsPanel", () => {
  const team = { abbr: "sd", name: "San Diego Padres" };

  it("requests news for the upper-cased abbreviation and lists linked, sourced articles", async () => {
    fetchTeamNews.mockResolvedValue({ status: "live", source: "Club RSS", freshness: "live", items: [article()] });
    render(<TeamNewsPanel team={team} />);
    expect(screen.getByText("Loading sourced team news…")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: /Open sourced article: Padres sign a pitcher/ });
    expect(fetchTeamNews).toHaveBeenCalledWith("SD", 8);
    expect(link).toHaveAttribute("href", "https://example.com/story");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(screen.getByText("MLB.com")).toBeInTheDocument();
    expect(screen.getByText(/Source state: live/)).toBeInTheDocument();
  });

  it("never invents headlines when the feed is empty or fails", async () => {
    fetchTeamNews.mockResolvedValue({ status: "unavailable", freshness: "unavailable", items: [], error: "Provider down" });
    render(<TeamNewsPanel team={team} />);
    expect(await screen.findByText("No verified team-news articles are available.")).toBeInTheDocument();
    expect(screen.getByText("Provider down")).toBeInTheDocument();
    expect(screen.getAllByText("Source unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("turns a rejected request into the unavailable state instead of crashing", async () => {
    fetchTeamNews.mockRejectedValue(new Error("network down"));
    render(<TeamNewsPanel team={team} />);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("labels a cached fallback snapshot", async () => {
    fetchTeamNews.mockResolvedValue({ status: "cached-fallback", freshness: "stale", items: [article()] });
    render(<TeamNewsPanel team={team} />);
    expect(await screen.findByText("Cached verified feed")).toBeInTheDocument();
    expect(screen.getByText(/last verified club-news snapshot/)).toBeInTheDocument();
  });
});

describe("PlayerNewsPanel", () => {
  it("shows a loading state, then sourced items", async () => {
    fetchFeed.mockResolvedValue({ status: "live", freshness: "live", items: [article({ title: "Tatis homers" })] });
    render(<PlayerNewsPanel player={{ fullName: "Fernando Tatis Jr." }} />);
    expect(screen.getByText("Fernando Tatis Jr. Highlights & News")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("Tatis homers")).toBeInTheDocument();
    expect(fetchFeed).toHaveBeenCalledWith("Fernando Tatis Jr.", 6);
    expect(screen.getByText("Sourced")).toBeInTheDocument();
  });

  it("does not fetch for an unnamed player", () => {
    render(<PlayerNewsPanel player={{}} />);
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("states that nothing was found rather than substituting headlines", async () => {
    fetchFeed.mockResolvedValue({ status: "live", freshness: "live", items: [] });
    render(<PlayerNewsPanel player={{ name: "Some Player" }} />);
    expect(await screen.findByText("No verified recent player highlights are available.")).toBeInTheDocument();
  });

  it("shows Unavailable with the error text when the request fails", async () => {
    fetchFeed.mockRejectedValue(new Error("boom"));
    render(<PlayerNewsPanel player={{ name: "Some Player" }} />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});

describe("RequestDiagnosticsPanel", () => {
  it("summarizes the queue and refreshes when a trace event fires", async () => {
    render(<RequestDiagnosticsPanel />);
    expect(screen.getByText(/Dev request diagnostics · 0 events · queue 0\/0/)).toBeInTheDocument();

    traceFns.trace.mockReturnValue([
      { id: 1, event: "success", priority: "high", resource: "standings", screen: "overview" },
      { id: 2, event: "error", priority: "low", resource: "news", screen: "players" },
    ]);
    traceFns.queue.mockReturnValue({ activeRequests: 1, queuedRequests: 3 });
    await act(async () => {
      window.dispatchEvent(new Event("skip-mlb-request-trace"));
    });
    await waitFor(() => expect(screen.getByText(/2 events · queue 1\/3/)).toBeInTheDocument());
    expect(screen.getByText(/standings · overview/)).toBeInTheDocument();
  });

  it("is excluded from exports and stops listening on unmount", () => {
    const { container, unmount } = render(<RequestDiagnosticsPanel />);
    expect(container.querySelector("details")).toHaveAttribute("data-export-ignore");
    const spy = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(spy).toHaveBeenCalledWith("skip-mlb-request-trace", expect.any(Function));
  });
});
