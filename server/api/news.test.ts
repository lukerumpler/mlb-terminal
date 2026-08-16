import { afterEach, describe, expect, it, vi } from "vitest";
import newsHandler, { __resetNewsStateForTests } from "./news.js";

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
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function request(url: string, ip = "198.51.100.41") {
  const parsed = new URL(url, "https://skipbasebal-mm6hz9ps.manus.space");
  return {
    method: "GET",
    url,
    query: Object.fromEntries(parsed.searchParams.entries()),
    headers: {
      origin: "https://skipbasebal-mm6hz9ps.manus.space",
      "x-forwarded-for": ip,
    },
    socket: { remoteAddress: ip },
  };
}

function rss(title: string, url = "https://www.espn.com/mlb/story/verified") {
  return `<?xml version="1.0"?><rss><channel><title>MLB Headlines</title><item><title><![CDATA[${title}]]></title><link>${url}</link><description><![CDATA[${title} summary]]></description><pubDate>Fri, 14 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
}

afterEach(() => {
  __resetNewsStateForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resilient /api/news route", () => {
  it("falls back from every Nitter mirror to the verified ESPN MLB RSS feed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("mirror down", { status: 503 }))
      .mockResolvedValueOnce(new Response("mirror down", { status: 503 }))
      .mockResolvedValueOnce(new Response("mirror down", { status: 503 }))
      .mockResolvedValueOnce(new Response("mirror down", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(rss("ESPN fallback headline"), {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = response();
    await newsHandler(request("/api/news?handle=JonHeyman&n=2"), result);

    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.body).toMatchObject({
      status: "tier-2",
      source: "ESPN MLB RSS",
    });
    expect(
      (result.body as { items: Array<{ text: string; sourceTier: number }> })
        .items[0]
    ).toMatchObject({
      text: "ESPN fallback headline summary",
      sourceTier: 2,
    });
    expect(
      (
        result.body as {
          sourceStatuses: Array<{
            key: string;
            ok: boolean | null;
            reason: string | null;
          }>;
        }
      ).sourceStatuses
    ).toEqual([
      expect.objectContaining({ key: "nitter-1", ok: false }),
      expect.objectContaining({ key: "nitter-2", ok: false }),
      expect.objectContaining({ key: "nitter-3", ok: false }),
      expect.objectContaining({ key: "nitter-4", ok: false }),
      expect.objectContaining({ key: "espn-mlb", ok: true }),
      expect.objectContaining({
        key: "mlb-official",
        ok: null,
        reason: "standby",
      }),
    ]);
  });

  it("serves a warm successful response without making a second upstream call", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(rss("Official MLB headline"), {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = response();
    const second = response();
    await newsHandler(
      request("/api/news?kind=mlb&n=2", "198.51.100.42"),
      first
    );
    await newsHandler(
      request("/api/news?kind=mlb&n=2", "198.51.100.42"),
      second
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.headers["X-News-Cache"]).toBe("HIT");
    expect((second.body as { status: string; freshness: string }).status).toBe(
      "cached"
    );
    expect((second.body as { freshness: string }).freshness).toBe("cached");
  });

  it("serves a stale verified snapshot when every live source fails after expiry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(rss("Cached official headline"), {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })
      )
      .mockResolvedValue(
        new Response("busy", { status: 429, headers: { "Retry-After": "8" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const seeded = response();
    await newsHandler(
      request("/api/news?kind=mlb&n=2", "198.51.100.43"),
      seeded
    );
    vi.advanceTimersByTime(15 * 60_000 + 1);

    const stale = response();
    await newsHandler(
      request("/api/news?kind=mlb&n=2", "198.51.100.43"),
      stale
    );

    expect(stale.statusCode).toBe(200);
    expect(stale.headers["X-News-Cache"]).toBe("STALE");
    expect(stale.body).toMatchObject({
      status: "cached-fallback",
      freshness: "stale-cached",
    });
    expect(
      (stale.body as { items: Array<{ text: string }> }).items[0].text
    ).toBe("Cached official headline summary");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
