import { NextResponse } from "next/server";
import { getSession, viewSession } from "@/lib/research";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  const s = getSession((await params).id);
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return s ? NextResponse.json(viewSession(s, since)) : NextResponse.json({ error: "not found" }, { status: 404 });
}
/** Control: {op:"stop"|"pause"|"resume"} */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = getSession((await params).id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { op } = await req.json().catch(() => ({}));
  if (op === "stop") { s.stop = true; s.pause = false; }
  if (op === "pause") s.pause = true;
  if (op === "resume") s.pause = false;
  return NextResponse.json({ ok: true });
}
export async function DELETE(_: Request, ctx: Ctx) {
  const s = getSession((await ctx.params).id); if (s) s.stop = true;
  return NextResponse.json({ ok: true });
}
