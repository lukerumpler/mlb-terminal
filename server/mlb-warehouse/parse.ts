/**
 * Pure transformation of an MLB Stats API GUMBO live feed
 * (/api/v1.1/game/{gamePk}/feed/live) into warehouse rows.
 *
 * No network and no database access lives here, so it can be tested against
 * real feed payloads and re-run ("reprocessed") over stored source data.
 *
 * Design rules carried over from the data-layer plan:
 *  - MLB ids are identity; names are display only.
 *  - Missing source values stay null. Nothing is defaulted to 0.
 *  - Only events flagged isPitch === true become pitch rows.
 */
import type {
  InsertMlbGame,
  InsertMlbPitch,
  InsertMlbPlateAppearance,
  InsertMlbPlayer,
} from "../../drizzle/schema.js";
import { toSkipPitchType } from "./pitchTaxonomy.js";

/**
 * Bump when parsing logic changes so stored rows can be selectively reprocessed.
 * 2: adds plate-appearance rows (base-out state, runs). Games stored under
 * version 1 have none until they are ingested again.
 */
export const PARSER_VERSION = 2;

type Json = Record<string, any>;

export interface ParsedGame {
  game: InsertMlbGame;
  players: InsertMlbPlayer[];
  pitches: InsertMlbPitch[];
  plateAppearances: InsertMlbPlateAppearance[];
}

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

/** Number or null. Rejects NaN and non-numeric strings instead of coercing to 0. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.trunc(n);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** matchup.postOnFirst / postOnSecond / postOnThird, present only while occupied. */
const POST_BASE_BITS: Array<[string, number]> = [
  ["postOnFirst", 1],
  ["postOnSecond", 2],
  ["postOnThird", 4],
];

/** Bitmask of occupied bases after a play (1 = 1B, 2 = 2B, 4 = 3B), or null with no matchup. */
export function basesAfterFromMatchup(matchup: unknown): number | null {
  if (!matchup || typeof matchup !== "object") return null;
  let mask = 0;
  for (const [key, bit] of POST_BASE_BITS) {
    if ((matchup as Json)[key] != null) mask |= bit;
  }
  return mask;
}

export function countBases(mask: number): number {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
}

/** Game is ready to ingest once MLB marks it Final (F) or Game Over (O). */
export function isIngestableStatus(
  codedGameState: unknown,
  detailedState: unknown
): boolean {
  const code = typeof codedGameState === "string" ? codedGameState : "";
  const detail =
    typeof detailedState === "string" ? detailedState.toLowerCase() : "";
  if (code !== "F" && code !== "O") return false;
  // Postponed/cancelled/suspended games must never be mistaken for played games.
  return !/postpon|cancel|suspend/.test(detail);
}

export function parseGameFeed(feed: Json): ParsedGame {
  const gameData = feed?.gameData;
  const allPlays = feed?.liveData?.plays?.allPlays;
  if (!gameData || !Array.isArray(allPlays)) {
    throw new FeedParseError(
      "Feed is missing gameData or liveData.plays.allPlays"
    );
  }

  const gamePk = int(gameData.game?.pk ?? feed.gamePk);
  const season = int(gameData.game?.season);
  const gameType = str(gameData.game?.type);
  const officialDate =
    str(gameData.datetime?.officialDate) ??
    str(gameData.datetime?.originalDate);
  const home = gameData.teams?.home;
  const away = gameData.teams?.away;

  if (gamePk === null) throw new FeedParseError("Feed has no gamePk");
  if (season === null || !gameType || !officialDate) {
    throw new FeedParseError(`Game ${gamePk}: missing season, type or date`);
  }
  if (!home?.id || !away?.id) {
    throw new FeedParseError(`Game ${gamePk}: missing home or away team`);
  }

  const linescore = feed.liveData?.linescore?.teams;

  const game: InsertMlbGame = {
    gamePk,
    season,
    gameType,
    officialDate,
    startTime: parseDate(gameData.datetime?.dateTime),
    dayNight: str(gameData.datetime?.dayNight),
    doubleHeader: str(gameData.game?.doubleHeader),
    gameNumber: int(gameData.game?.gameNumber),
    statusCode: str(gameData.status?.codedGameState),
    detailedState: str(gameData.status?.detailedState),
    homeTeamId: home.id,
    homeTeamName: String(home.name),
    homeTeamAbbr: str(home.abbreviation),
    awayTeamId: away.id,
    awayTeamName: String(away.name),
    awayTeamAbbr: str(away.abbreviation),
    venueId: int(gameData.venue?.id),
    venueName: str(gameData.venue?.name),
    weatherCondition: str(gameData.weather?.condition),
    weatherTemp: int(gameData.weather?.temp),
    weatherWind: str(gameData.weather?.wind),
    homeScore: int(linescore?.home?.runs),
    awayScore: int(linescore?.away?.runs),
    parserVersion: PARSER_VERSION,
  };

  // Only players who actually appear in this game's plays are kept.
  const involved = new Set<number>();
  const pitches: InsertMlbPitch[] = [];
  const plateAppearances: InsertMlbPlateAppearance[] = [];

  // Running state between plays. A half-inning starts with no outs and, unless
  // the first play shows otherwise, empty bases. Scores carry across the game.
  let lastHalfKey: string | null = null;
  let outsPrev: number | null = 0;
  let basesPrev: number | null = 0;
  let awayScorePrev: number | null = 0;
  let homeScorePrev: number | null = 0;

  for (const play of allPlays) {
    const atBatIndex = int(play?.about?.atBatIndex ?? play?.atBatIndex);
    const inning = int(play?.about?.inning);
    const halfInning = str(play?.about?.halfInning);
    const batterId = int(play?.matchup?.batter?.id);
    const pitcherId = int(play?.matchup?.pitcher?.id);
    if (atBatIndex === null || inning === null || !halfInning) continue;
    if (batterId === null || pitcherId === null) continue;
    involved.add(batterId);
    involved.add(pitcherId);

    // ---- plate-appearance row: base-out state and runs -------------------
    const halfKey = `${inning}:${halfInning}`;
    if (halfKey !== lastHalfKey) {
      lastHalfKey = halfKey;
      outsPrev = 0;
      basesPrev = 0;
    }
    const isTop = halfInning === "top";
    const outsAfter = int(play.count?.outs);
    const basesAfter = basesAfterFromMatchup(play.matchup);
    const awayScoreAfter = int(play.result?.awayScore);
    const homeScoreAfter = int(play.result?.homeScore);

    let outsBefore: number | null = outsPrev;
    if (outsBefore === null || outsAfter === null || outsAfter < outsBefore) {
      outsBefore = null;
    }
    const outsOnPlay =
      outsBefore !== null && outsAfter !== null ? outsAfter - outsBefore : null;

    // Runs are the change in the batting team's score. If the fielding team's
    // score also moved, the scores are inconsistent and runs stay unknown.
    const batBefore = isTop ? awayScorePrev : homeScorePrev;
    const batAfter = isTop ? awayScoreAfter : homeScoreAfter;
    const fieldBefore = isTop ? homeScorePrev : awayScorePrev;
    const fieldAfter = isTop ? homeScoreAfter : awayScoreAfter;
    const runsOnPlay =
      batBefore !== null &&
      batAfter !== null &&
      fieldBefore !== null &&
      fieldAfter !== null &&
      batAfter >= batBefore &&
      fieldAfter === fieldBefore
        ? batAfter - batBefore
        : null;

    // The bases before the play are the previous play's bases after. They are
    // kept only if they reconcile with what happened: runners before, plus the
    // batter if he stayed on or was put out, equals runners after plus runs
    // plus outs. This catches the extra-inning runner, who is on base but is
    // not in any earlier play. Anything that does not reconcile stays NULL.
    // The third out is exempt: the inning ends, the feed clears the bases, and
    // the runners left on base are not in the "after" state.
    let basesBefore: number | null = basesPrev;
    if (
      basesBefore === null ||
      basesAfter === null ||
      outsOnPlay === null ||
      runsOnPlay === null
    ) {
      basesBefore = null;
    } else if (outsAfter !== 3) {
      const reconciles = [0, 1].some(
        batter =>
          countBases(basesBefore as number) +
            batter -
            runsOnPlay -
            outsOnPlay ===
          countBases(basesAfter)
      );
      if (!reconciles) basesBefore = null;
    }

    // Earned runs are the scoring runners the feed flags as earned. They are
    // used only when the number of scoring runners equals the score change.
    const runners: Json[] = Array.isArray(play.runners) ? play.runners : [];
    const scorers = runners.filter(r => r?.movement?.end === "score");
    const earnedKnown = scorers.every(
      r => typeof r?.details?.earned === "boolean"
    );
    const earnedRunsOnPlay =
      runsOnPlay !== null && scorers.length === runsOnPlay && earnedKnown
        ? scorers.filter(r => r.details.earned === true).length
        : null;

    plateAppearances.push({
      gamePk,
      atBatIndex,
      season,
      officialDate,
      inning,
      halfInning,
      battingTeamId: isTop ? away.id : home.id,
      batterId,
      pitcherId,
      paEvent: str(play.result?.event),
      paEventType: str(play.result?.eventType),
      isComplete: bool(play.about?.isComplete),
      outsBefore,
      outsAfter,
      basesBefore,
      basesAfter,
      runsOnPlay,
      earnedRunsOnPlay,
    });

    outsPrev = outsAfter;
    basesPrev = basesAfter;
    awayScorePrev = awayScoreAfter;
    homeScorePrev = homeScoreAfter;
    // ---------------------------------------------------------------------

    const events: Json[] = Array.isArray(play.playEvents)
      ? play.playEvents
      : [];

    // The count on each pitch event is the count AFTER that pitch; the count
    // before is the previous pitch's "after" (0-0 for the first pitch).
    let ballsBefore = 0;
    let strikesBefore = 0;

    events.forEach((event, arrayIndex) => {
      if (event?.isPitch !== true) return;

      const details = event.details ?? {};
      const pitchData = event.pitchData ?? {};
      const coords = pitchData.coordinates ?? {};
      const breaks = pitchData.breaks ?? {};
      const count = event.count ?? {};
      const hit = event.hitData ?? {};
      const typeCode = str(details.type?.code);

      const ballsAfter = int(count.balls);
      const strikesAfter = int(count.strikes);

      pitches.push({
        gamePk,
        atBatIndex,
        eventIndex: int(event.index) ?? arrayIndex,
        season,
        officialDate,
        inning,
        halfInning,
        pitchNumber: int(event.pitchNumber),
        batterId,
        pitcherId,
        batSide: str(play.matchup?.batSide?.code),
        pitchHand: str(play.matchup?.pitchHand?.code),
        outs: int(count.outs),
        ballsBefore,
        strikesBefore,
        ballsAfter,
        strikesAfter,
        sourcePitchTypeCode: typeCode,
        sourcePitchTypeName: str(details.type?.description),
        skipPitchType: toSkipPitchType(typeCode),
        callCode: str(details.call?.code ?? details.code),
        callDescription: str(details.description),
        isInPlay: bool(details.isInPlay),
        isStrike: bool(details.isStrike),
        isBall: bool(details.isBall),
        paEvent: str(play.result?.event),
        paEventType: str(play.result?.eventType),
        startSpeed: num(pitchData.startSpeed),
        endSpeed: num(pitchData.endSpeed),
        zone: int(pitchData.zone),
        strikeZoneTop: num(pitchData.strikeZoneTop),
        strikeZoneBottom: num(pitchData.strikeZoneBottom),
        spinRate: num(breaks.spinRate ?? pitchData.spinRate),
        spinDirection: num(breaks.spinDirection ?? pitchData.spinDirection),
        extension: num(pitchData.extension),
        plateTime: num(pitchData.plateTime),
        breakAngle: num(breaks.breakAngle),
        breakLength: num(breaks.breakLength),
        breakVertical: num(breaks.breakVertical),
        breakVerticalInduced: num(breaks.breakVerticalInduced),
        breakHorizontal: num(breaks.breakHorizontal),
        pfxX: num(coords.pfxX),
        pfxZ: num(coords.pfxZ),
        plateX: num(coords.pX),
        plateZ: num(coords.pZ),
        releaseX: num(coords.x0),
        releaseY: num(coords.y0),
        releaseZ: num(coords.z0),
        vx0: num(coords.vX0),
        vy0: num(coords.vY0),
        vz0: num(coords.vZ0),
        ax: num(coords.aX),
        ay: num(coords.aY),
        az: num(coords.aZ),
        coordX: num(coords.x),
        coordY: num(coords.y),
        launchSpeed: num(hit.launchSpeed),
        launchAngle: num(hit.launchAngle),
        totalDistance: num(hit.totalDistance),
        playId: str(event.playId),
      });

      if (ballsAfter !== null) ballsBefore = ballsAfter;
      if (strikesAfter !== null) strikesBefore = strikesAfter;
    });
  }

  const players: InsertMlbPlayer[] = [];
  for (const raw of Object.values<Json>(gameData.players ?? {})) {
    const id = int(raw?.id);
    if (id === null || !involved.has(id)) continue;
    players.push({
      mlbId: id,
      fullName: String(raw.fullName ?? ""),
      firstName: str(raw.firstName),
      lastName: str(raw.lastName),
      position: str(raw.primaryPosition?.abbreviation),
      bats: str(raw.batSide?.code),
      throws: str(raw.pitchHand?.code),
      birthDate: str(raw.birthDate),
      active: bool(raw.active),
    });
  }

  return { game, players, pitches, plateAppearances };
}
