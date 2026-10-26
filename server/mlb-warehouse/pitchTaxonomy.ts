/**
 * SKIP's controlled pitch taxonomy. MLB's own type code/name is always stored
 * alongside (source_pitch_type_*), so this mapping can be revised and re-run
 * without losing what the provider actually said.
 */
export const SKIP_PITCH_TYPES = [
  "Four-Seam Fastball",
  "Sinker",
  "Cutter",
  "Slider",
  "Sweeper",
  "Curveball",
  "Changeup",
  "Splitter",
  "Other",
] as const;

export type SkipPitchType = (typeof SKIP_PITCH_TYPES)[number];

const CODE_TO_SKIP: Record<string, SkipPitchType> = {
  FF: "Four-Seam Fastball",
  SI: "Sinker",
  FT: "Sinker", // two-seam; MLB reports most of these as SI today
  FC: "Cutter",
  SL: "Slider",
  ST: "Sweeper",
  CU: "Curveball",
  KC: "Curveball",
  CS: "Curveball",
  CH: "Changeup",
  FS: "Splitter",
  FO: "Splitter", // forkball
};

/**
 * Anything unmapped (slurve, knuckleball, eephus, screwball, pitchouts,
 * automatic balls, unspecified fastballs, unknown) is "Other" rather than
 * being forced into a bucket it might not belong to. Returns null when the
 * provider sent no pitch type at all.
 */
export function toSkipPitchType(
  code: string | null | undefined
): SkipPitchType | null {
  if (!code) return null;
  return CODE_TO_SKIP[code.toUpperCase()] ?? "Other";
}
