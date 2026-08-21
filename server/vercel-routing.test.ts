import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAnonymousAuthMe } from "../api/trpc/[...path]";

describe("Vercel API routing", () => {
  it("forwards arbitrary /api/* paths to the shared Express serverless entry", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/[...path].ts"),
      "utf8"
    );
    expect(source).toContain('export { default } from "./index"');
  });

  it("detects anonymous auth.me requests across Vercel and Express URL shapes", () => {
    expect(isAnonymousAuthMe({ url:"/auth.me", originalUrl:"/api/trpc/auth.me", headers:{} } as any)).toBe(true);
    expect(isAnonymousAuthMe({ url:"/api/trpc/auth.me", headers:{ cookie:"session=present" } } as any)).toBe(false);
    expect(isAnonymousAuthMe({ url:"/api/trpc/other.procedure", headers:{ "x-invoke-path":"/api/trpc/auth.me" } } as any)).toBe(true);
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
