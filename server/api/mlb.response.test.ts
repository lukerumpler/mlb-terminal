import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { __resetMlbProxyStateForTests } from "./mlb.js";

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  ended: boolean;
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  json: (value: unknown) => MockResponse;
  end: () => MockResponse;
};

function createResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    status(code) {
      response.statusCode = code;
      return response;
    },
    setHeader(name, value) {
      response.headers[name] = value;
      return response;
    },
    json(value) {
      response.body = value;
      return response;
    },
    end() {
      response.ended = true;
      return response;
    },
  };
  return response;
}

function createRequest(url = "/api/mlb?path=/schedule&sportId=1") {
  return {
    method: "GET",
    url,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
}

describe("MLB proxy upstream response handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetMlbProxyStateForTests();
  });

  it("returns a controlled 502 for a non-JSON upstream body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html>upstream error</html>",
    }));

    const response = createResponse();
    await handler(createRequest(), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toMatchObject({
      error: "MLB API returned non-JSON response",
    });
  });

  it("returns a controlled 502 for an empty upstream body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "   ",
    }));

    const response = createResponse();
    await handler(createRequest(), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toMatchObject({
      error: "MLB API returned an empty response",
    });
  });

  it("serves repeated successful reads from the warm response cache", async () => {
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ dates: [], totalItems: 0 }),
    });
    vi.stubGlobal("fetch", upstream);

    const first = createResponse();
    const second = createResponse();
    const url = "/api/mlb?path=/schedule&sportId=1&date=2098-08-01";
    await handler(createRequest(url), first);
    await handler(createRequest(url), second);

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.headers["X-Proxy-Cache"]).toBe("HIT");
  });
});

export {};
