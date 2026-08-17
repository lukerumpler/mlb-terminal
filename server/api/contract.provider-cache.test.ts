import { afterEach, describe, expect, it, vi } from "vitest";
import contractHandler, { __resetBRefContractStateForTests } from "./contract.js";

type MockResponse = {
  statusCode: number;
  body: unknown;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  end: () => MockResponse;
};

function response(): MockResponse {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
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

function request(name = "Test Player") {
  const url = `/api/contract?name=${encodeURIComponent(name)}`;
  return { method: "GET", url, headers: {}, socket: { remoteAddress: "198.51.100.9" } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __resetBRefContractStateForTests();
});

describe("Baseball-Reference contract fallback refresh policy", () => {
  it("attempts BRef once per UTC day and retries after midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("spotrac.com")) return new Response("blocked", { status: 403 });
      return new Response("blocked", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await contractHandler(request(), response());
    await contractHandler(request(), response());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("baseball-reference.com"))).toHaveLength(1);

    vi.setSystemTime(new Date("2026-08-17T00:00:01.000Z"));
    await contractHandler(request(), response());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("baseball-reference.com"))).toHaveLength(2);
  });
});
