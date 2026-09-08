import { ok, withAuth } from "@/lib/api";
import { permissionsFor } from "@/lib/permissions";

export async function GET(req: Request) {
  return withAuth(req, async (ctx) =>
    ok({ session: { ...ctx.session }, permissions: permissionsFor(ctx.session.role) })
  );
}
