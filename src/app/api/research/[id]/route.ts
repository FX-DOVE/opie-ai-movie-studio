import { NextResponse } from "next/server";
import { sessionFor, viewSession, control, frame } from "@/lib/research";
import { currentUser } from "@/lib/auth";
const find = async (id: string) => { const u = await currentUser(); return u ? sessionFor(id, u) : undefined; };
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  const s = await find((await params).id);
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return s ? NextResponse.json(viewSession(s, since)) : NextResponse.json({ error: "not found" }, { status: 404 });
}
/** Control: {op:"stop"|"pause"|"resume"} */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await find((await params).id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { op } = await req.json().catch(() => ({}));
  if (op === "stop") { s.stop = true; s.pause = false; }
  if (op === "pause" && s.status === "running") { s.pause = true; s.status = "paused"; }
  if (op === "takeover") { s.control = true; s.manualLog = []; if (s.status === "running") s.status = "paused"; }
  if (op === "handback") {
    s.control = false; s.needsUser = undefined;
    if (s.mode !== "manual") { (s.inbox ||= []).push(`The user took manual control and handed back. They: ${(s.manualLog || []).slice(-12).join("; ") || "looked around"}. The page is now ${s.pageUrl}. Continue the task from here.`); s.pause = false; s.status = "running"; }
  }
  if (op === "resume") { s.pause = false; if (s.status === "paused") s.status = "running"; }
  return NextResponse.json({ ok: true });
}
export async function DELETE(_: Request, ctx: Ctx) {
  const s = await find((await ctx.params).id); if (s) s.stop = true;
  return NextResponse.json({ ok: true });
}

/** Live input from the user while in control: {t:"click"|"scroll"|"type"|"key"|"navigate"|"back"|"forward"|"reload"|"frame", ...} */
export async function POST(req: Request, { params }: Ctx) {
  const s = await find((await params).id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const e = await req.json().catch(() => ({}));
  try { return NextResponse.json(e.t === "frame" ? await frame(s) : await control(s, e)); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 409 }); }
}
