import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";

describe("LLM retry policy", () => {
  const originalForgeApiKey = ENV.forgeApiKey;

  afterEach(() => {
    ENV.forgeApiKey = originalForgeApiKey;
    vi.unstubAllGlobals();
  });

  it("does not retry a quota-exhausted 412 response", async () => {
    ENV.forgeApiKey = "test-forge-api-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
      statusText: "Precondition Failed",
      headers: { get: () => null },
      text: async () => '{"code":9,"message":"usage exhausted"}',
      body: { cancel: vi.fn() },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "test" }] })
    ).rejects.toThrow(/412 Precondition Failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

export {};
