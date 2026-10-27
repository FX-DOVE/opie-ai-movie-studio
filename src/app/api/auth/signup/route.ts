import { NextResponse } from "next/server";
import { createSession, signUp } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { hit, ipOf, limited } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if ((getConfig("SIGNUPS") || process.env.SIGNUPS || "open") === "closed") return NextResponse.json({ error: "Sign-ups are closed right now." }, { status: 403 });
  const k = "signup:" + ipOf(req);
  if (limited(k, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many sign-ups from this network. Try again later." }, { status: 429 });
  const { email, password, name } = await req.json().catch(() => ({}));
  try {
    const u = await signUp(String(email || ""), String(password || ""), name ? String(name) : undefined);
    hit(k);
    await createSession(u);
    return NextResponse.json({ ok: true, user: u });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
