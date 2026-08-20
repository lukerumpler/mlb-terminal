import type { Request, Response } from "express";

export default function handler(_req: Request, res: Response) {
  return res.status(200).json({ ok: true, service: "skip-baseball-api" });
}
