import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { agents, chats, stopChat } from "@/lib/chats";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const nf = () => NextResponse.json({ error: "not found" }, { status: 404 });
export async function GET(_: Request, { params }: P) { const u = await requireUser(); if (u instanceof Response) return u; const c = chats.get((await params).id, u.id); return c ? NextResponse.json({ chat: c }) : nf(); }
export async function PATCH(req: Request, { params }: P) {
  const u = await requireUser(); if (u instanceof Response) return u; const c = chats.get((await params).id, u.id); if (!c) return nf();
  const b = await req.json().catch(() => ({}));
  if (typeof b.title === "string" && b.title.trim()) c.title = b.title.trim().slice(0, 80);
  if (typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color)) c.color = b.color;
  if (typeof b.topic === "string") c.topic = b.topic.slice(0, 600);
  if (typeof b.filmStyle === "string") c.filmStyle = b.filmStyle || undefined;
  if (b.approval === "auto" || b.approval === "key") c.approval = b.approval;
  if (Array.isArray(b.notes)) c.notes = b.notes.map(String).slice(-40);
  if (Array.isArray(b.agentIds)) c.agentIds = b.agentIds.filter((x: string) => agents.get(x, u.id)).slice(0, 8);
  return NextResponse.json({ chat: await chats.save(c) });
}
export async function DELETE(_: Request, { params }: P) { const u = await requireUser(); if (u instanceof Response) return u; const c = chats.get((await params).id, u.id); if (!c) return nf(); stopChat(c); await db.delDoc("chats", c.id); return NextResponse.json({ ok: true }); }
