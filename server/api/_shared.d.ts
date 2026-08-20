import type { Request, Response } from "express";

export function applyCors(req: Request, res: Response): void;
export function isRateLimited(req: Request, bucket?: string): boolean;
export function rateLimitResponse(res: Response): Response;
