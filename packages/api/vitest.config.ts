import { defineConfig } from "vitest/config";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
loadEnvFile(resolve(__dirname, "../../.env"));

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // DB-backed tests share one schema; run files serially to avoid
    // cross-file truncation races. Within-file order is still sequential.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
