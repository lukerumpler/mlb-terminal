import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const viteMiddlewareSource = fs.readFileSync(
  path.join(projectRoot, "server/_core/vite.ts"),
  "utf8"
);

describe("Express 5 fallback routing", () => {
  it("uses named wildcard parameters for development and static SPA fallbacks", () => {
    expect(viteMiddlewareSource).toContain('app.use("/{*path}"');
    expect(viteMiddlewareSource).not.toContain('app.use("*"');
  });
});
