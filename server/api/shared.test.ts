import { describe, expect, it, vi } from "vitest";
import { applyCors, isRateLimited } from "./_shared.js";

describe("legacy API shared helpers", () => {
  it("returns the permissive CORS contract when no allowlist is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOWED_ORIGIN", "");
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };

    applyCors(
      { headers: {}, socket: { remoteAddress: "cors-test" } } as never,
      response as never,
    );

    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Accept");
    vi.unstubAllEnvs();
  });

  it("returns the configured CORS origin contract", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGIN", "https://skip.example.com, https://www.skip.example.com");
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };
    applyCors(
      { headers: { origin: "https://skip.example.com" }, socket: { remoteAddress: "cors-test-allow" } } as never,
      response as never,
    );
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://skip.example.com");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Accept");
    vi.unstubAllEnvs();
  });

  it("uses ALLOWED_ORIGIN in production and omits CORS access for an untrusted origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGIN", "https://skip.example.com, https://www.skip.example.com");
    const allowedHeaders = new Map<string, string>();
    const rejectedHeaders = new Map<string, string>();
    const responseFor = (headers: Map<string, string>) => ({
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    });

    applyCors({ headers: { origin: "https://skip.example.com" } } as never, responseFor(allowedHeaders) as never);
    applyCors({ headers: { origin: "https://attacker.example" } } as never, responseFor(rejectedHeaders) as never);

    expect(allowedHeaders.get("Access-Control-Allow-Origin")).toBe("https://skip.example.com");
    expect(rejectedHeaders.get("Access-Control-Allow-Origin")).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("accepts the configured lukerumpler.com production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGIN", "https://www.lukerumpler.com");
    const headers = new Map<string, string>();
    applyCors(
      { headers: { origin: "https://www.lukerumpler.com" } } as never,
      { setHeader(name: string, value: string) { headers.set(name, value); } } as never,
    );
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://www.lukerumpler.com");
    vi.unstubAllEnvs();
  });

  it("limits a single client after the configured burst window", () => {
    const request = {
      headers: { "x-forwarded-for": "rate-limit-test-unique-client" },
      socket: { remoteAddress: "rate-limit-test-unique-client" },
    } as never;

    for (let i = 0; i < 30; i += 1) {
      expect(isRateLimited(request)).toBe(false);
    }
    expect(isRateLimited(request)).toBe(true);
  });
});
