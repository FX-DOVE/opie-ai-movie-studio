import { NextResponse } from "next/server";
import { checkCredentials, createSession } from "@/lib/auth";
import { hit, ipOf, limited, reset } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const k = "login:" + ipOf(req);
  if (limited(k)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const { email, password } = await req.json().catch(() => ({}));
  const u = await checkCredentials(String(email || ""), String(password || ""));
  if (!u) { hit(k); return NextResponse.json({ error: "Invalid email or password" }, { status: 401 }); }
  reset(k);
  await createSession(u);
  return NextResponse.json({ ok: true, user: { id: u.id, email: u.email, role: u.role, name: u.name } });
}
