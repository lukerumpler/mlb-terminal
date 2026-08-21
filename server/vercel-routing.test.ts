import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("bundles the primary and catch-all API entries from the shared handler module", () => {
    const catchAllSource = readFileSync(
      resolve(process.cwd(), "api/[...path].ts"),
      "utf8"
    );
    const primarySource = readFileSync(
      resolve(process.cwd(), "api/index.ts"),
      "utf8"
    );
    expect(catchAllSource).toContain('export { default } from "../server/vercel-handler";');
    expect(catchAllSource).not.toContain('from "./index"');
    expect(primarySource).toContain('export { default, normalizeServerlessRequestUrl } from "../server/vercel-handler";');
  });

  it("handles anonymous nested tRPC auth requests before dynamic app loading", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/trpc/[...path].ts"),
      "utf8"
    );
    expect(source).toContain("isAnonymousAuthMe");
    expect(source).toContain("result: { data: { json: null } }");
  });
});
