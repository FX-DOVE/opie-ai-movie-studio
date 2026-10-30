import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { chats, chatStream } from "@/lib/chats";
import { streamJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const c = chats.get((await params).id, u.id); if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({})); const text = String(b.message || "").trim().slice(0, 8000);
  if (!text) return NextResponse.json({ error: "empty message" }, { status: 400 });
  return streamJob(chatStream(c, u.id, text), { ownerId: u.id, action: "chat", label: c.title });
}
