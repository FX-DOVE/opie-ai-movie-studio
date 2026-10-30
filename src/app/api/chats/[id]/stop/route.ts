import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { chats, stopChat } from "@/lib/chats";
export const dynamic = "force-dynamic";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const c = chats.get((await params).id, u.id); if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ stopped: stopChat(c) });
}
