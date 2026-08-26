import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const viteMiddlewareSource = fs.readFileSync(
  path.join(projectRoot, "server/_core/vite.ts"),
  "utf8"
);

describe("Express SPA fallback routing", () => {
  it("uses a regular-expression fallback compatible with the running Express 4 server and Express 5", () => {
    expect(viteMiddlewareSource).toContain("app.use(/.*/");
    expect(viteMiddlewareSource).not.toContain('app.use("*")');
  });
});
