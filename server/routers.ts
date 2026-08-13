import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { z } from "zod";

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
