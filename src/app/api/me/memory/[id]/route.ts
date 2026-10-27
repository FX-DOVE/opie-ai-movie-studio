import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { deleteNote, editNote, memoryOf } from "@/lib/memory";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, { params }: Ctx) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  await editNote(u.id, (await params).id, { text: b.text ? String(b.text) : undefined, category: b.category ? String(b.category) : undefined });
  return NextResponse.json(memoryOf(u.id));
}
export async function DELETE(_: Request, { params }: Ctx) {
  const u = await requireUser(); if (u instanceof Response) return u;
  await deleteNote(u.id, (await params).id);
  return NextResponse.json(memoryOf(u.id));
}
