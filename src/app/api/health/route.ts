import { ok } from "@/lib/api";

// Liveness probe — no authentication required.
export async function GET() {
  return ok({ status: "ok", uptime: process.uptime(), version: "2.0.0" });
}
