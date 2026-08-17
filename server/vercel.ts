import type { Request, Response } from "express";
import { createApp } from "./app";

const appPromise = createApp();

export function normalizeServerlessRequestUrl(req: Request) {
  const rawUrl = req.url;
  if (!/^https?:\/\//i.test(rawUrl)) return;

  try {
    const parsed = new URL(rawUrl);
    req.url = `${parsed.pathname}${parsed.search}`;
  } catch {
    // Leave malformed values untouched so Express can retain its normal error handling.
  }
}

export default async function handler(req: Request, res: Response) {
  normalizeServerlessRequestUrl(req);
  const app = await appPromise;
  return app(req, res);
}
