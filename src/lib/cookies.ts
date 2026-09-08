/**
 * Session cookie options that work BOTH top-level and inside cross-site
 * preview iframes. Browsers drop SameSite=Lax cookies set from within a
 * third-party iframe, which caused redirect loops after login. Over HTTPS
 * (e.g. the preview gateway) we use SameSite=None; Secure — allowed in
 * iframes. Plain local HTTP keeps SameSite=Lax.
 */
export function sessionCookieOptions(
  req: Request,
  maxAge: number
): { httpOnly: boolean; sameSite: "none" | "lax"; secure: boolean; path: string; maxAge: number } {
  const forwardedProto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const isHttps = forwardedProto === "https" || new URL(req.url).protocol === "https:";

  if (isHttps) {
    return { httpOnly: true, sameSite: "none", secure: true, path: "/", maxAge };
  }
  return { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge };
}
