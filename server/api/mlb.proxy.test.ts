import { afterEach, describe, expect, it, vi } from "vitest";
import handler, {
  __resetMlbProxyStateForTests,
  getUpstreamTimeoutMs,
} from "./mlb.js";

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
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  } as MockResponse;
  return result;
}

function request(query: string) {
  return {
    method: "GET",
    url: `/api/mlb?path=${encodeURIComponent(query)}`,
    headers: {
      origin: "https://skipbasebal-mm6hz9ps.manus.space",
      "x-forwarded-for": "198.51.100.11",
    },
    socket: { remoteAddress: "198.51.100.11" },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMlbProxyStateForTests();
});

describe("MLB proxy upstream protection", () => {
  it("uses longer deadlines for known slow MLB resources", () => {
    expect(getUpstreamTimeoutMs("/schedule")).toBe(20_000);
    expect(getUpstreamTimeoutMs("/teams/119/affiliates")).toBe(15_000);
    expect(getUpstreamTimeoutMs("/people/123")).toBe(12_000);
  });
  it("coalesces identical concurrent cache misses into one upstream request", async () => {
    let resolveFetch!: (value: Response) => void;
    const upstream = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => upstream);
    vi.stubGlobal("fetch", fetchMock);

    const firstResponse = response();
    const secondResponse = response();
    const first = handler(request("/teams/238?coalesce=one"), firstResponse);
    const second = handler(request("/teams/238?coalesce=one"), secondResponse);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify({ teams: [{ id: 238 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await Promise.all([first, second]);
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.headers["X-Proxy-Cache"]).toBe("COALESCED");
  });

  it("avoids repeating an identical upstream failure during the short cooldown", async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error("upstream timeout"), {
        name: "TimeoutError",
      });
    });
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
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("busy", { status: 429, headers: { "Retry-After": "7" } })
      )
    );
    const result = response();
    await handler(request("/teams/238?throttle=one"), result);
    expect(result.statusCode).toBe(429);
    expect(result.headers["Retry-After"]).toBe("7");
    expect(result.body).toMatchObject({ error: "MLB API responded with 429" });
  });
});

describe("MLB proxy path validation", () => {
  const withIp = (ip: string, req: ReturnType<typeof request>) => ({
    ...req,
    headers: { ...req.headers, "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  });

  // WHATWG URL parsing collapses "..", "%2e%2e" and "\", so each of these would
  // otherwise resolve outside /api/v1 on statsapi.mlb.com.
  const escaping = [
    "/../../x",
    "/a/../../b",
    "/..",
    "/%2e%2e/x",
    "/%2E%2e/%2e%2E/x",
    "/a\\..\\..\\x",
  ];

  escaping.forEach((path, index) => {
    it(`rejects ${JSON.stringify(path)} before any upstream request`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const res = response();
      await handler(withIp(`203.0.113.${index + 10}`, request(path)), res);
      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("rejects a dot-segment sent single-encoded in the raw URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    const req = withIp("203.0.113.40", request("/x"));
    req.url = "/api/mlb?path=/%2e%2e/%2e%2e/x";
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still forwards ordinary paths, and stays under /api/v1", async () => {
    const paths = [
      "/people/805299",
      "/teams/147/roster",
      "/schedule?sportId=1&date=2026-07-04",
      "/a/./b",
      "/a/..",
      "/",
    ];
    for (const [index, path] of paths.entries()) {
      const fetchMock = vi.fn(
        async () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      );
      vi.stubGlobal("fetch", fetchMock);
      __resetMlbProxyStateForTests();
      const res = response();
      await handler(withIp(`203.0.113.${index + 50}`, request(path)), res);
      expect(res.statusCode, path).toBe(200);
      const upstream = new URL(String(fetchMock.mock.calls[0]?.[0]));
      expect(upstream.origin).toBe("https://statsapi.mlb.com");
      expect(upstream.pathname.startsWith("/api/v1/"), path).toBe(true);
    }
  });
});
