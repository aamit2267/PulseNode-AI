import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // DB-backed tests share one schema; run files serially to avoid
    // cross-file truncation races. Within-file order is still sequential.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
