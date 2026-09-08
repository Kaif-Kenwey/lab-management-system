import { ok } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = ok({ success: true });
  res.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
