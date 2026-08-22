import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.test.invalid",
    forgeApiKey: "test-forge-key",
  },
}));

import { invokeLLM } from "./_core/llm";

describe("LLM retry policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "test" }] })
    ).rejects.toThrow(/412 Precondition Failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

export {};
