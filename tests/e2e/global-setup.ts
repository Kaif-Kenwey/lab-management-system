/**
 * Playwright global setup (Phase V2-6).
 *
 * Runs BEFORE the webServer starts. It gives the E2E suite a pristine,
 * fully-seeded SQLite database at db/e2e.db:
 *
 *   1. delete db/e2e.db (+ journal/wal/shm sidecars)
 *   2. `bunx prisma db push --skip-generate` — create the schema
 *   3. `bun prisma/seed.ts` — seed the demo organization
 *
 * The same DATABASE_URL is injected into the webServer env by
 * playwright.config.ts, so the dev server reads exactly this database.
 *
 * NOTE on `reuseExistingServer: true`: if a port-3200 server from a previous
 * run is still up, it holds an open handle to the (now deleted) old database
 * file. For repeat local runs, stop that server first (the config will boot
 * a fresh one); CI always starts from a clean environment.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "db", "e2e.db");
const DB_URL = `file:${DB_PATH}`;

function run(cmd: string[], label: string): void {
  const res = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    encoding: "utf-8",
  });
  if (res.status !== 0) {
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    throw new Error(`${label} failed for the E2E database (exit ${res.status})`);
  }
}

export default async function globalSetup(): Promise<void> {
  // 1. Clean slate — remove the SQLite file and its sidecars.
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(DB_PATH + suffix, { force: true });
  }

  // 2. Schema. --skip-generate: the client is already generated at install.
  run(["bunx", "prisma", "db", "push", "--skip-generate"], "prisma db push");

  // 3. Seed demo organization (admin@labvault.io / Password@123 …).
  run(["bun", "prisma/seed.ts"], "prisma seed");
}
