import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/session";

/** API routes anyone may call: sign-in/up, health, the admin login form and the token-guarded boot hook. Everything else needs a session
 *  (route handlers then check project ownership). */
const PUBLIC_API = [/^\/api\/auth\//, /^\/api\/status$/, /^\/api\/admin\/(login|logout)$/, /^\/api\/recover$/];
/** The public marketing site. Every other page (dashboard, studio, settings, docs…) needs a session. /admin has its own login. */
const PUBLIC_PAGES = new Set(["/", "/pricing", "/about", "/faq", "/login", "/signup"]);
const AUTH_PAGES = new Set(["/login", "/signup"]);
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export async function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;
  const api = pathname.startsWith("/api/");
  if (api && PUBLIC_API.some((r) => r.test(pathname))) return NextResponse.next();
  if (!api && (pathname === "/admin" || pathname.startsWith("/admin/"))) return NextResponse.next();
  const user = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (!api && PUBLIC_PAGES.has(pathname)) {
    if (user && AUTH_PAGES.has(pathname)) return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), req.url));
    // signed-in visitors land on their dashboard; ?site keeps the public site reachable for them
    if (user && pathname === "/" && !searchParams.has("site")) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }
  if (user) return NextResponse.next();
  if (api) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const u = req.nextUrl.clone(); u.pathname = "/login"; u.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(u);
}
// every page and API route; static assets (_next, files with an extension) are skipped
export const config = { matcher: ["/api/:path*", "/((?!_next/|.*\\..*).*)"] };
