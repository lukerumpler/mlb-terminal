import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./mlb.js";

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

function createRequest() {
  return {
    method: "GET",
    url: "/api/mlb?path=/schedule&sportId=1",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
}

describe("MLB proxy upstream response handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});

export {};
