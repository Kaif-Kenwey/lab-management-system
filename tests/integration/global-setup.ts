/**
 * Vitest global setup (runs in the MAIN vitest process, once per run).
 *
 * Boots the shared integration test server on port 3100 for the whole run —
 * worker processes exit between test files, and under the bun runtime that
 * reaps their detached children, so booting per-file was unreliable.
 *
 * Teardown (also in the main process) reaps the server via the pidfile.
 */
import { bootSharedServer } from "./setup";
import teardown from "./teardown";

export default async function globalSetup(): Promise<void> {
  // Only relevant when integration tests will run; cheap no-op guard —
  // unit-only runs would still boot the server, but that is acceptable
  // (takes ~30s once) and keeps CI simple. Skip when explicitly disabled.
  if (process.env.LABVAULT_SKIP_TEST_SERVER === "1") return;
  await bootSharedServer();
}

export { teardown };
