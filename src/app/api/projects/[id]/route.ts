import { WRITING } from "@/lib/jobs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import { db, projectMediaDir } from "@/lib/db";
import { buildBible } from "@/lib/studio";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["title", "mode", "format", "aspect", "style", "customStyle", "outputType", "videoProvider", "idea", "script", "narratorVoice", "music", "subtitles"] as const;

export async function GET(_: Request, { params }: Ctx) {
  const p = db.getProject((await params).id);
  if (p?.writing && !WRITING.has(p.id)) p.writing = undefined;
  return p ? NextResponse.json(p) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function PATCH(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = await req.json();
  try {
    const p = await db.update(id, (x) => {
      for (const k of EDITABLE) if (k in b) (x as unknown as Record<string, unknown>)[k] = b[k];
      if ("style" in b || "aspect" in b) x.bible = buildBible(x);
    });
    return NextResponse.json(p);
  } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }
}
export async function DELETE(_: Request, { params }: Ctx) {
  const id = (await params).id;
  await db.deleteProject(id);
  fs.rmSync(projectMediaDir(id), { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}
