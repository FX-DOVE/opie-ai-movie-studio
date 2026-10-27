import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { startJob } from "@/lib/jobs";
import * as S from "@/lib/studio";
import * as R from "@/lib/render";

import { WRITING } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (req.headers.get("x-job")) { const text = await req.text(); const id = startJob(() => handle(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: text }), ctx)); return NextResponse.json({ job: id }, { status: 202 }); }
  return handle(req, ctx);
}
async function handle(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const p = db.getProject(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  try {
    let result: unknown = null;
    switch (b.action) {
      case "useIdea": await db.update(id, (x) => { const i = b.idea || {}; x.idea = [i.title && `${i.title}: `, i.logline, i.hook && `Hook: ${i.hook}`, i.beats?.length && `Beats:\n- ${i.beats.join("\n- ")}`, i.characters?.length && `Characters:\n- ${i.characters.map((c: { name: string; description: string }) => `${c.name} — ${c.description}`).join("\n- ")}`].filter(Boolean).join("\n"); if (i.title && (!x.title || x.title === "Untitled project")) x.title = i.title; }); break;
      case "clearBrainstorm": await db.update(id, (x) => { x.brainstorm = []; }); break;
      case "deleteResearch": await db.update(id, (x) => { x.research = (x.research || []).filter((r) => r.id !== b.researchId); }); break;
      case "writeScript": await db.update(id, (x) => { x.writing = Date.now(); }); WRITING.add(id); try { result = await S.writeScript(p, String(b.prompt || "")); } finally { WRITING.delete(id); await db.update(id, (x) => { x.writing = undefined; }); } break;
      case "extractAssets": result = await S.extractAssets(p); break;
      case "addAsset": await db.update(id, (x) => { x.assets.push({ id: nanoid(8), kind: b.kind, name: b.name || "New " + b.kind, description: "", details: "", images: [], voice: b.kind === "character" ? "en-US-AriaNeural" : undefined }); x.bible = S.buildBible(x); }); break;
      case "updateAsset": await db.update(id, (x) => { const a = x.assets.find((y) => y.id === b.assetId); if (a) { for (const k of ["name", "description", "details", "voice", "activeImage"]) if (k in b.patch) (a as unknown as Record<string, unknown>)[k] = b.patch[k]; } x.bible = S.buildBible(x); }); break;
      case "deleteAsset": await db.update(id, (x) => { x.assets = x.assets.filter((a) => a.id !== b.assetId); x.scenes.forEach((s) => s.shots.forEach((sh) => (sh.assetIds = sh.assetIds.filter((a) => a !== b.assetId)))); x.bible = S.buildBible(x); }); break;
      case "assetImage": result = await S.assetImage(p, b.assetId, b.prompt || ""); break;
      case "autofillAsset": result = await S.autofillAsset(p, b.assetId); break;
      case "autocreateAssets": { for (const a of p.assets.filter((a) => !a.activeImage)) await S.assetImage(db.getProject(id)!, a.id); break; }
      case "buildStoryboard": result = await S.buildStoryboard(p); break;
      case "frame": result = await S.generateFrame(p, b.shotId, b.which === "end" ? "end" : "start", b.prompt || undefined); break;
      case "autofillFrames": {
        const shots = p.scenes.flatMap((s) => s.shots).filter((sh) => !sh.activeStart).slice(0, b.limit || 50);
        for (const sh of shots) { await S.generateFrame(db.getProject(id)!, sh.id, "start"); if (b.withEnd) await S.generateFrame(db.getProject(id)!, sh.id, "end"); }
        result = { generated: shots.length }; break;
      }
      case "selectVersion": await db.update(id, (x) => { const sh = S.findShot(x, b.shotId); if (b.which === "end") sh.activeEnd = b.versionId; else sh.activeStart = b.versionId; sh.continuity = undefined; }); break;
      case "updateShot": await db.update(id, (x) => { const sh = S.findShot(x, b.shotId); for (const k of ["description", "camera", "dialogue", "narration", "speaker", "durationSec", "assetIds", "trimStart", "trimEnd"]) if (k in b.patch) (sh as unknown as Record<string, unknown>)[k] = b.patch[k]; if ("dialogue" in b.patch || "narration" in b.patch) sh.audioUrl = undefined; }); break;
      case "addShot": await db.update(id, (x) => { const sc = x.scenes.find((s) => s.id === b.sceneId); if (sc) sc.shots.push({ id: nanoid(8), index: 0, description: "New shot", camera: "Medium shot", durationSec: 4, assetIds: [], startFrame: [], endFrame: [] }); x.scenes.flatMap((s) => s.shots).forEach((s, i) => (s.index = i)); }); break;
      case "deleteShot": await db.update(id, (x) => { x.scenes.forEach((s) => (s.shots = s.shots.filter((sh) => sh.id !== b.shotId))); x.scenes.flatMap((s) => s.shots).forEach((s, i) => (s.index = i)); }); break;
      case "reorder": await db.update(id, (x) => {
        const all = new Map(x.scenes.flatMap((s) => s.shots).map((s) => [s.id, s]));
        const order: string[] = b.order; let k = 0;
        for (const s of x.scenes) { const n = s.shots.length; s.shots = []; for (let i = 0; i < n && k < order.length; i++, k++) { const sh = all.get(order[k]); if (sh) s.shots.push(sh); } }
        x.scenes.flatMap((s) => s.shots).forEach((s, i) => (s.index = i));
      }); break;
      case "continuity": result = await S.checkContinuity(p, b.shotId); break;
      case "continuityAll": { const out = []; for (const sh of p.scenes.flatMap((s) => s.shots)) out.push({ shotId: sh.id, ...(await S.checkContinuity(db.getProject(id)!, sh.id)) }); result = out; break; }
      case "fixContinuity": result = await S.fixContinuity(p, b.shotId); break;
      case "voiceShot": result = await R.voiceShot(p, b.shotId); break;
      case "voiceAll": result = await R.voiceAll(p); break;
      case "clip": result = await R.clipShot(p, b.shotId); break;
      case "clipAll": { const out = []; for (const sh of p.scenes.flatMap((s) => s.shots).filter((s) => s.activeStart)) out.push(await R.clipShot(db.getProject(id)!, sh.id)); result = out; break; }
      case "render": {
        if (p.render.status === "running") break;
        await db.update(id, (x) => { x.render = { status: "queued", progress: 0, message: "Queued", updatedAt: new Date().toISOString() }; });
        void R.renderProject(id);
        break;
      }
      case "aiEdit": result = await R.aiEdit(p, String(b.prompt || "")); break;
      case "addNote": await db.update(id, (x) => { const at = new Date().toISOString(); (x.research ||= []).push({ id: nanoid(8), goal: String(b.goal || "Research"), notes: String(b.note || ""), at, provider: b.provider }); x.brainstorm.push({ role: "assistant", kind: "note", content: `📎 Research notes attached: ${String(b.goal || "Research")}`, at }); }); break;
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result, project: db.getProject(id) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message, project: db.getProject(id) }, { status: 500 });
  }
}
