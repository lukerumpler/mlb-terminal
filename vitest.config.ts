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
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "test/**/*.test.jsx",
      "test/**/*.test.js",
    ],
  },
});
