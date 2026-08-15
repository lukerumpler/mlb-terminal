import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { __resetTeamFinancialsStateForTests } from "./team-financials.js";

function request(ip = "10.0.0.1") {
  return {
    method: "GET",
    url: "/api/team-financials?team=LAD&season=2026",
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  };
}

function response() {
  const payload = { statusCode: 0, body: null, headers: {} };
  return {
    payload,
    setHeader(key, value) { payload.headers[key] = value; },
    status(code) { payload.statusCode = code; return this; },
    json(body) { payload.body = body; return this; },
    end() { return this; },
  };
}

const goodHtml = {
  payroll: "<table><thead><tr><th>Team</th><th>Total Payroll</th></tr></thead><tbody><tr><td>LAD LAD</td><td>$300,000,000</td></tr></tbody></table>",
  tax: "<table><thead><tr><th>Team</th><th>Tax Payroll</th><th>Tax Bill</th></tr></thead><tbody><tr><td>LAD LAD</td><td>$400,000,000</td><td>$150,000,000</td></tr></tbody></table>",
};

function upstreamResponse(url) {
  const body = url.includes("/payroll/") ? goodHtml.payroll : goodHtml.tax;
  return Promise.resolve(new Response(body, { status: 200 }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetTeamFinancialsStateForTests();
});

describe("team-financials proxy cache", () => {
  it("serves a warm cache hit without re-fetching Spotrac", async () => {
    const fetchMock = vi.fn(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();

    await handler(request("10.0.0.2"), first);
    await handler(request("10.0.0.3"), second);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.payload.body.found).toBe(true);
    expect(second.payload.headers["X-Provider-Cache"]).toBe("MISS");
  });

  it("coalesces concurrent identical upstream loads", async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const fetchMock = vi.fn(async url => { await gate; return upstreamResponse(url); });
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();

    const firstRun = handler(request("10.0.0.4"), first);
    const secondRun = handler(request("10.0.0.4"), second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release();
    await Promise.all([firstRun, secondRun]);

    expect(first.payload.body.found).toBe(true);
    expect(second.payload.body.found).toBe(true);
  });

  it("returns a verified stale snapshot when both upstream pages fail", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T22:00:00.000Z"));
    const fetchMock = vi.fn(upstreamResponse);
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    await handler(request("10.0.0.5"), first);

    vi.setSystemTime(new Date("2026-08-15T22:31:00.000Z"));
    fetchMock.mockRejectedValue(new Error("Spotrac unavailable"));
    const stale = response();
    await handler(request("10.0.0.5"), stale);

    expect(stale.payload.body.found).toBe(true);
    expect(stale.payload.body.freshness).toBe("stale-cached");
    expect(stale.payload.headers["X-Provider-Freshness"]).toBe("stale-cached");
  });
});
