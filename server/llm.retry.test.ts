import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalForgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;
const originalForgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;

function restoreEnvironmentValue(name: "BUILT_IN_FORGE_API_URL" | "BUILT_IN_FORGE_API_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("LLM retry policy", () => {
  beforeEach(() => {
    process.env.BUILT_IN_FORGE_API_URL = "http://forge.test";
    process.env.BUILT_IN_FORGE_API_KEY = "test-forge-key";
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnvironmentValue("BUILT_IN_FORGE_API_URL", originalForgeApiUrl);
    restoreEnvironmentValue("BUILT_IN_FORGE_API_KEY", originalForgeApiKey);
    vi.resetModules();
  });

  it("does not retry a quota-exhausted 412 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
      statusText: "Precondition Failed",
      headers: { get: () => null },
      text: async () => '{"code":9,"message":"usage exhausted"}',
      body: { cancel: vi.fn() },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await import("./_core/llm");

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "test" }] })
    ).rejects.toThrow(/412 Precondition Failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

export {};
