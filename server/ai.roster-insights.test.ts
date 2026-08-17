import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.mocked(invokeLLM).mockReset();
  });

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
              strengths: [{
                title: "Positive run differential",
                detail: "Team is outscoring opponents.",
                evidence: "Run differential: +18",
              }],
              weaknesses: [],
              source: "Verified test model",
            }),
          },
        },
      ],
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        strengths: [{
          title: "Positive run differential",
          detail: "Team is outscoring opponents.",
          evidence: "Run differential: +18",
        }],
        weaknesses: [],
        source: "Verified test model",
      },
      {
        strengths: [{
          title: "Positive run differential",
          detail: "Team is outscoring opponents.",
          evidence: "Run differential: +18",
        }],
        weaknesses: [],
        source: "Verified test model",
      },
    ]);
    await expect(caller.ai.rosterInsights(input)).resolves.toEqual({
      strengths: [{
        title: "Positive run differential",
        detail: "Team is outscoring opponents.",
        evidence: "Run differential: +18",
      }],
      weaknesses: [],
      source: "Verified test model",
    });
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("uses the verified local fallback when the provider returns schema-valid but empty insight arrays", async () => {
    const llm = vi.mocked(invokeLLM);
    llm.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            strengths: [],
            weaknesses: [],
            source: "Empty test model",
          }),
        },
      }],
    } as never);

    const caller = appRouter.createCaller(context());
    const result = await caller.ai.rosterInsights({
      ...input,
      team: {
        name: "Below Average Test Club",
        pct: 0.4,
        ops: 0.7,
        era: 4.5,
        diff: -20,
      },
    });

    expect(result).toMatchObject({
      source: "Local verified roster fallback",
      fallback: true,
      strengths: [],
    });
    expect(result.weaknesses.map(item => item.title)).toEqual(
      expect.arrayContaining([
        "Negative run differential",
        "Offense needs support",
        "Run prevention is a watch area",
        "Record below .500",
      ])
    );
  });
});
