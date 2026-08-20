import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  test: {
    environment: "node",
    include: ["test/**/*.e2e.test.js"],
    testTimeout: 45_000,
  },
});
