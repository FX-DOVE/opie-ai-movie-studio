import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brainstormStream } from "@/lib/brainstorm";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Ctx) {
  const p = db.getProject((await params).id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { message } = await req.json().catch(() => ({}));
  if (!message || !String(message).trim()) return NextResponse.json({ error: "Say something" }, { status: 400 });
  return new Response(brainstormStream(p, String(message).slice(0, 4000)), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
