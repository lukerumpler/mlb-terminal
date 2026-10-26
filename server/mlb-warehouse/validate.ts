import type { ParsedGame } from "./parse.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

/**
 * Integrity checks run before anything is written. Errors block the write (the
 * game is marked failed and retried); warnings are recorded but the data is
 * still stored, because suspicious-but-present source data should stay visible
 * rather than disappear.
 */
export function validateParsedGame(parsed: ParsedGame): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { game, pitches, players, plateAppearances } = parsed;

  if (pitches.length === 0) {
    issues.push({
      severity: "error",
      code: "no_pitches",
      message: `Game ${game.gamePk} is final but produced zero pitches (incomplete feed?)`,
    });
  }

  const seen = new Set<string>();
  for (const p of pitches) {
    const key = `${p.gamePk}:${p.atBatIndex}:${p.eventIndex}`;
    if (seen.has(key)) {
      issues.push({
        severity: "error",
        code: "duplicate_pitch",
        message: `Duplicate pitch identity ${key}`,
      });
    }
    seen.add(key);
    if (p.gamePk !== game.gamePk) {
      issues.push({
        severity: "error",
        code: "pitch_game_mismatch",
        message: `Pitch ${key} does not belong to game ${game.gamePk}`,
      });
    }
  }

  const known = new Set(players.map(p => p.mlbId));
  const missingPlayers = new Set<number>();
  for (const p of pitches) {
    if (!known.has(p.pitcherId)) missingPlayers.add(p.pitcherId);
    if (!known.has(p.batterId)) missingPlayers.add(p.batterId);
  }
  if (missingPlayers.size > 0) {
    issues.push({
      severity: "warning",
      code: "unknown_players",
      message: `${missingPlayers.size} pitcher/batter id(s) have no player record: ${Array.from(missingPlayers).slice(0, 5).join(", ")}`,
    });
  }

  const badVelo = pitches.filter(
    p => p.startSpeed != null && (p.startSpeed < 30 || p.startSpeed > 110)
  ).length;
  if (badVelo > 0) {
    issues.push({
      severity: "warning",
      code: "implausible_velocity",
      message: `${badVelo} pitch(es) with start speed outside 30-110 mph`,
    });
  }

  const paKeys = new Set<string>();
  for (const pa of plateAppearances) {
    const key = `${pa.gamePk}:${pa.atBatIndex}`;
    if (paKeys.has(key)) {
      issues.push({
        severity: "error",
        code: "duplicate_plate_appearance",
        message: `Duplicate plate appearance identity ${key}`,
      });
    }
    paKeys.add(key);
  }
  const orphanPitches = pitches.filter(
    p => !paKeys.has(`${p.gamePk}:${p.atBatIndex}`)
  ).length;
  if (orphanPitches > 0) {
    issues.push({
      severity: "error",
      code: "pitch_without_plate_appearance",
      message: `${orphanPitches} pitch(es) belong to a plate appearance with no row`,
    });
  }
  const unknownBases = plateAppearances.filter(
    pa => pa.basesBefore == null
  ).length;
  if (unknownBases > 0) {
    issues.push({
      severity: "warning",
      code: "pa_base_state_unknown",
      message: `${unknownBases} plate appearance(s) have no reconciled base state (extra-inning runner, or missing feed fields)`,
    });
  }
  const unknownRuns = plateAppearances.filter(
    pa => pa.runsOnPlay == null
  ).length;
  if (unknownRuns > 0) {
    issues.push({
      severity: "warning",
      code: "pa_runs_unknown",
      message: `${unknownRuns} plate appearance(s) have no run count (missing or inconsistent scores)`,
    });
  }
  if (unknownRuns === 0 && plateAppearances.length > 0) {
    const sumFor = (half: string) =>
      plateAppearances
        .filter(pa => pa.halfInning === half)
        .reduce((total, pa) => total + (pa.runsOnPlay ?? 0), 0);
    if (
      (game.awayScore != null && sumFor("top") !== game.awayScore) ||
      (game.homeScore != null && sumFor("bottom") !== game.homeScore)
    ) {
      issues.push({
        severity: "warning",
        code: "pa_runs_total_mismatch",
        message: `Game ${game.gamePk}: runs over plate appearances (${sumFor("top")}-${sumFor("bottom")}) differ from the final score (${game.awayScore}-${game.homeScore}); the feed may be incomplete`,
      });
    }
  }

  if (game.homeScore == null || game.awayScore == null) {
    issues.push({
      severity: "warning",
      code: "missing_score",
      message: `Game ${game.gamePk} has no final score in the feed`,
    });
  }

  return issues;
}
