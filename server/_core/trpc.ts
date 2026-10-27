import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { isRateLimited } from "../api/_shared.js";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Per-client throttle for tRPC procedures, using the same limiter (and the same
 * client-address rules) as the REST handlers. Pass a function to read limits that
 * come from environment variables at call time.
 */
export function rateLimited(
  bucket: string,
  limits:
    | { max: number; windowMs: number }
    | (() => { max: number; windowMs: number })
) {
  return t.middleware(async ({ ctx, next }) => {
    const resolved = typeof limits === "function" ? limits() : limits;
    if (isRateLimited(ctx.req, bucket, resolved)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please slow down and try again shortly.",
      });
    }
    return next();
  });
}

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
