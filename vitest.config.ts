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
    // Vitest has its own limit of 5 seconds for each whole test, separate from Testing Library's wait limit (see test/setup.js).
    // A slow or busy computer can go past it just by loading a page and checking it, so we allow 60 seconds.
    // We measured the heaviest Prospects test at 33 seconds with two busy loops sharing one core, so 30 seconds was not enough.
    // Passing tests do not wait longer; only a test that is really stuck waits this long.
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
