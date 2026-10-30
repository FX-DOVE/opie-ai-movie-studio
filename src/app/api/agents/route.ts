import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { agents } from "@/lib/chats";
export const dynamic = "force-dynamic";
export async function GET() { const u = await requireUser(); if (u instanceof Response) return u; return NextResponse.json({ agents: agents.list(u.id) }); }
export async function POST(req: Request) { const u = await requireUser(); if (u instanceof Response) return u; const b = await req.json().catch(() => ({})); if (agents.list(u.id).length >= 24) return NextResponse.json({ error: "Agent limit reached" }, { status: 400 }); return NextResponse.json({ agent: await agents.create(u.id, b) }); }
