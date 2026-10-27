import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/session";

/** API routes anyone may call: sign-in/up, health, the admin login form and the token-guarded boot hook. Everything else needs a session
 *  (route handlers then check project ownership). */
const PUBLIC_API = [/^\/api\/auth\//, /^\/api\/status$/, /^\/api\/admin\/(login|logout)$/, /^\/api\/recover$/];
const APP_PAGES = /^\/(studio|settings)(\/|$)/;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const api = pathname.startsWith("/api/");
  if (api && PUBLIC_API.some((r) => r.test(pathname))) return NextResponse.next();
  if (!api && !APP_PAGES.test(pathname)) return NextResponse.next();
  const user = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (user) return NextResponse.next();
  if (api) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const u = req.nextUrl.clone(); u.pathname = "/login"; u.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(u);
}
export const config = { matcher: ["/api/:path*", "/studio/:path*", "/studio", "/settings/:path*", "/settings"] };
