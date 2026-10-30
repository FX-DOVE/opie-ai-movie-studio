import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { agents } from "@/lib/chats";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const nf = () => NextResponse.json({ error: "not found" }, { status: 404 });
export async function PATCH(req: Request, { params }: P) { const u = await requireUser(); if (u instanceof Response) return u; const a = agents.get((await params).id, u.id); if (!a) return nf(); return NextResponse.json({ agent: await agents.update(a, await req.json().catch(() => ({}))) }); }
export async function DELETE(_: Request, { params }: P) { const u = await requireUser(); if (u instanceof Response) return u; const a = agents.get((await params).id, u.id); if (!a) return nf(); await db.delDoc("agents", a.id); return NextResponse.json({ ok: true }); }
