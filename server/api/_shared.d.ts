import type { Request, Response } from "express";

export type RateLimitOverrides = { max?: number; windowMs?: number };

export function applyCors(req: Request, res: Response): void;
export function isRateLimited(
  req: Request,
  bucket?: string,
  overrides?: RateLimitOverrides
): boolean;
export function rateLimitResponse(res: Response): Response;
export function clientAddress(req: Pick<Request, "headers" | "socket">): string;
export function llmRateLimit(): { max: number; windowMs: number };
