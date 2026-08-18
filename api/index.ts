import type { Request, Response } from "express";
import { createApp } from "../server/app";

const appPromise = createApp();

export function normalizeServerlessRequestUrl(req: Request) {
  if (!/^https?:\/\//i.test(req.url)) return;
  try {
    const parsed = new URL(req.url);
    req.url = `${parsed.pathname}${parsed.search}`;
  } catch {
    // Retain Express's normal error path for malformed request URLs.
  }
}

export default async function handler(req: Request, res: Response) {
  normalizeServerlessRequestUrl(req);
  const app = await appPromise;
  return app(req, res);
}
