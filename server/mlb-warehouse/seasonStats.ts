/**
 * Daily season-stat snapshots: fetch the MLB Stats API season line for every
 * player, normalize it (true 0 stays 0, absent stays NULL), and upsert one row
 * per player/group/team/UTC day. Network and storage are injected, exactly like
 * ingest.ts, so the same code runs from the cron route or a script.
 *
 * Policy (change deliberately, tests pin it):
 *  - snapshot_date is the UTC day of `now` (matches daily-provider-policy).
 *  - A rerun on the same day REPLACES that day's row (latest observation wins);
 *    earlier days are never touched.
 *  - team_id 0 is the provider's all-teams total; real team ids are splits.
 *    Rows are stored as the provider sent them and never summed here.
 *  - A group whose fetch fails (or returns nothing) writes nothing and is
 *    reported as failed; the run is not "ok".
 */
export type FetchJson = (url: string) => Promise<any>;

export type StatGroup = "hitting" | "pitching";
export const SNAPSHOT_SOURCE = "mlb-stats-api";
export const DEFINITION_VERSION = 1;
export const ALL_TEAMS = 0;

type Kind = "int" | "rate" | "outs";
export interface FieldSpec {
  /** Property name on mlbSeasonStatSnapshots. */
  column: string;
  /** Key in the provider's `stat` object. */
  api: string;
  kind: Kind;
}

const f = (column: string, api: string, kind: Kind = "int"): FieldSpec => ({
  column,
  api,
  kind,
});

export const HITTING_FIELDS: FieldSpec[] = [
  f("games", "gamesPlayed"),
  f("plateAppearances", "plateAppearances"),
  f("atBats", "atBats"),
  f("runs", "runs"),
  f("hits", "hits"),
  f("doubles", "doubles"),
  f("triples", "triples"),
  f("homeRuns", "homeRuns"),
  f("rbi", "rbi"),
  f("walks", "baseOnBalls"),
  f("intentionalWalks", "intentionalWalks"),
  f("strikeOuts", "strikeOuts"),
  f("stolenBases", "stolenBases"),
  f("caughtStealing", "caughtStealing"),
  f("hitByPitch", "hitByPitch"),
  f("sacFlies", "sacFlies"),
  f("sacBunts", "sacBunts"),
  f("groundIntoDoublePlay", "groundIntoDoublePlay"),
  f("totalBases", "totalBases"),
  f("avg", "avg", "rate"),
  f("obp", "obp", "rate"),
  f("slg", "slg", "rate"),
  f("ops", "ops", "rate"),
];

export const PITCHING_FIELDS: FieldSpec[] = [
  f("games", "gamesPlayed"),
  f("gamesStarted", "gamesStarted"),
  f("wins", "wins"),
  f("losses", "losses"),
  f("outsPitched", "inningsPitched", "outs"),
  f("hitsAllowed", "hits"),
  f("earnedRuns", "earnedRuns"),
  f("homeRunsAllowed", "homeRuns"),
  f("walksAllowed", "baseOnBalls"),
  f("strikeOutsPitched", "strikeOuts"),
  f("battersFaced", "battersFaced"),
  f("wildPitches", "wildPitches"),
  f("balks", "balks"),
  f("saves", "saves"),
  f("holds", "holds"),
  f("blownSaves", "blownSaves"),
  f("qualityStarts", "qualityStarts"),
  f("inheritedRunners", "inheritedRunners"),
  f("inheritedRunnersScored", "inheritedRunnersScored"),
  f("era", "era", "rate"),
  f("whip", "whip", "rate"),
];

export const FIELDS: Record<StatGroup, FieldSpec[]> = {
  hitting: HITTING_FIELDS,
  pitching: PITCHING_FIELDS,
};

/**
 * Provider keys NOT yet confirmed against a live response (the brief's
 * Section 11). The first real run's `emptyColumns` is how you find the wrong
 * ones; fix the `api` name above and the raw_stat column lets you backfill.
 */
export const UNCONFIRMED_API_FIELDS = [
  "intentionalWalks",
  "sacFlies",
  "sacBunts",
  "groundIntoDoublePlay",
  "battersFaced",
  "wildPitches",
  "balks",
  "holds",
  "blownSaves",
  "qualityStarts",
  "inheritedRunners",
  "inheritedRunnersScored",
];

const MLB_V1 = "https://statsapi.mlb.com/api/v1";
export const seasonStatsUrl = (
  season: number,
  group: StatGroup,
  offset: number,
  limit: number
) =>
  `${MLB_V1}/stats?stats=season&group=${group}&season=${season}&sportIds=1&playerPool=ALL&limit=${limit}&offset=${offset}`;

/** Absent/blank/unparseable -> null. A real 0 (or "0") stays 0. */
export function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** ".281" -> 0.281; placeholders like "-.--", ".---", "inf" -> null. */
export function toRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** "180.2" -> 542 outs. Fractions other than .0/.1/.2 are invalid -> null. */
export function inningsToOuts(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const m = /^(\d+)(?:\.([012]))?$/.exec(String(value).trim());
  if (!m) return null;
  return Number(m[1]) * 3 + Number(m[2] ?? 0);
}

const convert = (kind: Kind, v: unknown) =>
  kind === "rate" ? toRate(v) : kind === "outs" ? inningsToOuts(v) : toInt(v);

export interface SeasonStatSnapshotRow {
  playerId: number;
  season: number;
  statGroup: StatGroup;
  teamId: number;
  snapshotDate: string;
  source: string;
  ingestedAt: Date;
  sourceUpdatedAt: Date | null;
  definitionVersion: number;
  numTeams: number | null;
  rawStat: string | null;
  [column: string]: string | number | Date | null;
}

export const snapshotKey = (r: SeasonStatSnapshotRow) =>
  [r.playerId, r.season, r.statGroup, r.teamId, r.snapshotDate, r.source].join(
    "|"
  );

export const snapshotDateUtc = (now: Date) => now.toISOString().slice(0, 10);

/** One provider split -> one row, or null when it has no player id. */
export function normalizeSplit(
  split: any,
  group: StatGroup,
  ctx: { season: number; snapshotDate: string; ingestedAt: Date }
): SeasonStatSnapshotRow | null {
  const playerId = toInt(split?.player?.id);
  if (playerId === null || playerId <= 0) return null;
  const stat = split?.stat && typeof split.stat === "object" ? split.stat : {};
  const row: SeasonStatSnapshotRow = {
    playerId,
    season: ctx.season,
    statGroup: group,
    teamId: toInt(split?.team?.id) ?? ALL_TEAMS,
    snapshotDate: ctx.snapshotDate,
    source: SNAPSHOT_SOURCE,
    ingestedAt: ctx.ingestedAt,
    sourceUpdatedAt: null,
    definitionVersion: DEFINITION_VERSION,
    numTeams: toInt(split?.numTeams),
    rawStat: JSON.stringify(stat),
  };
  // Every column of the table gets a value so a re-upsert can null a field the
  // provider stopped sending instead of leaving a stale number behind.
  for (const spec of [...HITTING_FIELDS, ...PITCHING_FIELDS])
    row[spec.column] = null;
  for (const spec of FIELDS[group])
    row[spec.column] = convert(spec.kind, stat[spec.api]);
  return row;
}

export interface UpsertResult {
  inserted: number | null;
  updated: number | null;
}
export interface SeasonStatStore {
  upsertSnapshots(rows: SeasonStatSnapshotRow[]): Promise<UpsertResult>;
}

export interface SnapshotRunOptions {
  season: number;
  now?: Date;
  pageSize?: number;
  maxPages?: number;
  groups?: StatGroup[];
}

export interface GroupReport {
  group: StatGroup;
  pages: number;
  fetched: number;
  rows: number;
  skippedNoPlayer: number;
  duplicatesCollapsed: number;
  inserted: number | null;
  updated: number | null;
  /** Columns of this group that were NULL on every row (wrong API key?). */
  emptyColumns: string[];
  error: string | null;
}

export interface SnapshotReport {
  season: number;
  snapshotDate: string;
  /** True only when every group fetched, was non-empty, and was stored. */
  ok: boolean;
  groups: GroupReport[];
  definitionVersion: number;
}

async function fetchGroup(
  fetchJson: FetchJson,
  season: number,
  group: StatGroup,
  pageSize: number,
  maxPages: number
) {
  const splits: any[] = [];
  let pages = 0;
  for (let offset = 0; ; offset += pageSize) {
    if (pages >= maxPages)
      throw new Error(`pagination-limit (${maxPages} pages)`);
    const data = await fetchJson(
      seasonStatsUrl(season, group, offset, pageSize)
    );
    pages++;
    if (!Array.isArray(data?.stats)) throw new Error("unexpected-structure");
    const page = data.stats[0]?.splits ?? [];
    if (!Array.isArray(page)) throw new Error("unexpected-structure");
    splits.push(...page);
    if (page.length < pageSize) break;
  }
  return { splits, pages };
}

export async function runSnapshot(
  opts: SnapshotRunOptions,
  deps: { fetchJson: FetchJson; store: SeasonStatStore }
): Promise<SnapshotReport> {
  const now = opts.now ?? new Date();
  const snapshotDate = snapshotDateUtc(now);
  const pageSize = opts.pageSize ?? 2000;
  const maxPages = opts.maxPages ?? 20;
  const groups: GroupReport[] = [];

  for (const group of opts.groups ?? (["hitting", "pitching"] as StatGroup[])) {
    const g: GroupReport = {
      group,
      pages: 0,
      fetched: 0,
      rows: 0,
      skippedNoPlayer: 0,
      duplicatesCollapsed: 0,
      inserted: null,
      updated: null,
      emptyColumns: [],
      error: null,
    };
    groups.push(g);
    try {
      const { splits, pages } = await fetchGroup(
        deps.fetchJson,
        opts.season,
        group,
        pageSize,
        maxPages
      );
      g.pages = pages;
      g.fetched = splits.length;
      const byKey = new Map<string, SeasonStatSnapshotRow>();
      for (const split of splits) {
        const row = normalizeSplit(split, group, {
          season: opts.season,
          snapshotDate,
          ingestedAt: now,
        });
        if (!row) {
          g.skippedNoPlayer++;
          continue;
        }
        const key = snapshotKey(row);
        if (byKey.has(key)) g.duplicatesCollapsed++;
        byKey.set(key, row);
      }
      const rows = Array.from(byKey.values());
      g.rows = rows.length;
      if (rows.length === 0) throw new Error("empty-response");
      g.emptyColumns = FIELDS[group]
        .map(s => s.column)
        .filter(c => c !== "games" && rows.every(r => r[c] === null));
      const result = await deps.store.upsertSnapshots(rows);
      g.inserted = result.inserted;
      g.updated = result.updated;
    } catch (err) {
      g.error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    season: opts.season,
    snapshotDate,
    ok: groups.length > 0 && groups.every(g => g.error === null),
    groups,
    definitionVersion: DEFINITION_VERSION,
  };
}
