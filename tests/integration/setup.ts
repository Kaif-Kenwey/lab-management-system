/**
 * Shared helpers + server lifecycle for integration tests.
 *
 * All requests go to the DEDICATED test server on port 3100 running against
 * db/test.db — never to the interactive dev server on port 3000.
 *
 * Lifecycle: the server is booted ONCE by vitest's globalSetup hook running
 * in the MAIN vitest process (tests/integration/global-setup.ts →
 * bootSharedServer) — worker processes exit between test files, which under
 * the bun runtime reaps their detached children, so per-worker booting was
 * unreliable. Per-file beforeAll(startTestServer) then simply adopts the
 * healthy server. teardown.ts (vitest global teardown, main process) reaps
 * it via the pidfile. Unit-only runs never boot anything.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";

export const BASE_URL = "http://localhost:3100";
export const DEMO_PASSWORD = "Password@123";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB_PATH = path.join(ROOT, "db", "test.db");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;
const PIDFILE = "/tmp/labvault-test-server.pid";

interface ServerHandle {
  refCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __labvaultTestServer: ServerHandle | undefined;
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(tries = 180, delayMs = 1000): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await isHealthy()) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Test dev server did not become healthy on port 3100 within ${tries}s. Check /tmp/labvault-test-server.log`
  );
}

async function waitPortFree(tries = 20, delayMs = 500): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (!(await isHealthy())) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Port 3100 is still busy after 10s — cannot boot the test server`);
}

/** Kill a server recorded in the pidfile (its whole process group). */
function killPidfileServer(): void {
  if (!existsSync(PIDFILE)) return;
  try {
    const pid = Number(readFileSync(PIDFILE, "utf-8").trim());
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(-pid, "SIGTERM"); // negative pid → process group
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    /* unreadable pidfile — ignore */
  }
  try {
    rmSync(PIDFILE, { force: true });
  } catch {
    /* ignore */
  }
}

async function ensureServer(): Promise<void> {
  if (globalThis.__labvaultTestServer) {
    globalThis.__labvaultTestServer.refCount++;
    return;
  }

  // Adopt a healthy server booted by globalSetup (or an earlier file).
  if (await isHealthy()) {
    globalThis.__labvaultTestServer = { refCount: 1 };
    return;
  }

  // Fallback: boot in this process (rare — globalSetup normally did it).
  await bootSharedServer();
  globalThis.__labvaultTestServer = { refCount: 1 };
}

/**
 * Full boot: reap stale server, reset the test DB, push schema, seed, start
 * the dev server and wait for health. Exported for vitest's globalSetup so
 * the server lives in the MAIN process for the entire run.
 */
export async function bootSharedServer(): Promise<void> {
  // Reap any stale server from a previous run, then make sure the port frees up
  killPidfileServer();
  await waitPortFree();

  // 1. Clean slate for the SQLite test database
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      rmSync(TEST_DB_PATH + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }

  // 2. Create the schema in the fresh DB, then seed it. Env override wins:
  //    dotenv does not replace existing process.env values, so this bypasses
  //    the .env DATABASE_URL.
  const push = spawnSync("bunx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    encoding: "utf-8",
  });
  if (push.status !== 0) {
    if (push.stdout) process.stdout.write(push.stdout);
    if (push.stderr) process.stderr.write(push.stderr);
    throw new Error(`prisma db push failed for the test DB (exit ${push.status})`);
  }
  const seed = spawnSync("bun", ["prisma/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    encoding: "utf-8",
  });
  if (seed.status !== 0) {
    if (seed.stdout) process.stdout.write(seed.stdout);
    if (seed.stderr) process.stderr.write(seed.stderr);
    throw new Error(`prisma/seed.ts failed for the test DB (exit ${seed.status})`);
  }

  // 3. Boot the dedicated dev server on port 3100 as its own process group
  const child: ChildProcess = spawn("bunx", ["next", "dev", "-p", "3100"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, PORT: "3100", NEXT_DIST_DIR: ".next-test" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // group leader → we can kill the whole tree later
  });
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[test-server] ${d}`));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[test-server] ${d}`));
  if (child.pid) writeFileSync(PIDFILE, String(child.pid));

  await waitForHealth();
}

function releaseServer(): void {
  // No kill here — the server is shared across vitest worker processes for
  // the remainder of the run; teardown.ts reaps it at the very end.
  if (globalThis.__labvaultTestServer) {
    globalThis.__labvaultTestServer.refCount--;
  }
}

/** beforeAll hook — boots or adopts the shared test server. */
export const startTestServer = () => ensureServer();
/** afterAll hook — bookkeeping only (see teardown.ts for the real kill). */
export const stopTestServer = () => releaseServer();

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  /** Raw error envelope when present: { error: { code, message, requestId } } */
  error?: { code: string; message: string; requestId?: string };
}

export function api<T = unknown>(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.cookie = opts.token;
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  }).then(async (res) => {
    const data = (await res.json().catch(() => null)) as T | null;
    return {
      status: res.status,
      ok: res.ok,
      data: data as T,
      error: (data as { error?: ApiResult["error"] } | null)?.error,
    };
  });
}

/** Extract the session cookie ("lms_token=…") from a login/signup response. */
export function cookieFrom(res: Response): string {
  const jar =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  const full = jar.find((c) => c && c.includes("lms_token="));
  if (!full) throw new Error("No lms_token cookie in response");
  return full.split(";")[0];
}

const loginCache = new Map<string, string>();

/**
 * Login as a seeded demo account (or any known email + password) and return
 * the Cookie header value. Results are cached per email to keep the number
 * of real login calls low (login is rate limited to 8/min per IP+email).
 */
export async function login(email: string, password = DEMO_PASSWORD): Promise<string> {
  const cached = loginCache.get(`${email}:${password}`);
  if (cached) return cached;
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`login(${email}) failed with ${res.status}`);
  }
  const cookie = cookieFrom(res);
  loginCache.set(`${email}:${password}`, cookie);
  return cookie;
}

/** Fresh, collision-free identifiers for test fixtures. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function futureDate(daysAhead: number, hoursAhead = 0): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000 + hoursAhead * 3_600_000).toISOString();
}
