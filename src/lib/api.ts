import { NextResponse } from "next/server";
import { getSession, SessionPayload } from "./auth";
import { db } from "./db";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a route handler with session auth + optional role guard + error handling.
 * Usage: export async function GET() { return withAuth(async (s) => ok(...)) }
 */
export async function withAuth(
  handler: (session: SessionPayload) => Promise<Response>,
  roles?: string[]
): Promise<Response> {
  const session = await getSession();
  if (!session) return fail("Unauthorized — please sign in", 401);
  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    return fail(`Forbidden — requires role: ${roles.join(" or ")}`, 403);
  }
  try {
    return await handler(session);
  } catch (error) {
    console.error("[API Error]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return fail(message, 500);
  }
}

/** Writes an entry to the audit trail (fire-and-forget safe) */
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
      },
    });
  } catch (e) {
    console.error("[Audit Error]", e);
  }
}

/** Parses a JSON body safely */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
