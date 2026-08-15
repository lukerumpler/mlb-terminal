import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { __resetMlbProxyStateForTests } from "./mlb.js";

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  end: () => MockResponse;
};

function response(): MockResponse {
  const result = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  } as MockResponse;
  return result;
}

function request(query: string) {
  return {
    method: "GET",
    url: `/api/mlb?path=${encodeURIComponent(query)}`,
    headers: { origin: "https://skipbasebal-mm6hz9ps.manus.space", "x-forwarded-for": "198.51.100.11" },
    socket: { remoteAddress: "198.51.100.11" },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMlbProxyStateForTests();
});

describe("MLB proxy upstream protection", () => {
  it("coalesces identical concurrent cache misses into one upstream request", async () => {
    let resolveFetch!: (value: Response) => void;
    const upstream = new Promise<Response>(resolve => { resolveFetch = resolve; });
    const fetchMock = vi.fn(() => upstream);
    vi.stubGlobal("fetch", fetchMock);

    const firstResponse = response();
    const secondResponse = response();
    const first = handler(request("/teams/238?coalesce=one"), firstResponse);
    const second = handler(request("/teams/238?coalesce=one"), secondResponse);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify({ teams: [{ id: 238 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    await Promise.all([first, second]);
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.headers["X-Proxy-Cache"]).toBe("COALESCED");
  });

  it("avoids repeating an identical upstream failure during the short cooldown", async () => {
    const fetchMock = vi.fn(async () => { throw Object.assign(new Error("upstream timeout"), { name: "TimeoutError" }); });
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    await handler(request("/schedule?cooldown=one"), first);
    const second = response();
    await handler(request("/schedule?cooldown=one"), second);
    expect(first.statusCode).toBe(504);
    expect(second.statusCode).toBe(503);
    expect(second.headers["Retry-After"]).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes through upstream Retry-After for throttled responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 429, headers: { "Retry-After": "7" } })));
    const result = response();
    await handler(request("/teams/238?throttle=one"), result);
    expect(result.statusCode).toBe(429);
    expect(result.headers["Retry-After"]).toBe("7");
    expect(result.body).toMatchObject({ error: "MLB API responded with 429" });
  });
});
