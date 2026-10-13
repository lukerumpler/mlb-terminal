import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [
      ["server/**/*.test.ts", "node"],
      ["server/**/*.spec.ts", "node"],
      ["test/**/*.test.jsx", "jsdom"],
      ["test/**/*.test.js", "jsdom"],
    ],
    setupFiles: ["./test/setup.js"],
    // vitest's own 5 s per-test limit is separate from Testing Library's wait limit and
    // also trips on slow or contended runners (a page mount plus assertions can exceed it).
    // 60 s, not 30 s: with two CPU hogs competing for one core the heaviest Prospects test
    // measured 33 s. Passing tests are unaffected; only a genuinely hung test waits this long.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "test/**/*.test.jsx",
      "test/**/*.test.js",
    ],
    exclude: ["**/*.e2e.test.js"],
  },
});
