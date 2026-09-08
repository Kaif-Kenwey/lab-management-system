import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Readiness probe — verifies the database connection. No authentication.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", checks: { database: "up" } });
  } catch {
    return NextResponse.json({ status: "unavailable", checks: { database: "down" } }, { status: 503 });
  }
}
