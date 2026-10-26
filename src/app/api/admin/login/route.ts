import { NextResponse } from "next/server";
import { checkCredentials, createSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
const attempts = new Map<string, { n: number; t: number }>();
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60_000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const { email, password } = await req.json().catch(() => ({}));
  if (!(await checkCredentials(String(email || ""), String(password || "")))) { a.n++; attempts.set(ip, a); return NextResponse.json({ error: "Invalid email or password" }, { status: 401 }); }
  attempts.delete(ip);
  await createSession(String(email));
  return NextResponse.json({ ok: true });
}
