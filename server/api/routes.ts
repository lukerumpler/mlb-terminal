import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

type LegacyHandler = (
  req: Request,
  res: Response
) => unknown | Promise<unknown>;

type ApiModule = { default: LegacyHandler };

function wrapLegacyHandler(handler: LegacyHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function registerLegacyApiRoutes(app: Express) {
  const modules = (await Promise.all([
    // The migrated handlers are intentionally kept as JavaScript to preserve the original source.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./mlb.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./ncaa.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./savant.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./feed.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./news.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./contract.js"),
    // Server-side structured AI comparison summary; credentials stay inside invokeLLM.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./comparison-summary.js"),
    // Natural-language search intent router; credentials stay inside invokeLLM.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./natural-search.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./team-financials.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./team-efficiency.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./fangraphs-models.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./intelligence-calculations.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./playoffstatus-odds.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./cache-health.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./player-advanced.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./player-identity.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./lahman.js"),
    // Read-only MLB warehouse queries; degrades to 503 when no database is configured.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./mlb-warehouse.js"),
  ])) as ApiModule[];

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
    "/api/team-efficiency",
    "/api/fangraphs-models",
    "/api/intelligence-calculations",
    "/api/playoffstatus-odds",
    "/api/cache-health",
    "/api/player-advanced",
    "/api/player-identity",
    "/api/lahman",
    "/api/mlb-warehouse",
  ] as const;
  paths.forEach((path, index) => {
    app.all(path, wrapLegacyHandler(modules[index].default));
  });
}

function clientErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  };
  const status = Number(candidate.status ?? candidate.statusCode);
  // Only 4xx whose message is meant to be shown (http-errors sets expose for 4xx).
  return Number.isInteger(status) &&
    status >= 400 &&
    status < 500 &&
    candidate.expose !== false
    ? status
    : null;
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

  // Client errors raised by middleware (body-parser: 413 entity too large, 400
  // malformed JSON, ...) carry an http-errors status. Report them as what they
  // are instead of a 500 "server error" with a stack trace in the logs.
  const clientStatus = clientErrorStatus(error);
  if (clientStatus) {
    res.status(clientStatus).json({ error: message });
    return;
  }

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
  "/api/team-financials",
  "/api/team-efficiency",
  "/api/playoffstatus-odds",
  "/api/player-advanced",
  "/api/player-identity",
] as const;

void legacyApiPaths;
void legacyApiErrorHandler;
void (legacyApiErrorHandler satisfies ErrorRequestHandler);
void wrapLegacyHandler;
void registerLegacyApiRoutes;
