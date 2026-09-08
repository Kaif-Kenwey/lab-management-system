import { ok, withAuth } from "@/lib/api";

export async function GET() {
  return withAuth(async (session) => ok({ session }));
}
