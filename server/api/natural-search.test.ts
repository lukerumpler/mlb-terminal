import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm.ts", () => ({
  invokeLLM: vi.fn(),
}));

import naturalSearch, { clearNaturalSearchCache } from "./natural-search.js";
import { invokeLLM } from "../_core/llm.ts";

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("natural-language search handler", () => {
  beforeEach(() => {
    clearNaturalSearchCache();
    vi.clearAllMocks();
  });

  it("returns a structured verified destination and reuses the short cache", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "team",
              tab: "overview",
              entity: "Los Angeles Dodgers",
              metric: "WAR",
              interpretation: "Open the verified Dodgers team overview.",
            }),
          },
        },
      ],
    } as never);
    const req = {
      method: "POST",
      body: { query: "Dodgers team WAR" },
    } as never;
    const first = response();
    await naturalSearch(req, first as never);
    const second = response();
    await naturalSearch(req, second as never);
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({
      intent: "team",
      tab: "overview",
      entity: "Los Angeles Dodgers",
      metric: "WAR",
      generated: true,
    });
    expect(second.headers["X-Search-Cache"]).toBe("HIT");
    expect(invokeLLM).toHaveBeenCalledTimes(1);
  });

  it("returns a safe explicit fallback when the AI provider fails", async () => {
    vi.mocked(invokeLLM).mockRejectedValueOnce(
      new Error("provider unavailable")
    );
    const res = response();
    await naturalSearch(
      {
        method: "POST",
        body: { query: "some unclear baseball request" },
      } as never,
      res as never
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-Search-Status"]).toBe("unavailable");
    expect(res.body).toMatchObject({
      intent: "unknown",
      tab: null,
      entity: null,
      generated: false,
    });
  });

  it("rejects non-POST requests and empty queries", async () => {
    const methodRes = response();
    await naturalSearch(
      { method: "GET", body: {} } as never,
      methodRes as never
    );
    expect(methodRes.statusCode).toBe(405);
    const queryRes = response();
    await naturalSearch(
      { method: "POST", body: { query: " " } } as never,
      queryRes as never
    );
    expect(queryRes.statusCode).toBe(400);
  });
});

describe("natural-language search cost protection", () => {
  const llmReply = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            intent: "page",
            tab: "league",
            entity: null,
            metric: null,
            confidence: 0.9,
          }),
        },
      },
    ],
  };
  async function search(query: string, ip: string) {
    const res = response();
    await naturalSearch(
      {
        method: "POST",
        body: { query },
        headers: { "x-forwarded-for": ip },
      } as never,
      res as never
    );
    return res;
  }

  beforeEach(() => {
    clearNaturalSearchCache();
    vi.clearAllMocks();
  });

  it("throttles uncached LLM calls per client with 429", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(llmReply as never);
    const results = [];
    for (let i = 0; i < 12; i++)
      results.push(await search(`unique query ${i}`, "198.51.100.90"));
    const limitedAt = results.findIndex(r => r.statusCode === 429);
    expect(limitedAt).toBeGreaterThan(0);
    expect(results[limitedAt].headers["Retry-After"]).toBe("10");
    expect(vi.mocked(invokeLLM).mock.calls.length).toBe(limitedAt);
  });

  it("does not count cache hits against the limit", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(llmReply as never);
    const first = await search("same query", "198.51.100.91");
    expect(first.statusCode).toBe(200);
    for (let i = 0; i < 15; i++) {
      const hit = await search("same query", "198.51.100.91");
      expect(hit.statusCode).toBe(200);
      expect(hit.headers["X-Search-Cache"]).toBe("HIT");
    }
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);
  });
});
