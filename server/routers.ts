import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";

let aiFallbackUntil = 0;
const AI_ROSTER_INSIGHTS_CACHE_TTL_MS = 30_000;
const aiRosterInsightsCache = new Map<string, { data: unknown; expiresAt: number }>();
const aiRosterInsightsInFlight = new Map<string, Promise<unknown>>();

function buildRosterInsightsFallback(input: { team?: Record<string, unknown>; roster?: { hitting?: Array<Record<string, unknown>>; pitching?: Array<Record<string, unknown>> } }) {
  const team = input.team || {};
  const strengths: Array<{ title: string; detail: string; evidence: string }> = [];
  const weaknesses: Array<{ title: string; detail: string; evidence: string }> = [];
  const pct = Number(team.pct);
  const runDiff = Number(team.diff ?? (Number(team.rs) - Number(team.ra)));
  const ops = Number(team.ops);
  const era = Number(team.era);
  if (Number.isFinite(runDiff)) {
    (runDiff >= 0 ? strengths : weaknesses).push({ title: runDiff >= 0 ? 'Positive run differential' : 'Negative run differential', detail: runDiff >= 0 ? 'The supplied team totals show more runs scored than allowed.' : 'The supplied team totals show more runs allowed than scored.', evidence: `Run differential: ${runDiff > 0 ? '+' : ''}${runDiff}` });
  }
  if (Number.isFinite(ops)) {
    (ops >= 0.720 ? strengths : weaknesses).push({ title: ops >= 0.720 ? 'Offense is producing' : 'Offense needs support', detail: 'This status is derived only from the supplied team OPS value.', evidence: `Team OPS: ${ops.toFixed(3)}` });
  }
  if (Number.isFinite(era)) {
    (era <= 4.00 ? strengths : weaknesses).push({ title: era <= 4.00 ? 'Run prevention is controlled' : 'Run prevention is a watch area', detail: 'This status is derived only from the supplied team ERA value.', evidence: `Team ERA: ${era.toFixed(2)}` });
  }
  if (Number.isFinite(pct)) {
    (pct >= 0.500 ? strengths : weaknesses).push({ title: pct >= 0.500 ? 'Winning record' : 'Record below .500', detail: 'This status is derived only from the supplied standings record.', evidence: `Winning percentage: ${pct.toFixed(3)}` });
  }
  if (!strengths.length && !weaknesses.length) weaknesses.push({ title: 'Verified roster context is limited', detail: 'No supplied aggregate team metric was available for a safe local summary.', evidence: 'No verified team-level evidence supplied' });
  return { strengths, weaknesses, source: 'Local verified roster fallback', fallback: true };
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
      .input(z.object({
        team: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
        roster: z.object({
          hitting: z.array(z.record(z.string(), z.unknown())).default([]),
          pitching: z.array(z.record(z.string(), z.unknown())).default([]),
        }),
      }))
      .mutation(async ({ input }) => {
        const key = JSON.stringify(input);
        const cached = aiRosterInsightsCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
        if (cached) aiRosterInsightsCache.delete(key);
        const existing = aiRosterInsightsInFlight.get(key);
        if (existing) return existing;

        const request = (async () => {
          if (Date.now() < aiFallbackUntil) return buildRosterInsightsFallback(input);
          try {
            const response = await invokeLLM({
              model: 'gpt-5-mini',
              messages: [
                { role: 'system', content: 'You are a baseball front-office analyst. Use only the supplied team and roster data. Never invent missing metrics. Return concise, evidence-based strengths and weaknesses for a scouting dashboard.' },
                { role: 'user', content: JSON.stringify(input) },
              ],
              maxTokens: 700,
              responseFormat: {
                type: 'json_schema',
                json_schema: {
                  name: 'roster_insights',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: {
                      strengths: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, evidence: { type: 'string' } }, required: ['title', 'detail', 'evidence'], additionalProperties: false } },
                      weaknesses: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, evidence: { type: 'string' } }, required: ['title', 'detail', 'evidence'], additionalProperties: false } },
                      source: { type: 'string' },
                    },
                    required: ['strengths', 'weaknesses', 'source'],
                    additionalProperties: false,
                  },
                },
              },
            });
            const content = response.choices[0]?.message?.content;
            if (typeof content !== 'string') throw new Error('AI insights response was empty');
            return JSON.parse(content);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/usage exhausted|412 precondition/i.test(message)) aiFallbackUntil = Date.now() + 10 * 60_000;
            console.warn('[ai.rosterInsights] AI provider unavailable; returning verified local fallback', message);
            return buildRosterInsightsFallback(input);
          }
        })();
        aiRosterInsightsInFlight.set(key, request);
        try {
          const result = await request;
          aiRosterInsightsCache.set(key, { data: result, expiresAt: Date.now() + AI_ROSTER_INSIGHTS_CACHE_TTL_MS });
          if (aiRosterInsightsCache.size > 100) aiRosterInsightsCache.delete(aiRosterInsightsCache.keys().next().value!);
          return result;
        } finally {
          if (aiRosterInsightsInFlight.get(key) === request) aiRosterInsightsInFlight.delete(key);
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
