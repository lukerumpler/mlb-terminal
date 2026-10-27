import { describe, expect, it } from "vitest";
import { checkArgs } from "./cliArgs.js";

const V = ["season", "limit"] as const;
const B = ["status", "skip-discovery"] as const;

describe("checkArgs", () => {
  it("accepts valid combinations", () => {
    expect(checkArgs([], V, B)).toBeNull();
    expect(checkArgs(["--season", "2026", "--status"], V, B)).toBeNull();
    expect(checkArgs(["--skip-discovery", "--limit", "5"], V, B)).toBeNull();
  });
  it("rejects a typo'd flag instead of silently ignoring it", () => {
    expect(checkArgs(["--seasn", "2026"], V, B)).toMatch(
      /Unknown option --seasn/
    );
  });
  it("rejects a value flag with no value, at the end or before another flag", () => {
    expect(checkArgs(["--limit"], V, B)).toMatch(/--limit needs a value/);
    expect(checkArgs(["--limit", "--status"], V, B)).toMatch(
      /--limit needs a value/
    );
  });
  it("rejects a stray value-less word only via its flag, not positionally", () => {
    expect(checkArgs(["--status", "extra"], V, B)).toBeNull();
  });
});
