import { AsyncLocalStorage } from "node:async_hooks";

// Per-request context (requestId + actor), available anywhere in the async
// call chain of a route handler — used for the error envelope, structured
// logs and audit entries.
export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  orgId?: string;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return store.getStore();
}

export function getRequestId(): string {
  return store.getStore()?.requestId ?? "no-req-id";
}

/** Structured log line — never logs tokens, passwords or secrets. */
export function logRequest(info: {
  status: number;
  durationMs: number;
  userId?: string;
  orgId?: string;
}) {
  const ctx = store.getStore();
  if (!ctx) return;
  console.log(
    JSON.stringify({
      level: "info",
      msg: "request",
      requestId: ctx.requestId,
      method: ctx.method,
      path: ctx.path,
      status: info.status,
      durationMs: info.durationMs,
      userId: info.userId ?? ctx.userId,
      orgId: info.orgId ?? ctx.orgId,
      time: new Date().toISOString(),
    })
  );
}

export function logError(msg: string, error: unknown) {
  const ctx = store.getStore();
  console.log(
    JSON.stringify({
      level: "error",
      msg,
      requestId: ctx?.requestId,
      path: ctx?.path,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      time: new Date().toISOString(),
    })
  );
}
