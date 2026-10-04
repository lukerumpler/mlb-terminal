import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENT_SECURITY_POLICY, securityHeaders } from "./security-headers";

async function get(headers: Record<string, string> = {}) {
  const app = express();
  app.use(securityHeaders());
  app.get("/", (_req, res) => res.send("ok"));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    return await fetch(`http://127.0.0.1:${port}/`, { headers });
  } finally {
    server.close();
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("securityHeaders", () => {
  it("sets the baseline headers and hides X-Powered-By", async () => {
    const res = await get();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(res.headers.get("permissions-policy")).toContain(
      "microphone=(self)"
    );
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("does not forbid framing (the platform preview may need it)", async () => {
    const res = await get();
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(CONTENT_SECURITY_POLICY).not.toContain("frame-ancestors");
  });

  it("sends HSTS only for HTTPS requests in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await get()).headers.get("strict-transport-security")).toBeNull();
    const secure = await get({ "x-forwarded-proto": "https" });
    expect(secure.headers.get("strict-transport-security")).toBe(
      "max-age=15552000"
    );

    vi.stubEnv("NODE_ENV", "development");
    expect(
      (await get({ "x-forwarded-proto": "https" })).headers.get(
        "strict-transport-security"
      )
    ).toBeNull();
  });

  it("defaults to a Report-Only CSP, and enforce/off switch it", async () => {
    let res = await get();
    expect(res.headers.get("content-security-policy-report-only")).toBe(
      CONTENT_SECURITY_POLICY
    );
    expect(res.headers.get("content-security-policy")).toBeNull();

    vi.stubEnv("CSP_MODE", "enforce");
    res = await get();
    expect(res.headers.get("content-security-policy")).toBe(
      CONTENT_SECURITY_POLICY
    );
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();

    vi.stubEnv("CSP_MODE", "off");
    res = await get();
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("allows every external host the page is known to use", () => {
    for (const host of [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://img.mlbstatic.com",
      "https://statsapi.mlb.com",
      "https://www.youtube.com",
    ]) {
      expect(CONTENT_SECURITY_POLICY).toContain(host);
    }
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });
});
