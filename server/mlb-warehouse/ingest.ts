/**
 * Resumable MLB ingestion: discover games -> fetch each final game's live feed
 * -> parse -> validate -> write atomically. Every game carries its own state,
 * so one failure never restarts a season.
 *
 * Network and storage are injected (FetchJson, WarehouseStore) so the logic
 * here is unit-testable and the same code runs from a script, a cron route, or
 * a backfill.
 */
import { currentMlbSeason } from "../season";
import { PARSER_VERSION, isIngestableStatus, parseGameFeed } from "./parse.js";
import type { ParsedGame } from "./parse.js";
import { validateParsedGame } from "./validate.js";
import type { ValidationIssue } from "./validate.js";

export type FetchJson = (url: string) => Promise<any>;

export interface DiscoveredGame {
  gamePk: number;
  season: number;
  officialDate: string;
}

export interface WorkItem {
  gamePk: number;
  attemptCount: number;
}

export interface StatusSummary {
  pending: number;
  processing: number;
  complete: number;
  failed: number;
}

export interface WarehouseStore {
  /** Create pending state rows for games not yet known. Never downgrades existing rows. */
  registerGames(games: DiscoveredGame[]): Promise<void>;
  /**
   * Games that still need work: pending, failed with attempts remaining, or
   * stuck in "processing" since before `staleBefore` (crash recovery).
   */
  listWork(opts: {
    season: number;
    maxAttempts: number;
    staleBefore: Date;
    limit: number;
  }): Promise<WorkItem[]>;
  /** Re-queue completed games on/after sinceDate so late MLB corrections are picked up. */
  requeueComplete(opts: { season: number; sinceDate: string }): Promise<number>;
  /**
   * Reset failed games (including ones that exhausted maxAttempts) to pending
   * with a fresh attempt budget, so the next run retries them. Returns the count.
   */
  requeueFailed(opts: { season: number }): Promise<number>;
  /**
   * Atomically claim a game for this worker. Returns true only if THIS call
   * moved an eligible row (pending, failed under the attempt budget, or
   * 'processing' but stale) into 'processing'; false means another worker
   * owns it (or it is no longer eligible) and the caller must not ingest it.
   * Defaults: no attempt cap, staleBefore = now - STALE_PROCESSING_MS.
   */
  markProcessing(
    gamePk: number,
    now: Date,
    claim?: ClaimOptions
  ): Promise<boolean>;
  /** Atomically write game, players and pitches (replacing any prior pitches) and mark complete. */
  saveGame(parsed: ParsedGame, now: Date): Promise<void>;
  markFailed(gamePk: number, error: string, now: Date): Promise<void>;
  summary(season: number): Promise<StatusSummary>;
}

export interface ClaimOptions {
  maxAttempts?: number;
  staleBefore?: Date;
}

/** A 'processing' row older than this is presumed to belong to a dead worker. */
export const STALE_PROCESSING_MS = 30 * 60_000;

/** 1876 is the first National League season; allow next year for early schedules. */
export function isValidSeason(season: number, now: Date = new Date()): boolean {
  return (
    Number.isInteger(season) &&
    season >= 1876 &&
    season <= now.getUTCFullYear() + 1
  );
}

const MLB_V1 = "https://statsapi.mlb.com/api/v1";
const MLB_V1_1 = "https://statsapi.mlb.com/api/v1.1";
const REGULAR_AND_POSTSEASON = "R,F,D,L,W";

export const scheduleUrl = (start: string, end: string) =>
  `${MLB_V1}/schedule?sportId=1&gameType=${REGULAR_AND_POSTSEASON}&startDate=${start}&endDate=${end}`;

export const liveFeedUrl = (gamePk: number) =>
  `${MLB_V1_1}/game/${gamePk}/feed/live`;

export interface MlbFetcherOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Total tries per URL, including the first (default 4). */
  attempts?: number;
  timeoutMs?: number;
}

const RETRY_AFTER_CAP_MS = 30_000;

/** 429 and 5xx are the MLB API having a moment; other 4xx are real answers. */
const isTransientStatus = (status: number) => status === 429 || status >= 500;

/**
 * Network implementation: identified UA, hard per-request timeout, and retry
 * with jittered exponential backoff on transient failures (network errors,
 * timeouts, 429, 5xx, truncated bodies). A transient blip should cost a
 * sub-second retry, not one of a game's limited ingestion attempts.
 */
/** A definitive HTTP answer (e.g. 404). Retrying would just repeat it. */
class PermanentHttpError extends Error {}

export function createMlbFetcher(opts: MlbFetcherOptions = {}): FetchJson {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const attempts = Math.max(1, opts.attempts ?? 4);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return async url => {
    let lastError: Error = new Error(`MLB API request failed for ${url}`);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let waitMs = 500 * 2 ** (attempt - 1) * (0.5 + Math.random());
      try {
        const res = await fetchImpl(url, {
          headers: { "User-Agent": "SKIPBaseball/1.0 (data ingestion)" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return await res.json();

        const failure = `MLB API ${res.status} for ${url}`;
        if (!isTransientStatus(res.status))
          throw new PermanentHttpError(failure);
        lastError = new Error(failure);
        const retryAfter = Number(res.headers?.get?.("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          waitMs = Math.max(
            waitMs,
            Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS)
          );
        }
      } catch (err) {
        if (err instanceof PermanentHttpError) throw err;
        // Network error, timeout, or unreadable body: transient.
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < attempts) await sleep(waitMs);
    }
    throw lastError;
  };
}

export const fetchMlbJson: FetchJson = createMlbFetcher();

/**
 * Month windows for a season, optionally clipped to [sinceDate, untilDate]
 * (inclusive, YYYY-MM-DD). A daily job passes a short range so it makes one or
 * two schedule requests instead of ten.
 */
export function monthWindows(
  season: number,
  range: { sinceDate?: string; untilDate?: string } = {}
): Array<[string, string]> {
  const all = baseMonthWindows(season);
  const { sinceDate, untilDate } = range;
  if (!sinceDate && !untilDate) return all;
  const out: Array<[string, string]> = [];
  for (const [start, end] of all) {
    const s = sinceDate && sinceDate > start ? sinceDate : start;
    const e = untilDate && untilDate < end ? untilDate : end;
    if (s <= e) out.push([s, e]);
  }
  return out;
}

/**
 * A final game that has no pitch data (the validator's `no_pitches` rule)
 * usually never will, so callers report it as a known gap instead of paging
 * someone every night. Failed games are still retried up to maxAttempts runs,
 * so a feed that is merely late can heal on its own.
 */
export { currentMlbSeason };

export function isKnownEmptyGameFailure(error: string): boolean {
  return /produced zero pitches/i.test(error);
}

export function splitFailures(failures: Array<{ gamePk: number; error: string }>) {
  return {
    knownEmpty: failures.filter(f => isKnownEmptyGameFailure(f.error)),
    actionable: failures.filter(f => !isKnownEmptyGameFailure(f.error)),
  };
}

function baseMonthWindows(season: number): Array<[string, string]> {
  // Feb (late spring-training-adjacent openers) through Nov (World Series).
  const windows: Array<[string, string]> = [];
  for (let m = 2; m <= 11; m++) {
    const mm = String(m).padStart(2, "0");
    const last = new Date(Date.UTC(season, m, 0)).getUTCDate();
    windows.push([
      `${season}-${mm}-01`,
      `${season}-${mm}-${String(last).padStart(2, "0")}`,
    ]);
  }
  return windows;
}

export interface DiscoveryResult {
  games: DiscoveredGame[];
  skippedNotFinal: number;
  /** One entry per schedule window that failed; discovery continues past them. */
  errors: string[];
}

/** Enumerate a season's games from the schedule, keeping only ones ready to ingest. */
export async function discoverSeasonGames(
  season: number,
  fetchJson: FetchJson,
  range: { sinceDate?: string; untilDate?: string } = {}
): Promise<DiscoveryResult> {
  const byPk = new Map<number, DiscoveredGame>();
  let skippedNotFinal = 0;
  const errors: string[] = [];

  for (const [start, end] of monthWindows(season, range)) {
    let schedule: any;
    try {
      schedule = await fetchJson(scheduleUrl(start, end));
    } catch (err) {
      // One bad month must not stop the other months (or the existing queue)
      // from being processed; it is reported and picked up on the next run.
      errors.push(
        `${start}..${end}: ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    for (const day of schedule?.dates ?? []) {
      for (const g of day?.games ?? []) {
        if (typeof g?.gamePk !== "number") continue;
        if (
          !isIngestableStatus(g.status?.codedGameState, g.status?.detailedState)
        ) {
          skippedNotFinal++;
          continue;
        }
        byPk.set(g.gamePk, {
          gamePk: g.gamePk,
          season,
          officialDate: g.officialDate ?? day.date,
        });
      }
    }
  }
  return { games: Array.from(byPk.values()), skippedNotFinal, errors };
}

export interface GameResult {
  gamePk: number;
  ok: boolean;
  /** Another worker holds this game; nothing was fetched, stored or failed. */
  skipped?: boolean;
  pitchCount?: number;
  warnings: ValidationIssue[];
  error?: string;
}

/** Fetch, parse, validate and store one game. Never throws; failures are recorded. */
export async function ingestGame(
  gamePk: number,
  deps: {
    store: WarehouseStore;
    fetchJson: FetchJson;
    now: () => Date;
    claim?: ClaimOptions;
  }
): Promise<GameResult> {
  const { store, fetchJson, now } = deps;
  let claimed = false;
  try {
    claimed = await store.markProcessing(gamePk, now(), deps.claim);
    if (!claimed) return { gamePk, ok: true, skipped: true, warnings: [] };
    const feed = await fetchJson(liveFeedUrl(gamePk));
    const parsed = parseGameFeed(feed);

    if (parsed.game.gamePk !== gamePk) {
      throw new Error(
        `Feed returned game ${parsed.game.gamePk}, expected ${gamePk}`
      );
    }
    if (
      !isIngestableStatus(parsed.game.statusCode, parsed.game.detailedState)
    ) {
      throw new Error(
        `Game ${gamePk} is not final yet (${parsed.game.detailedState ?? parsed.game.statusCode})`
      );
    }

    const issues = validateParsedGame(parsed);
    const errors = issues.filter(i => i.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map(e => e.message).join("; "));
    }

    await store.saveGame(parsed, now());
    return {
      gamePk,
      ok: true,
      pitchCount: parsed.pitches.length,
      warnings: issues.filter(i => i.severity === "warning"),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If we never owned the game, recording a failure could clobber the
    // worker that does. Leave the row alone; stale recovery covers the rest.
    if (!claimed) return { gamePk, ok: false, warnings: [], error: message };
    try {
      await store.markFailed(gamePk, message.slice(0, 2000), now());
    } catch (markErr) {
      // The store is unhealthy too. The game stays 'processing' and is
      // recovered by the stale-processing rule on a later run.
      const why = markErr instanceof Error ? markErr.message : String(markErr);
      return {
        gamePk,
        ok: false,
        warnings: [],
        error: `${message} (additionally could not record failure: ${why})`,
      };
    }
    return { gamePk, ok: false, warnings: [], error: message };
  }
}

export interface RunOptions {
  season: number;
  /** Max games to process this run (default 200) - keeps a run bounded and resumable. */
  limit?: number;
  /** Games that fail this many times stay failed until manually requeued (default 5). */
  maxAttempts?: number;
  /** Parallel feed fetches (default 3; be polite to the MLB API). */
  concurrency?: number;
  /** Re-ingest completed games from the last N days to absorb MLB corrections. */
  refreshRecentDays?: number;
  /** Skip the schedule call and only work the existing queue. */
  skipDiscovery?: boolean;
  /**
   * Only ask the schedule for the last N days (through today) instead of the
   * whole season. Use for daily jobs; leave unset for a full backfill.
   */
  discoverSinceDays?: number;
}

export interface RunReport {
  season: number;
  discovered: number;
  skippedNotFinal: number;
  /** Schedule windows that could not be fetched this run (retried next run). */
  discoveryErrors: string[];
  requeuedForRefresh: number;
  /** Games another worker claimed first; not counted as attempted or failed. */
  skipped: number;
  attempted: number;
  succeeded: number;
  failed: number;
  failures: Array<{ gamePk: number; error: string }>;
  warnings: Array<{ gamePk: number; issues: ValidationIssue[] }>;
  status: StatusSummary;
  parserVersion: number;
}

export async function runIngestion(
  opts: RunOptions,
  deps: { store: WarehouseStore; fetchJson?: FetchJson; now?: () => Date }
): Promise<RunReport> {
  const store = deps.store;
  const fetchJson = deps.fetchJson ?? fetchMlbJson;
  const now = deps.now ?? (() => new Date());
  const limit = opts.limit ?? 200;
  const maxAttempts = opts.maxAttempts ?? 5;
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  let discovered = 0;
  let skippedNotFinal = 0;
  let discoveryErrors: string[] = [];
  if (!opts.skipDiscovery) {
    const range =
      opts.discoverSinceDays && opts.discoverSinceDays > 0
        ? {
            sinceDate: new Date(
              now().getTime() - opts.discoverSinceDays * 86_400_000
            )
              .toISOString()
              .slice(0, 10),
            untilDate: now().toISOString().slice(0, 10),
          }
        : {};
    const d = await discoverSeasonGames(opts.season, fetchJson, range);
    await store.registerGames(d.games);
    discovered = d.games.length;
    skippedNotFinal = d.skippedNotFinal;
    discoveryErrors = d.errors;
  }

  let requeued = 0;
  if (opts.refreshRecentDays && opts.refreshRecentDays > 0) {
    const since = new Date(
      now().getTime() - opts.refreshRecentDays * 86_400_000
    );
    requeued = await store.requeueComplete({
      season: opts.season,
      sinceDate: since.toISOString().slice(0, 10),
    });
  }

  const staleBefore = new Date(now().getTime() - STALE_PROCESSING_MS);
  const claim: ClaimOptions = { maxAttempts, staleBefore };
  const work = await store.listWork({
    season: opts.season,
    maxAttempts,
    staleBefore,
    limit,
  });

  const results: GameResult[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < work.length) {
      const item = work[cursor++];
      results.push(
        await ingestGame(item.gamePk, { store, fetchJson, now, claim })
      );
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, work.length) }, worker)
  );

  return {
    season: opts.season,
    discovered,
    skippedNotFinal,
    discoveryErrors,
    requeuedForRefresh: requeued,
    skipped: results.filter(r => r.skipped).length,
    attempted: results.filter(r => !r.skipped).length,
    succeeded: results.filter(r => r.ok && !r.skipped).length,
    failed: results.filter(r => !r.ok).length,
    failures: results
      .filter(r => !r.ok)
      .map(r => ({ gamePk: r.gamePk, error: r.error ?? "unknown" })),
    warnings: results
      .filter(r => r.ok && !r.skipped && r.warnings.length > 0)
      .map(r => ({ gamePk: r.gamePk, issues: r.warnings })),
    status: await store.summary(opts.season),
    parserVersion: PARSER_VERSION,
  };
}
