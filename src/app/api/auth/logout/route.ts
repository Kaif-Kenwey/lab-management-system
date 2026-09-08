import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/cookies";

export async function POST(req: NextRequest) {
  const res = ok({ success: true });
  res.cookies.set(TOKEN_COOKIE, "", sessionCookieOptions(req, 0));
  return res;
}
