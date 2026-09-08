import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration.
 *
 *  - tests/unit/**        → pure function tests, no server, no DB.
 *  - tests/integration/** → real HTTP tests against a DEDICATED dev server on
 *    port 3100 with its own SQLite database. The server lifecycle is managed
 *    per-file by tests/integration/setup.ts (beforeAll/afterAll singleton):
 *    unit-only runs never boot a server.
 *
 * The long-running interactive dev server on port 3000 is NEVER touched.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // src/lib/auth.ts imports "server-only" (a Next.js guard package).
      // Unit tests run outside Next, so swap in a no-op stub.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The integration suite shares one server + SQLite file, and login rate
    // limits are per-process — run test files sequentially.
    fileParallelism: false,
    // Reaps the integration dev server (pidfile-based) at the end of every run.
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
