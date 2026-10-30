import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { chats } from "@/lib/chats";
export const dynamic = "force-dynamic";
export async function GET() { const u = await requireUser(); if (u instanceof Response) return u; return NextResponse.json({ chats: chats.list(u.id) }); }
export async function POST(req: Request) { const u = await requireUser(); if (u instanceof Response) return u; return NextResponse.json({ chat: await chats.create(u.id, await req.json().catch(() => ({}))) }); }
