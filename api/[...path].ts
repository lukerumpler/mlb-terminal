import type { Request, Response } from "express";

type LegacyHandler = (req: Request, res: Response) => unknown | Promise<unknown>;
type LegacyModule = { default: LegacyHandler };

// Keep the Vercel catch-all entry deliberately lightweight. Importing the full
// Express application here also imports OAuth, storage, tRPC, and every legacy
// provider during function initialization. A failure in any optional subsystem
// would otherwise prevent unrelated secondary routes from even starting.
export const legacyHandlerLoaders: Record<string, () => Promise<LegacyModule>> = {
  "/api/ncaa": () => import("../server/api/ncaa.js"),
  "/api/savant": () => import("../server/api/savant.js"),
  "/api/feed": () => import("../server/api/feed.js"),
  "/api/contract": () => import("../server/api/contract.js"),
  "/api/comparison-summary": () => import("../server/api/comparison-summary.js"),
  "/api/natural-search": () => import("../server/api/natural-search.js"),
  "/api/team-financials": () => import("../server/api/team-financials.js"),
  "/api/fangraphs-models": () => import("../server/api/fangraphs-models.js"),
  "/api/intelligence-calculations": () => import("../server/api/intelligence-calculations.js"),
  "/api/playoffstatus-odds": () => import("../server/api/playoffstatus-odds.js"),
  "/api/cache-health": () => import("../server/api/cache-health.js"),
  "/api/player-advanced": () => import("../server/api/player-advanced.js"),
  "/api/player-identity": () => import("../server/api/player-identity.js"),
  "/api/lahman": () => import("../server/api/lahman.js"),
};

export function resolveLegacyHandlerPath(req: Pick<Request, "url">) {
  const pathname = new URL(req.url || "/", "https://vercel.invalid").pathname;
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export default async function handler(req: Request, res: Response) {
  const path = resolveLegacyHandlerPath(req);
  const loadHandler = legacyHandlerLoaders[path];
  if (!loadHandler) return res.status(404).json({ error: `Unknown API route: ${path}` });

  try {
    const module = await loadHandler();
    return await module.default(req, res);
  } catch (error) {
    if (res.headersSent) throw error;
    const message = error instanceof Error ? error.message : "Secondary API handler failed to initialize";
    console.error(`[api-catchall] ${path}`, error);
    return res.status(500).json({ error: message, path });
  }
}
