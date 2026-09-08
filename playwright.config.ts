import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Playwright E2E configuration (Phase V2-6).
 *
 * The suite boots its OWN Next.js dev server on port 3200 against a dedicated
 * SQLite database (db/e2e.db). It never touches:
 *   - the interactive dev server on port 3000
 *   - the vitest integration server on port 3100
 *
 * Next.js 16 takes a project-level dev lock inside distDir, so every
 * concurrent dev server needs a unique build directory — that is what
 * NEXT_DIST_DIR=.next-e2e is for (honored by next.config.ts).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Dev-mode compiles (first hit of a route on a cold cache) can take well
  // over the 5s default — give every expect generous room.
  expect: { timeout: 20_000 },
  // Lifecycle is deterministic against a freshly seeded database — a retry
  // would re-create the same fixture (e.g. lab code E2E-01) and fail louder.
  retries: 0,
  // One worker: the suite shares one seeded database and the login rate
  // limiter (8/min per IP+email) is per-process.
  workers: 1,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3200",
    // Sandboxed environments ship a tiny /dev/shm (64MB here), which crashes
    // Chromium renderers on chart-heavy pages. Force /tmp for shared memory.
    launchOptions: {
      args: ["--disable-dev-shm-usage"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: path.resolve(__dirname, "tests/e2e/global-setup.ts"),
  webServer: {
    command: "bunx next dev -p 3200",
    url: "http://localhost:3200/api/health",
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      DATABASE_URL: `file:${path.join(process.cwd(), "db", "e2e.db")}`,
      PORT: "3200",
      NEXT_DIST_DIR: ".next-e2e",
      // Cap the dev-server V8 heap so the E2E server cannot grow unbounded
      // and get OOM-killed on memory-constrained hosts (CI runners are fine).
      NODE_OPTIONS: "--max-old-space-size=1536",
    },
  },
});
