import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

const { appRouter } = await import("./routers");
const { invokeLLM } = await import("./_core/llm");

function context(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const input = {
  team: {
    name: "Verified Test Club",
    pct: 0.55,
    ops: 0.745,
    era: 3.82,
    diff: 18,
  },
  roster: {
    hitting: [{ id: 1, plateAppearances: 100 }],
    pitching: [{ id: 2, inningsPitched: 80 }],
  },
};

describe("ai.rosterInsights request protection", () => {
  it("coalesces identical in-flight requests and caches the verified response", async () => {
    let resolveRequest!: (value: unknown) => void;
    const llm = vi.mocked(invokeLLM);
    llm.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve;
        }) as never
    );

    const caller = appRouter.createCaller(context());
    const first = caller.ai.rosterInsights(input);
    const second = caller.ai.rosterInsights(input);
    await vi.waitFor(() => expect(llm).toHaveBeenCalledTimes(1));
    resolveRequest({
      choices: [
        {
          message: {
            content: JSON.stringify({
              strengths: [],
              weaknesses: [],
              source: "Verified test model",
            }),
          },
        },
      ],
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { strengths: [], weaknesses: [], source: "Verified test model" },
      { strengths: [], weaknesses: [], source: "Verified test model" },
    ]);
    await expect(caller.ai.rosterInsights(input)).resolves.toEqual({
      strengths: [],
      weaknesses: [],
      source: "Verified test model",
    });
    expect(llm).toHaveBeenCalledTimes(1);
  });
});
