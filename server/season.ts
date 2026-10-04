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
