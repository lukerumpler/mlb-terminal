import { afterEach, describe, expect, it, vi } from "vitest";

const { readDurableCache, writeDurableCache } = vi.hoisted(() => ({
  readDurableCache: vi.fn().mockResolvedValue(null),
  writeDurableCache: vi.fn().mockResolvedValue(false),
}));
vi.mock("../durable-cache", () => ({ readDurableCache, writeDurableCache }));

import handler, { __resetSavantStateForTests } from "./savant.js";

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
function createRequest(query: Record<string, unknown>) {
  counter += 1;
  return {
    method: "GET",
    query,
    headers: {},
    socket: { remoteAddress: `savant-validation-${counter}` },
  };
}

function stubUpstream() {
  const upstream = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => "launch_speed,launch_angle\n97,12\n",
    headers: { get: () => null },
  });
  vi.stubGlobal("fetch", upstream);
  return upstream;
}

describe("/api/savant input validation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    readDurableCache.mockReset().mockResolvedValue(null);
    writeDurableCache.mockReset().mockResolvedValue(false);
    __resetSavantStateForTests();
  });

  // ENDPOINTS is a plain object, so `ENDPOINTS[name]` is truthy for every
  // Object.prototype member and used to slip past the "valid endpoint" check
  // (a 500, or a fetch of the literal string "[object Object]").
  const prototypeNames = [
    "__proto__",
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "__defineGetter__",
  ];

  prototypeNames.forEach(name => {
    it(`rejects endpoint=${name} with a 400 and never calls upstream`, async () => {
      const upstream = stubUpstream();
      const res = createResponse();
      await handler(createRequest({ endpoint: name, year: "2026" }), res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("Invalid endpoint");
      expect(upstream).not.toHaveBeenCalled();
    });
  });

  it("rejects a repeated or bracketed endpoint parameter (an array)", async () => {
    const upstream = stubUpstream();
    const res = createResponse();
    await handler(
      createRequest({ endpoint: ["expected_statistics"], year: "2026" }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  const badYears = [
    "2026&csv=false",
    "abc",
    "1999",
    "20266",
    "2026.5",
    "-1",
    "9999",
    "2026%26x=1",
    // Number() would read these as 2026, but they would reach the upstream URL verbatim.
    "0x7EA",
    "2.026e3",
    " 2026",
    "+2026",
  ];
  badYears.forEach(year => {
    it(`rejects year=${year} before any upstream request`, async () => {
      const upstream = stubUpstream();
      const res = createResponse();
      await handler(
        createRequest({ endpoint: "expected_statistics", year }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/year/i);
      expect(upstream).not.toHaveBeenCalled();
    });
  });

  it("still serves real endpoints and years", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    for (const year of ["2026", "2015", "2008", "2027"]) {
      __resetSavantStateForTests();
      const upstream = stubUpstream();
      const res = createResponse();
      await handler(
        createRequest({ endpoint: "expected_statistics", year }),
        res
      );
      expect(res.statusCode, year).toBe(200);
      expect(String(upstream.mock.calls[0]?.[0])).toContain(`year=${year}`);
    }
  });

  it("defaults to the calendar season, not a hardcoded 2026", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T12:00:00.000Z"));
    const upstream = stubUpstream();
    const res = createResponse();
    await handler(createRequest({ endpoint: "expected_statistics" }), res);
    expect(res.statusCode).toBe(200);
    expect(String(upstream.mock.calls[0]?.[0])).toContain("year=2027");
  });
});
