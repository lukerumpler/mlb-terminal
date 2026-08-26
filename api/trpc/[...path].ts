import type { Request, Response } from "express";

function isAnonymousAuthMe(req: Request) {
  const url = new URL(req.url, "https://vercel.invalid");
  return url.pathname.endsWith("/auth.me") && !req.headers.cookie;
}

export default async function handler(req: Request, res: Response) {
  if (req.method === "GET" && isAnonymousAuthMe(req)) {
    return res.status(200).json({ result: { data: { json: null } } });
  }

  const { default: trpcApp } = await import("../trpc");
  return trpcApp(req, res);
}
