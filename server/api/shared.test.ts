import { describe, expect, it, vi } from "vitest";
import { applyCors, clientAddress, isRateLimited } from "./_shared.js";

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
      response as never
    );

    expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Accept"
    );
    vi.unstubAllEnvs();
  });

  it("returns the configured CORS origin contract", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "ALLOWED_ORIGIN",
      "https://skip.example.com, https://www.skip.example.com"
    );
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };
    applyCors(
      {
        headers: { origin: "https://skip.example.com" },
        socket: { remoteAddress: "cors-test-allow" },
      } as never,
      response as never
    );
    expect(headers.get("Access-Control-Allow-Origin")).toBe(
      "https://skip.example.com"
    );
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Accept"
    );
    vi.unstubAllEnvs();
  });

  it("uses ALLOWED_ORIGIN in production and omits CORS access for an untrusted origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "ALLOWED_ORIGIN",
      "https://skip.example.com, https://www.skip.example.com"
    );
    const allowedHeaders = new Map<string, string>();
    const rejectedHeaders = new Map<string, string>();
    const responseFor = (headers: Map<string, string>) => ({
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    });

    applyCors(
      { headers: { origin: "https://skip.example.com" } } as never,
      responseFor(allowedHeaders) as never
    );
    applyCors(
      { headers: { origin: "https://attacker.example" } } as never,
      responseFor(rejectedHeaders) as never
    );

    expect(allowedHeaders.get("Access-Control-Allow-Origin")).toBe(
      "https://skip.example.com"
    );
    expect(rejectedHeaders.get("Access-Control-Allow-Origin")).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("accepts the configured lukerumpler.com production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_ORIGIN", "https://www.lukerumpler.com");
    const headers = new Map<string, string>();
    applyCors(
      { headers: { origin: "https://www.lukerumpler.com" } } as never,
      {
        setHeader(name: string, value: string) {
          headers.set(name, value);
        },
      } as never
    );
    expect(headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.lukerumpler.com"
    );
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

  describe("rate limiting configuration", () => {
    const req = (forwarded?: string, remote = "10.0.0.9") =>
      ({
        headers: forwarded ? { "x-forwarded-for": forwarded } : {},
        socket: { remoteAddress: remote },
      }) as never;

    it("keys on the first forwarded address by default (unchanged behavior)", () => {
      vi.stubEnv("RATE_LIMIT_TRUSTED_PROXY_HOPS", "");
      expect(clientAddress(req("1.1.1.1, 2.2.2.2"))).toBe("1.1.1.1");
      expect(clientAddress(req())).toBe("10.0.0.9");
      vi.unstubAllEnvs();
    });

    it("uses the Nth address from the right when trusted hops are configured", () => {
      vi.stubEnv("RATE_LIMIT_TRUSTED_PROXY_HOPS", "1");
      // A spoofed leading entry no longer decides who the client is.
      expect(clientAddress(req("6.6.6.6, 203.0.113.5"))).toBe("203.0.113.5");
      vi.stubEnv("RATE_LIMIT_TRUSTED_PROXY_HOPS", "2");
      expect(clientAddress(req("6.6.6.6, 203.0.113.5, 10.1.1.1"))).toBe(
        "203.0.113.5"
      );
      // More hops than entries falls back to the leftmost instead of throwing.
      expect(clientAddress(req("203.0.113.5"))).toBe("203.0.113.5");
      vi.unstubAllEnvs();
    });

    it("honors RATE_LIMIT_MAX and ignores invalid values", () => {
      vi.stubEnv("RATE_LIMIT_MAX", "2");
      const caller = req("198.51.100.200");
      expect([1, 2, 3].map(() => isRateLimited(caller, "cfg-test"))).toEqual([
        false,
        false,
        true,
      ]);
      vi.stubEnv("RATE_LIMIT_MAX", "not-a-number");
      const other = req("198.51.100.201");
      const results = Array.from({ length: 31 }, () =>
        isRateLimited(other, "cfg-test")
      );
      expect(results.slice(0, 30).every(r => r === false)).toBe(true);
      expect(results[30]).toBe(true);
      vi.unstubAllEnvs();
    });
  });
});
