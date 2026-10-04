import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm.ts", () => ({ invokeLLM: vi.fn() }));

import { invokeLLM } from "../_core/llm.ts";
import comparisonSummary, {
  fallbackSummary,
  hasValidComparisonPayload,
  // @ts-expect-error JavaScript handler has no separate declaration file.
} from "./comparison-summary.js";

let nextIp = 0;
function run(body: unknown, method = "POST", ip?: string) {
  const out = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
  };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      out.headers[name] = value;
      return res;
    },
    json(value: unknown) {
      out.body = value;
      return res;
    },
  };
  const req = {
    method,
    body,
    headers: { "x-forwarded-for": ip ?? `198.18.0.${++nextIp}-cmp` },
  };
  return comparisonSummary(req, res).then(() => out);
}

const axes = (
  pcts: Array<number | string | null>,
  names = ["Exit Velo", "Whiff %", "Chase %"]
) => pcts.map((pct, i) => ({ axis: names[i], pct, rawLabel: `raw${i}` }));
const player = (
  name: string,
  pcts: Array<number | string | null>,
  playerType = "hitter"
) => ({
  name,
  position: "OF",
  playerType,
  axes: axes(pcts),
});
const hitters = () => ({
  players: [
    player("Ann Hitter", [90, 40, 70]),
    player("Bob Hitter", [60, 80, 70]),
  ],
});

const llmReply = (payload: unknown) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});

beforeEach(() => {
  vi.mocked(invokeLLM).mockReset();
});

describe("payload validation", () => {
  it("accepts exactly two same-type players with axes", () => {
    expect(hasValidComparisonPayload(hitters())).toBe(true);
    expect(hasValidComparisonPayload({ players: [hitters().players[0]] })).toBe(
      false
    );
    expect(hasValidComparisonPayload({})).toBe(false);
    expect(hasValidComparisonPayload(null)).toBe(false);
    expect(
      hasValidComparisonPayload({
        players: [player("A", [1]), player("B", [1], "pitcher")],
      })
    ).toBe(false);
    expect(
      hasValidComparisonPayload({
        players: [{ name: "", axes: axes([1]) }, player("B", [1])],
      })
    ).toBe(false);
    expect(
      hasValidComparisonPayload({
        players: [{ name: "A", axes: [] }, player("B", [1])],
      })
    ).toBe(false);
  });

  it("rejects non-POST with 405 and bad payloads with 400 before calling the LLM", async () => {
    expect((await run(hitters(), "GET")).statusCode).toBe(405);
    expect((await run({ players: [] })).statusCode).toBe(400);
    expect(invokeLLM).not.toHaveBeenCalled();
  });
});

describe("fallbackSummary (deterministic, no LLM)", () => {
  it("names the largest percentile edge and ranks edges by margin", () => {
    const s = fallbackSummary(
      hitters().players.map((p: any) => ({ ...p, axes: p.axes }))
    );
    // Whiff % is the widest gap (40 points, Bob); Exit Velo is next (30 points, Ann).
    expect(s.headline).toBe("Bob Hitter owns the clearest percentile edge");
    expect(s.edges[0]).toMatchObject({
      axis: "Whiff %",
      leader: "Bob Hitter",
      margin: 40,
    });
    expect(s.edges[1]).toMatchObject({
      axis: "Exit Velo",
      leader: "Ann Hitter",
      margin: 30,
    });
    expect(s.generated).toBe(false);
  });

  it("says profiles are matched when every shared axis is equal", () => {
    const s = fallbackSummary([player("A", [50, 50]), player("B", [50, 50])]);
    expect(s.headline).toBe("The percentile profiles are closely matched");
  });

  it("does not invent a direction when axes are unavailable", () => {
    const s = fallbackSummary([
      player("A", [null, null]),
      player("B", [null, null]),
    ]);
    expect(s.summary).toContain("not contain enough shared percentile values");
    expect(s.edges).toEqual([]);
  });

  it("describes hitters by bat speed but does not say that about pitchers", () => {
    const hitter = fallbackSummary(hitters().players);
    expect(hitter.recommendation).toMatch(/bat speed/);
    const pitcher = fallbackSummary([
      player("Ann Pitcher", [90, 40], "pitcher"),
      player("Bob Pitcher", [60, 80], "pitcher"),
    ]);
    expect(pitcher.recommendation).not.toMatch(/bat speed|contact quality/);
    expect(pitcher.recommendation).toMatch(/Bob Pitcher/);
  });
});

describe("normalization", () => {
  it("clamps percentiles to 0-100, drops non-numeric ones and caps axes at 8", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(new Error("down"));
    const many = Array.from({ length: 12 }, (_, i) => ({
      axis: `m${i}`,
      pct: 150,
    }));
    const res = await run({
      players: [
        {
          name: "A",
          playerType: "hitter",
          axes: [...many, { axis: "x", pct: "junk" }],
        },
        {
          name: "B",
          playerType: "hitter",
          axes: [
            { axis: "m0", pct: -20 },
            { axis: "x", pct: "" },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    // m0: 150 -> 100 vs -20 -> 0 = a margin of 100, so clamping happened.
    expect(res.body.edges[0]).toMatchObject({ axis: "m0", margin: 100 });
    // Only the model-bound payload is capped; check what the LLM would have seen.
    const sent = JSON.parse(
      vi.mocked(invokeLLM).mock.calls[0][0].messages[1].content
    );
    expect(sent.players[0].axes).toHaveLength(8);
  });
});

describe("LLM path", () => {
  it("returns the model summary, truncated, with generated: true", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(
      llmReply({
        headline: "H".repeat(400),
        summary: "S".repeat(900),
        recommendation: "R".repeat(600),
        edges: Array.from({ length: 9 }, (_, i) => ({
          axis: `a${i}`,
          leader: "x",
          margin: 1,
          note: "",
        })),
        caveat: "C".repeat(500),
      })
    );
    const res = await run(hitters());
    expect(res.statusCode).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.headline).toHaveLength(180);
    expect(res.body.summary).toHaveLength(500);
    expect(res.body.recommendation).toHaveLength(300);
    expect(res.body.caveat).toHaveLength(240);
    expect(res.body.edges).toHaveLength(4);
  });

  it("fills missing optional fields from the deterministic fallback", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(
      llmReply({ headline: "h", summary: "s" })
    );
    const res = await run(hitters());
    expect(res.body.generated).toBe(true);
    expect(res.body.recommendation).toMatch(/Ann Hitter|Bob Hitter/);
    expect(res.body.caveat).toMatch(/Savant percentile axes/);
    expect(res.body.edges.length).toBeGreaterThan(0);
  });

  it.each([
    [
      "an error",
      () => vi.mocked(invokeLLM).mockRejectedValue(new Error("boom")),
    ],
    [
      "invalid JSON",
      () =>
        vi.mocked(invokeLLM).mockResolvedValue({
          choices: [{ message: { content: "not json" } }],
        }),
    ],
    [
      "a response missing the headline",
      () => vi.mocked(invokeLLM).mockResolvedValue(llmReply({ summary: "s" })),
    ],
    ["an empty response", () => vi.mocked(invokeLLM).mockResolvedValue({})],
  ])(
    "falls back to the deterministic summary on %s",
    async (_label, arrange) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      arrange();
      const res = await run(hitters());
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        generated: false,
        unavailableReason: "AI summary unavailable",
      });
      expect(res.body.headline).toBeTruthy();
    }
  );
});

describe("cost protection", () => {
  it("throttles one client with 429 before spending more LLM calls", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(
      llmReply({ headline: "h", summary: "s" })
    );
    const results = [];
    for (let i = 0; i < 12; i++)
      results.push(await run(hitters(), "POST", "198.51.100.77"));
    const limitedAt = results.findIndex(r => r.statusCode === 429);
    expect(limitedAt).toBeGreaterThan(0);
    expect(results[limitedAt].headers["Retry-After"]).toBe("10");
    expect(vi.mocked(invokeLLM).mock.calls.length).toBe(limitedAt);
    // A different client is unaffected.
    expect((await run(hitters())).statusCode).toBe(200);
  });
});
