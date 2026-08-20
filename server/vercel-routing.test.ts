import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("forwards arbitrary /api/* paths to the shared Express serverless entry", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/[...path].ts"),
      "utf8"
    );
    expect(source).toContain('export { default } from "./index"');
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
