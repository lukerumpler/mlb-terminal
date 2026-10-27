/**
 * Strict argv checking for scripts/mlb-ingest.ts. Silently ignoring a typo'd
 * flag (`--concurency 5`) or a value flag with no value (`--limit` at the end
 * of the line) runs the job with defaults the operator did not ask for.
 */
export function checkArgs(
  argv: string[],
  valueFlags: readonly string[],
  boolFlags: readonly string[]
): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue; // a value consumed by the flag before it
    const name = a.slice(2);
    if (boolFlags.includes(name)) continue;
    if (valueFlags.includes(name)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return `--${name} needs a value`;
      }
      i++; // skip the value
      continue;
    }
    return `Unknown option ${a}`;
  }
  return null;
}
