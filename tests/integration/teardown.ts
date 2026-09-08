/**
 * Global teardown for the vitest run.
 *
 * Reaps the integration test dev server (port 3100) recorded in
 * /tmp/labvault-test-server.pid. Runs at the end of EVERY vitest invocation
 * (including unit-only runs, where it is a fast no-op unless a stale test
 * server is still around from an earlier run).
 */
import { readFileSync, rmSync, existsSync } from "node:fs";

const PIDFILE = "/tmp/labvault-test-server.pid";

export default async function teardown(): Promise<void> {
  if (!existsSync(PIDFILE)) return;
  let pid = 0;
  try {
    pid = Number(readFileSync(PIDFILE, "utf-8").trim());
  } catch {
    return;
  }
  if (!Number.isFinite(pid) || pid <= 0) return;

  const killGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal); // negative pid → process group
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        /* already gone */
      }
    }
  };

  killGroup("SIGTERM");

  // Wait up to 8s for the server to actually go away
  for (let i = 0; i < 16; i++) {
    let dead = false;
    try {
      const res = await fetch("http://localhost:3100/api/health", { cache: "no-store" });
      dead = !res.ok;
    } catch {
      dead = true; // connection refused → dead
    }
    if (dead) break;
    await new Promise((r) => setTimeout(r, 500));
    if (i === 10) killGroup("SIGKILL");
  }

  try {
    rmSync(PIDFILE, { force: true });
  } catch {
    /* ignore */
  }
}
