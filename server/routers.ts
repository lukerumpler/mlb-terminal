import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

let aiFallbackUntil = 0;
const AI_ROSTER_INSIGHTS_CACHE_TTL_MS = 30_000;
const aiRosterInsightsCache = new Map<
  string,
  { data: unknown; expiresAt: number }
>();
const aiRosterInsightsInFlight = new Map<string, Promise<unknown>>();
const AI_QUERY_CACHE_TTL_MS = 2 * 60_000;
const AI_QUERY_MAX_CONTEXT_CHARS = 12_000;
type AiQueryResult = {
  answer: string;
  intent: "player_stat" | "team_comparison" | "unavailable";
  metric: string;
  confidence: "verified" | "unavailable";
  error?: string;
};
const aiQueryCache = new Map<string, { data: AiQueryResult; expiresAt: number }>();
const aiQueryInFlight = new Map<string, Promise<AiQueryResult>>();

export function __resetAiQueryCacheForTests() {
  aiQueryCache.clear();
  aiQueryInFlight.clear();
}

function stableContextStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableContextStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableContextStringify(record[key])}`).join(",")}}`;
}

function buildRosterInsightsFallback(input: {
  team?: Record<string, unknown>;
  roster?: {
    hitting?: Array<Record<string, unknown>>;
    pitching?: Array<Record<string, unknown>>;
  };
}) {
  const finiteMetric = (value: unknown) => {
    if (value == null || (typeof value === "string" && value.trim() === ""))
      return NaN;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  };
  const team = input.team || {};
  const strengths: Array<{ title: string; detail: string; evidence: string }> =
    [];
  const weaknesses: Array<{ title: string; detail: string; evidence: string }> =
    [];
  const pct = finiteMetric(team.pct);
  const directRunDiff = finiteMetric(team.diff);
  const runsScored = finiteMetric(team.rs);
  const runsAllowed = finiteMetric(team.ra);
  const runDiff = Number.isFinite(directRunDiff)
    ? directRunDiff
    : Number.isFinite(runsScored) && Number.isFinite(runsAllowed)
      ? runsScored - runsAllowed
      : NaN;
  const ops = finiteMetric(team.ops);
  const era = finiteMetric(team.era);
  if (Number.isFinite(runDiff)) {
    (runDiff >= 0 ? strengths : weaknesses).push({
      title:
        runDiff >= 0
          ? "Positive run differential"
          : "Negative run differential",
      detail:
        runDiff >= 0
          ? "The supplied team totals show more runs scored than allowed."
          : "The supplied team totals show more runs allowed than scored.",
      evidence: `Run differential: ${runDiff > 0 ? "+" : ""}${runDiff}`,
    });
  }
  if (Number.isFinite(ops)) {
    (ops >= 0.72 ? strengths : weaknesses).push({
      title: ops >= 0.72 ? "Offense is producing" : "Offense needs support",
      detail: "This status is derived only from the supplied team OPS value.",
      evidence: `Team OPS: ${ops.toFixed(3)}`,
    });
  }
  if (Number.isFinite(era)) {
    (era <= 4.0 ? strengths : weaknesses).push({
      title:
        era <= 4.0
          ? "Run prevention is controlled"
          : "Run prevention is a watch area",
      detail: "This status is derived only from the supplied team ERA value.",
      evidence: `Team ERA: ${era.toFixed(2)}`,
    });
  }
  if (Number.isFinite(pct)) {
    (pct >= 0.5 ? strengths : weaknesses).push({
      title: pct >= 0.5 ? "Winning record" : "Record below .500",
      detail: "This status is derived only from the supplied standings record.",
      evidence: `Winning percentage: ${pct.toFixed(3)}`,
    });
  }
  if (!strengths.length && !weaknesses.length)
    weaknesses.push({
      title: "Verified roster context is limited",
      detail:
        "No supplied aggregate team metric was available for a safe local summary.",
      evidence: "No verified team-level evidence supplied",
    });
  return {
    strengths,
    weaknesses,
    source: "Local verified roster fallback",
    fallback: true,
  };
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  ai: router({
    rosterInsights: publicProcedure
      .input(
        z.object({
          team: z
            .record(z.string(), z.union([z.string(), z.number(), z.null()]))
            .default({}),
          roster: z.object({
            hitting: z.array(z.record(z.string(), z.unknown())).default([]),
            pitching: z.array(z.record(z.string(), z.unknown())).default([]),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const key = JSON.stringify(input);
        const cached = aiRosterInsightsCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        if (cached) aiRosterInsightsCache.delete(key);
        const existing = aiRosterInsightsInFlight.get(key);
        if (existing) return existing;

        const request = (async () => {
          if (Date.now() < aiFallbackUntil)
            return buildRosterInsightsFallback(input);
          try {
            const response = await invokeLLM({
              model: "gpt-5-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a baseball front-office analyst. Use only the supplied team and roster data. Never invent missing metrics. Return concise, evidence-based strengths and weaknesses for a scouting dashboard.",
                },
                { role: "user", content: JSON.stringify(input) },
              ],
              maxTokens: 700,
              responseFormat: {
                type: "json_schema",
                json_schema: {
                  name: "roster_insights",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      strengths: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            detail: { type: "string" },
                            evidence: { type: "string" },
                          },
                          required: ["title", "detail", "evidence"],
                          additionalProperties: false,
                        },
                      },
                      weaknesses: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            detail: { type: "string" },
                            evidence: { type: "string" },
                          },
                          required: ["title", "detail", "evidence"],
                          additionalProperties: false,
                        },
                      },
                      source: { type: "string" },
                    },
                    required: ["strengths", "weaknesses", "source"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const content = response.choices[0]?.message?.content;
            if (typeof content !== "string")
              throw new Error("AI insights response was empty");
            const parsed = JSON.parse(content);
            const hasStrengths =
              Array.isArray(parsed?.strengths) && parsed.strengths.length > 0;
            const hasWeaknesses =
              Array.isArray(parsed?.weaknesses) && parsed.weaknesses.length > 0;
            if (!hasStrengths && !hasWeaknesses)
              throw new Error("AI insights response had no usable insights");
            return parsed;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (/usage exhausted|412 precondition/i.test(message))
              aiFallbackUntil = Date.now() + 10 * 60_000;
            console.warn(
              "[ai.rosterInsights] AI provider unavailable; returning verified local fallback",
              message
            );
            return buildRosterInsightsFallback(input);
          }
        })();
        aiRosterInsightsInFlight.set(key, request);
        try {
          const result = await request;
          aiRosterInsightsCache.set(key, {
            data: result,
            expiresAt: Date.now() + AI_ROSTER_INSIGHTS_CACHE_TTL_MS,
          });
          if (aiRosterInsightsCache.size > 100)
            aiRosterInsightsCache.delete(
              aiRosterInsightsCache.keys().next().value!
            );
          return result;
        } finally {
          if (aiRosterInsightsInFlight.get(key) === request)
            aiRosterInsightsInFlight.delete(key);
        }
      }),
    query: publicProcedure
      .input(z.object({ query: z.string().trim().min(2).max(240), context: z.record(z.string(), z.unknown()).default({}) }))
      .mutation(async ({ input }) => {
        const serializedContext = stableContextStringify(input.context);
        const unavailable = (error?: unknown): AiQueryResult => ({
          answer: "The AI query service is unavailable. Use the visible filters and tables to inspect verified MLB data.",
          intent: "unavailable",
          metric: "",
          confidence: "unavailable",
          ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
        });
        if (serializedContext.length > AI_QUERY_MAX_CONTEXT_CHARS) return unavailable();
        const key = `${input.query.trim().toLowerCase()}\u0000${serializedContext}`;
        const cached = aiQueryCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        if (cached) aiQueryCache.delete(key);
        const existing = aiQueryInFlight.get(key);
        if (existing) return existing;

        const request = (async (): Promise<AiQueryResult> => {
          try {
            const response = await invokeLLM({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: "You are SKIP, a precise MLB intelligence query interpreter. Use only the supplied context. Never invent a statistic. If the requested value is absent, say it is unavailable. Return a concise answer suitable for a dashboard." },
                { role: "user", content: JSON.stringify(input) },
              ],
              maxTokens: 300,
              responseFormat: {
                type: "json_schema",
                json_schema: {
                  name: "mlb_query_answer",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      answer: { type: "string" },
                      intent: { type: "string", enum: ["player_stat", "team_comparison", "unavailable"] },
                      metric: { type: "string" },
                      confidence: { type: "string", enum: ["verified", "unavailable"] },
                    },
                    required: ["answer", "intent", "metric", "confidence"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const content = response.choices[0]?.message?.content;
            if (typeof content !== "string") throw new Error("MLB query response was empty");
            return JSON.parse(content) as AiQueryResult;
          } catch (error) {
            return unavailable(error);
          }
        })();
        aiQueryInFlight.set(key, request);
        try {
          const result = await request;
          if (result.confidence === "verified") {
            aiQueryCache.set(key, { data: result, expiresAt: Date.now() + AI_QUERY_CACHE_TTL_MS });
            if (aiQueryCache.size > 100) aiQueryCache.delete(aiQueryCache.keys().next().value!);
          }
          return result;
        } finally {
          if (aiQueryInFlight.get(key) === request) aiQueryInFlight.delete(key);
        }
      }),
  }),

  voice: router({
    transcribe: publicProcedure
      .input(z.object({
        audioUrl: z.string(),
        language: z.string().optional(),
        prompt: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio(input);
        if ('error' in result) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
            cause: result,
          });
        }
        return result;
      }),
  }),

  storage: router({
    upload: publicProcedure
      .input(z.object({
        name: z.string(),
        type: z.string(),
        base64: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.base64, 'base64');
          const result = await storagePut(input.name, buffer, input.type);
          return result;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
