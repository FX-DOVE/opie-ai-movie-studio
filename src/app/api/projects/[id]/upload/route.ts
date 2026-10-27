import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, mediaUrl, projectMediaDir } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const IMG = /^image\/(png|jpe?g|webp)$/;

/** Upload your own character/location/prop reference (Flow can't), or a script file (.txt/.fountain/.md). */
export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const p = db.getProject(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "file too large (15MB max)" }, { status: 413 });
  const kind = String(fd.get("kind") || "asset");
  if (kind === "script") {
    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    await db.update(id, (x) => { x.script = text; });
    return NextResponse.json({ ok: true, project: db.getProject(id) });
  }
  if (!IMG.test(file.type)) return NextResponse.json({ error: "png, jpg or webp only" }, { status: 415 });
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const out = path.join(projectMediaDir(id), `upload-${nanoid(6)}.${ext}`);
  fs.writeFileSync(out, Buffer.from(await file.arrayBuffer()));
  const v = { id: nanoid(8), url: mediaUrl(out), prompt: "Uploaded reference: " + file.name, createdAt: new Date().toISOString(), source: "upload" as const };
  await db.update(id, (x) => {
    if (kind === "asset") { const a = x.assets.find((y) => y.id === fd.get("assetId")); if (a) { a.images.push(v); a.activeImage = v.id; a.approved = false; a.refState = undefined; } }
    else if (kind === "frame") {
      const sh = x.scenes.flatMap((s) => s.shots).find((s) => s.id === fd.get("shotId"));
      if (sh) { if (fd.get("which") === "end") { sh.endFrame.push(v); sh.activeEnd = v.id; } else { sh.startFrame.push(v); sh.activeStart = v.id; } }
    }
  });
  return NextResponse.json({ ok: true, project: db.getProject(id) });
}
