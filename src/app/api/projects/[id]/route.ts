import { WRITING } from "@/lib/jobs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildBible } from "@/lib/studio";
import { requireProject } from "@/lib/guard";
import { purgeProject } from "@/lib/projects";
import { learn } from "@/lib/memory";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["title", "mode", "format", "aspect", "style", "customStyle", "outputType", "videoProvider", "idea", "script", "narratorVoice", "music", "subtitles"] as const;

export async function GET(_: Request, { params }: Ctx) {
  const g = await requireProject((await params).id); if (g instanceof Response) return g;
  const p = g.p;
  if (p.writing && !WRITING.has(p.id)) p.writing = undefined;
  return NextResponse.json(p);
}
export async function PATCH(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const g = await requireProject(id); if (g instanceof Response) return g;
  const b = await req.json();
  const before = { style: g.p.style, customStyle: g.p.customStyle, narratorVoice: g.p.narratorVoice, music: g.p.music, script: g.p.script };
  try {
    const p = await db.update(id, (x) => {
      for (const k of EDITABLE) if (k in b) (x as unknown as Record<string, unknown>)[k] = b[k];
      if ("style" in b || "aspect" in b) x.bible = buildBible(x);
    });
    const changed = (["style", "customStyle", "narratorVoice", "music"] as const).filter((k) => k in b && b[k] !== before[k]);
    if (changed.length) learn(g.user.id, p, { kind: "settings", detail: changed.map((k) => `${k}: ${String(before[k] ?? "")} → ${String(b[k])}`).join("; ") });
    if ("script" in b && typeof b.script === "string" && b.script !== before.script && before.script) learn(g.user.id, p, { kind: "script_edit", before: before.script, after: b.script });
    return NextResponse.json(p);
  } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }
}
/** Delete the project and everything it produced (owner or admin). Running jobs are cancelled first. */
export async function DELETE(_: Request, { params }: Ctx) {
  const id = (await params).id;
  const g = await requireProject(id); if (g instanceof Response) return g;
  return NextResponse.json(await purgeProject(id));
}
