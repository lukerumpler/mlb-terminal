import { describe, expect, it, vi } from "vitest";
import { legacyApiErrorHandler, legacyApiPaths } from "./routes";

describe("legacy API route registration", () => {
  it("keeps every original SKIP proxy path and registers efficiency services", () => {
    expect(legacyApiPaths).toEqual([
      "/api/mlb",
      "/api/ncaa",
      "/api/savant",
      "/api/feed",
      "/api/news",
      "/api/contract",
      "/api/comparison-summary",
      "/api/natural-search",
      "/api/team-financials",
      "/api/team-efficiency",
      "/api/playoffstatus-odds",
      "/api/player-advanced",
      "/api/player-identity",
    ]);
  });
});

describe("legacyApiErrorHandler", () => {
  function run(error: unknown, headersSent = false) {
    const out = { code: 0, body: null as unknown, next: vi.fn() };
    const res = {
      headersSent,
      status(code: number) {
        out.code = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
        return res;
      },
    };
    legacyApiErrorHandler(error, {} as never, res as never, out.next);
    return out;
  }
  const httpError = (status: number, message: string, expose = true) =>
    Object.assign(new Error(message), { status, expose });

  it("reports client errors from middleware (oversized body, bad JSON) with their own status", () => {
    expect(run(httpError(413, "request entity too large"))).toMatchObject({
      code: 413,
      body: { error: "request entity too large" },
    });
    expect(run(httpError(400, "Unexpected token } in JSON"))).toMatchObject({
      code: 400,
    });
  });

  it("still answers 500 for real server errors and for non-exposable errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(run(new Error("db exploded"))).toMatchObject({
      code: 500,
      body: { error: "db exploded" },
    });
    expect(run(httpError(502, "bad gateway"))).toMatchObject({ code: 500 });
    expect(run(httpError(404, "hidden", false))).toMatchObject({ code: 500 });
    expect(run("a string")).toMatchObject({ code: 500 });
  });

  it("hands off to Express when the response has already started", () => {
    const out = run(new Error("late"), true);
    expect(out.next).toHaveBeenCalledTimes(1);
    expect(out.code).toBe(0);
  });
});
