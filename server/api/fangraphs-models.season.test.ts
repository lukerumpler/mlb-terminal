import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./fangraphs-models.js";

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  json: (value: unknown) => MockResponse;
  end: () => MockResponse;
};

function createResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(value) {
      res.body = value;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

let counter = 0;
function createRequest(season: string) {
  counter += 1;
  const ip = `203.0.113.${counter}`;
  return {
    method: "GET",
    url: `/api/fangraphs-models?mode=aggregate&season=${season}`,
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  };
}

describe("/api/fangraphs-models season bounds", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Each distinct season becomes an upstream fetch and a cache key, so an
  // unbounded integer lets one caller mint unlimited cache entries.
  ["-1", "0", "1900", "9999", "1000000000", "99999999999999999999"].forEach(
    season => {
      it(`rejects season=${season} before any upstream request`, async () => {
        const upstream = vi.fn();
        vi.stubGlobal("fetch", upstream);
        const res = createResponse();
        await handler(createRequest(season), res);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/season/i);
        expect(upstream).not.toHaveBeenCalled();
      });
    }
  );

  it("still looks up real seasons", async () => {
    const upstream = vi.fn().mockRejectedValue(new Error("blocked in test"));
    vi.stubGlobal("fetch", upstream);
    const res = createResponse();
    await handler(createRequest("2024"), res);
    expect(res.statusCode).not.toBe(400);
    expect(upstream).toHaveBeenCalled();
  });

  it("keeps treating a non-numeric season as the current season", async () => {
    const upstream = vi.fn().mockRejectedValue(new Error("blocked in test"));
    vi.stubGlobal("fetch", upstream);
    const res = createResponse();
    await handler(createRequest("undefined"), res);
    expect(res.statusCode).not.toBe(400);
  });
});
