import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { addNote, clearNotes, flush, memoryBrief, memoryOf, setEnabled, MAX_NOTES, CATEGORIES } from "@/lib/memory";
export const dynamic = "force-dynamic";
/** "What Reel has learned": the signed-in user's own taste notes (separate from Contributor mode). */
export async function GET(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const preview = new URL(req.url).searchParams.get("preview");
  const m = memoryOf(u.id);
  return NextResponse.json({ ...m, max: MAX_NOTES, categories: CATEGORIES, ...(preview ? { preview: { director: memoryBrief(u.id, "director"), script: memoryBrief(u.id, "script"), reference: memoryBrief(u.id, "reference", 6), continuity: memoryBrief(u.id, "continuity", 8), brainstorm: memoryBrief(u.id, "brainstorm") } } : {}) });
}
/** {enabled:boolean} toggles learning */
export async function PATCH(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  if ("enabled" in b) await setEnabled(u.id, !!b.enabled);
  return NextResponse.json(memoryOf(u.id));
}
/** {text, category} adds a note by hand; {flush:true} distills pending events now */
export async function POST(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  if (b.flush) await flush(u.id);
  else if (b.text) await addNote(u.id, String(b.text), String(b.category || "other"));
  return NextResponse.json(memoryOf(u.id));
}
/** clear all notes */
export async function DELETE() {
  const u = await requireUser(); if (u instanceof Response) return u;
  await clearNotes(u.id);
  return NextResponse.json(memoryOf(u.id));
}
