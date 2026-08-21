import type { Request, Response } from "express";

export function isAnonymousAuthMe(req: Request & { originalUrl?: string }) {
  const rawUrls = [req.url, req.originalUrl, req.headers["x-invoke-path"]].filter(Boolean);
  const isAuthMe = rawUrls.some(rawUrl => {
    try { return new URL(rawUrl, "https://vercel.invalid").pathname.endsWith("/auth.me"); } catch { return String(rawUrl).endsWith("/auth.me"); }
  });
  return isAuthMe && !req.headers.cookie;
}

export default async function handler(req: Request, res: Response) {
  if (req.method === "GET" && isAnonymousAuthMe(req)) {
    return res.status(200).json({ result: { data: { json: null } } });
  }

  const { default: trpcApp } = await import("../trpc");
  return trpcApp(req, res);
}
