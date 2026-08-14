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
    import("./contract.js"),
    // Server-side structured AI comparison summary; credentials stay inside invokeLLM.
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./comparison-summary.js"),
    // @ts-expect-error JavaScript handler has no separate declaration file.
    import("./team-financials.js"),
  ])) as ApiModule[];

  const paths = [
    "/api/mlb",
    "/api/ncaa",
    "/api/savant",
    "/api/feed",
    "/api/contract",
    "/api/comparison-summary",
    "/api/team-financials",
  ] as const;
  paths.forEach((path, index) => {
    app.all(path, wrapLegacyHandler(modules[index].default));
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
  "/api/contract",
  "/api/comparison-summary",
] as const;

void legacyApiPaths;
void legacyApiErrorHandler;
void (legacyApiErrorHandler satisfies ErrorRequestHandler);
void wrapLegacyHandler;
void registerLegacyApiRoutes;
