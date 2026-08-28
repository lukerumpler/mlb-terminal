import { describe, expect, it } from "vitest";
import handler, { legacyHandlerLoaders, resolveLegacyHandlerPath } from "../api/[...path]";

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: () => undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end: () => undefined,
  };
}

describe("serverless catch-all dispatch", () => {
  it("routes supported secondary handlers without constructing the full application", () => {
    expect(typeof legacyHandlerLoaders["/api/cache-health"]).toBe("function");
    expect(typeof legacyHandlerLoaders["/api/lahman"]).toBe("function");
    expect(typeof legacyHandlerLoaders["/api/intelligence-calculations"]).toBe("function");
  });

  it("normalizes absolute and trailing-slash request paths for Vercel dispatch", () => {
    expect(resolveLegacyHandlerPath({ url: "https://www.lukerumpler.com/api/cache-health/" })).toBe("/api/cache-health");
    expect(resolveLegacyHandlerPath({ url: "/api/lahman?mlbam=545361" })).toBe("/api/lahman");
  });

  it("loads and executes a secondary handler without booting OAuth, storage, or tRPC", async () => {
    const res = createResponse();
    await handler({ method: "GET", url: "/api/lahman?mlbam=545361", headers: {}, query: { mlbam: "545361" } } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ found: true, mlbam: "545361" });
  });

  it("loads the cache-health handler without full-application initialization", async () => {
    const res = createResponse();
    await handler({ method: "GET", url: "/api/cache-health", headers: {}, query: {} } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ day: expect.any(String), providers: expect.any(Object), source: "SKIP cache telemetry" });
  });

  it("returns a controlled 404 for an unregistered catch-all path", async () => {
    const res = createResponse();
    await handler({ method: "GET", url: "/api/not-a-secondary-route", headers: {} } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Unknown API route: /api/not-a-secondary-route" });
  });
});
