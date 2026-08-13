import { describe, expect, it } from "vitest";
import { applyCors, isRateLimited } from "./_shared.js";

describe("legacy API shared helpers", () => {
  it("returns the permissive CORS contract when no allowlist is configured", () => {
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
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
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
