import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession, SessionPayload } from "./auth";
import { db } from "./db";
import { ApiError } from "./errors";
import { can, Permission } from "./permissions";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { getRequestContext, logError, logRequest, runWithRequestContext } from "./request-context";

export interface HandlerContext {
  session: SessionPayload;
  requestId: string;
  req: Request;
  /** Parsed query params of the request URL */
  searchParams: URLSearchParams;
}

function errorResponse(code: string, message: string, status: number) {
  const requestId = getRequestContext()?.requestId ?? "no-req-id";
  return NextResponse.json({ error: { code, message, requestId } }, { status });
}

/** Success JSON response */
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Structured error response: { error: { code, message, requestId } } */
export function fail(code: string, message: string, status = 400) {
  return errorResponse(code, message, status);
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "local";
}

/**
 * Route-handler wrapper: authenticates the session, enforces a granular
 * permission, opens the request context (requestId + structured logs) and
 * converts ApiError into the standard error envelope.
 *
 * NEW (v2) signature:
 *   export async function GET(req: NextRequest) {
 *     return withAuth(req, async (ctx) => ok(await db.lab.findMany(...)));
 *   }
 *   export async function POST(req: NextRequest) {
 *     return withAuth(req, async (ctx) => ok(..., 201), "labs.manage");
 *   }
 * ctx = { session, requestId, req, searchParams }
 *
 * LEGACY signature (still supported during migration — do not use in new code):
 *   withAuth(async (session) => ok(...), ["ADMIN", "LAB_MANAGER"]?)
 */
type LegacyHandler = (session: SessionPayload) => Promise<Response>;

export function withAuth(req: Request, handler: (ctx: HandlerContext) => Promise<Response>, permission?: Permission): Promise<Response>;
export function withAuth(handler: LegacyHandler, roles?: string[]): Promise<Response>;
export function withAuth(
  arg1: Request | LegacyHandler,
  arg2?: ((ctx: HandlerContext) => Promise<Response>) | string[],
  arg3?: Permission
): Promise<Response> {
  if (typeof arg1 === "function") {
    // ---- Legacy path ----
    const handler = arg1 as LegacyHandler;
    const roles = arg2 as string[] | undefined;
    const ctxBase = { requestId: "legacy-" + randomUUID().slice(0, 8), method: "UNKNOWN", path: "unknown" };
    const startedAt = Date.now();
    return runWithRequestContext(ctxBase, async () => {
      let response: Response;
      try {
        const session = await getSession();
        if (!session) throw UnauthorizedError();
        if (roles && roles.length > 0 && !roles.includes(session.role)) {
          throw ForbiddenError(`Forbidden — requires role: ${roles.join(" or ")}`);
        }
        response = await handler(session);
      } catch (error) {
        response = toErrorResponse(error);
      }
      logRequest({ status: response.status, durationMs: Date.now() - startedAt, userId: undefined, orgId: undefined });
      response.headers.set("x-request-id", ctxBase.requestId);
      return response;
    });
  }

  // ---- v2 path ----
  const req = arg1 as Request;
  const handler = arg2 as (ctx: HandlerContext) => Promise<Response>;
  const permission = arg3;

  const url = new URL(req.url);
  const ctxBase = {
    requestId: req.headers.get("x-request-id") || randomUUID(),
    method: req.method,
    path: url.pathname,
  };
  const startedAt = Date.now();

  return runWithRequestContext(ctxBase, async () => {
    let response: Response;
    let userId: string | undefined;
    let orgId: string | undefined;

    try {
      const session = await getSession();
      if (!session) throw UnauthorizedError();
      userId = session.userId;
      orgId = session.orgId;

      if (permission && !can(session.role, permission)) {
        throw ForbiddenError(`Forbidden — requires permission: ${permission}`);
      }

      response = await handler({ session, requestId: ctxBase.requestId, req, searchParams: url.searchParams });
    } catch (error) {
      response = toErrorResponse(error);
    }

    logRequest({ status: response.status, durationMs: Date.now() - startedAt, userId, orgId });
    response.headers.set("x-request-id", ctxBase.requestId);
    return response;
  });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.status);
  }
  logError("unhandled_api_error", error);
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Internal server error";
  return errorResponse("INTERNAL_ERROR", message, 500);
}

/** Writes an entry to the audit trail (never throws) */
export async function audit(
  organizationId: string,
  userId: string | null,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        requestId: getRequestContext()?.requestId ?? null,
      },
    });
  } catch (e) {
    logError("audit_write_failed", e);
  }
}

/** Parses a JSON body safely (raw — prefer parseBody with a Zod schema) */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
