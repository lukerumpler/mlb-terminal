import { afterEach, describe, expect, it } from "vitest";
import { authorizeProviderFailureHook } from "./provider-failure-hook.js";
import savantHandler from "./savant.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalToken = process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN;
const originalEnabled = process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalToken === undefined) delete process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN;
  else process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = originalToken;
  if (originalEnabled === undefined) delete process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED;
  else process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = originalEnabled;
});

describe("provider failure hook authorization", () => {
  it("denies the hook in production even when a token is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = "test-token";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = "true";

    expect(authorizeProviderFailureHook({ "x-staging-provider-failure-token": "test-token" })).toEqual({
      allowed: false,
      reason: "production-disabled",
    });
  });

  it("rejects the hook outside staging even when the token and flag are configured", () => {
    process.env.NODE_ENV = "development";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = "test-token";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = "true";

    expect(authorizeProviderFailureHook({ "x-staging-provider-failure-token": "test-token" })).toEqual({
      allowed: false,
      reason: "staging-only",
    });
  });

  it("requires the configured staging token and explicit enable flag", () => {
    process.env.NODE_ENV = "staging";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = "test-token";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = "false";
    expect(authorizeProviderFailureHook({ "x-staging-provider-failure-token": "test-token" })).toEqual({ allowed: false, reason: "not-enabled" });
    process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = "true";

    expect(authorizeProviderFailureHook({})).toEqual({ allowed: false, reason: "missing-token" });
    expect(authorizeProviderFailureHook({ "x-staging-provider-failure-token": "wrong-token" })).toEqual({
      allowed: false,
      reason: "invalid-token",
    });
    expect(authorizeProviderFailureHook({ "x-staging-provider-failure-token": "test-token" })).toEqual({
      allowed: true,
    });
  });

  it("returns a synthetic 503 before cache or upstream work for an authorized staging request", async () => {
    process.env.NODE_ENV = "staging";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = "test-token";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_ENABLED = "true";
    const response = {
      headers: {},
      statusCode: 200,
      body: undefined,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; },
      end() { return this; },
    };

    await savantHandler({
      method: "GET",
      query: { endpoint: "expected_statistics", year: "2026" },
      headers: {
        "x-staging-provider-failure": "true",
        "x-staging-provider-failure-token": "test-token",
      },
    }, response);

    expect(response.statusCode).toBe(503);
    expect(response.headers["X-Provider-Failure-Hook"]).toBe("enabled");
    expect(response.body).toEqual({
      error: "Synthetic Savant provider failure",
      code: "STAGING_PROVIDER_FAILURE",
    });
  });

  it("rejects the failure request when the staging token is invalid", async () => {
    process.env.NODE_ENV = "staging";
    process.env.STAGING_PROVIDER_FAILURE_HOOK_TOKEN = "test-token";
    const response = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; },
      setHeader() { return this; },
      end() { return this; },
    };

    await savantHandler({
      method: "GET",
      query: { endpoint: "expected_statistics", year: "2026" },
      headers: {
        "x-staging-provider-failure": "true",
        "x-staging-provider-failure-token": "wrong-token",
      },
    }, response);

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: "Staging failure hook is not authorized" });
  });
});
