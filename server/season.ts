/**
 * One definition of "the current MLB season" for the server, so defaults do not
 * silently go stale every January. January still belongs to the previous season
 * (the offseason); the new season starts in February.
 */
export function currentMlbSeason(now: Date = new Date()): number {
  return now.getUTCMonth() === 0
    ? now.getUTCFullYear() - 1
    : now.getUTCFullYear();
}

/** Earliest season the payroll/WAR providers are expected to serve. */
export const EARLIEST_SUPPORTED_SEASON = 2024;

/**
 * A request season is accepted from the earliest supported season up to one past
 * the current one (next season's payroll data appears before opening day).
 */
export function isSupportedSeason(value: unknown, now: Date = new Date()) {
  const season = Number(value);
  return (
    Number.isInteger(season) &&
    season >= EARLIEST_SUPPORTED_SEASON &&
    season <= currentMlbSeason(now) + 1
  );
}

/** First season of the modern era; nothing older is worth an upstream lookup. */
export const EARLIEST_PLAUSIBLE_SEASON = 1901;

/**
 * An integer season from `min` through next season. Handlers that put a season
 * into an upstream URL or a cache key use this so a caller cannot mint unlimited
 * distinct values (`season=-1`, `season=99999999999999999999`, ...). Unlike
 * `isSupportedSeason` it does not assume the payroll providers' 2024 floor.
 */
export function isPlausibleSeason(
  value: unknown,
  {
    min = EARLIEST_PLAUSIBLE_SEASON,
    now = new Date(),
  }: { min?: number; now?: Date } = {}
) {
  const season = typeof value === "number" ? value : Number.NaN;
  return (
    Number.isInteger(season) &&
    season >= min &&
    season <= currentMlbSeason(now) + 1
  );
}
