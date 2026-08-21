import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

// Vercel packages each serverless entry independently. These imports stay
// static so every legacy handler is included in api/[...path]'s artifact
// instead of being resolved dynamically during function initialization.
// @ts-expect-error JavaScript handler has no separate declaration file.
import mlbHandler from "./mlb.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import ncaaHandler from "./ncaa.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import savantHandler from "./savant.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import feedHandler from "./feed.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import newsHandler from "./news.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import contractHandler from "./contract.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import comparisonSummaryHandler from "./comparison-summary.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import naturalSearchHandler from "./natural-search.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import teamFinancialsHandler from "./team-financials.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import fangraphsModelsHandler from "./fangraphs-models.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import intelligenceCalculationsHandler from "./intelligence-calculations.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import playoffStatusOddsHandler from "./playoffstatus-odds.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import cacheHealthHandler from "./cache-health.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import playerAdvancedHandler from "./player-advanced.js";
// @ts-expect-error JavaScript handler has no separate declaration file.
import playerIdentityHandler from "./player-identity.js";

type LegacyHandler = (
  req: Request,
  res: Response
) => unknown | Promise<unknown>;

type ApiModule = { default: LegacyHandler };

const legacyModules: ApiModule[] = [
  { default: mlbHandler },
  { default: ncaaHandler },
  { default: savantHandler },
  { default: feedHandler },
  { default: newsHandler },
  { default: contractHandler },
  { default: comparisonSummaryHandler },
  { default: naturalSearchHandler },
  { default: teamFinancialsHandler },
  { default: fangraphsModelsHandler },
  { default: intelligenceCalculationsHandler },
  { default: playoffStatusOddsHandler },
  { default: cacheHealthHandler },
  { default: playerAdvancedHandler },
  { default: playerIdentityHandler },
];

function wrapLegacyHandler(handler: LegacyHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function registerLegacyApiRoutes(app: Express) {
  const paths = [
    "/api/mlb",
    "/api/ncaa",
    "/api/savant",
    "/api/feed",
    "/api/news",
    "/api/contract",
    "/api/comparison-summary",
    "/api/natural-search",
    "/api/team-financials",
    "/api/fangraphs-models",
    "/api/intelligence-calculations",
    "/api/playoffstatus-odds",
    "/api/cache-health",
    "/api/player-advanced",
    "/api/player-identity",
  ] as const;
  paths.forEach((path, index) => {
    app.all(path, wrapLegacyHandler(legacyModules[index].default));
  });
}

export const legacyApiErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const message =
    error instanceof Error ? error.message : "Unexpected API proxy error";
  console.error("[legacy-api]", error);
  res.status(500).json({ error: message });
};

export const legacyApiPaths = [
  "/api/mlb",
  "/api/ncaa",
  "/api/savant",
  "/api/feed",
  "/api/news",
  "/api/contract",
  "/api/comparison-summary",
  "/api/natural-search",
  "/api/playoffstatus-odds",
  "/api/player-advanced",
  "/api/player-identity",
] as const;

void legacyApiPaths;
void legacyApiErrorHandler;
void (legacyApiErrorHandler satisfies ErrorRequestHandler);
void wrapLegacyHandler;
void registerLegacyApiRoutes;
