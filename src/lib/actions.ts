/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { db } from "./db";
import * as S from "./studio";
import * as R from "./render";
import { WRITING, setRunner } from "./jobs";
import { enterStep } from "./usage";
// which pipeline step each action belongs to (feeds the “Built with Meta” pipeline view)
const STEP: Record<string, string> = { useIdea: "idea", writeScript: "screenplay", extractAssets: "bible", autofillAsset: "bible", assetImage: "references", autocreateAssets: "references", buildStoryboard: "shots", frame: "shots", autofillFrames: "shots", clip: "video", clipAll: "video", continuity: "continuity", continuityAll: "continuity", fixContinuity: "fix", expandSpec: "bible", lockAsset: "references", voiceShot: "voice", voiceAll: "voice", render: "export", aiEdit: "export" };

export type ActionResult = { status: number; body: Record<string, unknown> };
const J = (body: Record<string, unknown>, init?: { status: number }): ActionResult => ({ status: init?.status || 200, body });

/** Run one studio action (server-side; used directly by the route and by durable background jobs). */
export async function runAction(id: string, b: Record<string, any>): Promise<ActionResult> {
  const p = db.getProject(id);
  if (!p) return J({ error: "not found" }, { status: 404 });
  if (STEP[b.action]) enterStep(id, STEP[b.action]);
  try {
    let result: unknown = null;
    switch (b.action) {
      case "useIdea": await db.update(id, (x) => { const i = b.idea || {}; x.idea = [i.title && `${i.title}: `, i.logline, i.hook && `Hook: ${i.hook}`, i.beats?.length && `Beats:\n- ${i.beats.join("\n- ")}`, i.characters?.length && `Characters:\n- ${i.characters.map((c: { name: string; description: string }) => `${c.name} — ${c.description}`).join("\n- ")}`].filter(Boolean).join("\n"); if (i.title && (!x.title || x.title === "Untitled project")) x.title = i.title; }); break;
      case "clearBrainstorm": await db.update(id, (x) => { x.brainstorm = []; }); break;
      case "deleteResearch": await db.update(id, (x) => { x.research = (x.research || []).filter((r) => r.id !== b.researchId); }); break;
      case "writeScript": await db.update(id, (x) => { x.writing = Date.now(); }); WRITING.add(id); try { result = await S.writeScript(p, String(b.prompt || "")); } finally { WRITING.delete(id); await db.update(id, (x) => { x.writing = undefined; }); } break;
      case "extractAssets": result = await S.extractAssets(p); break;
      case "addAsset": await db.update(id, (x) => { x.assets.push({ id: nanoid(8), kind: b.kind, name: b.name || "New " + b.kind, description: "", details: "", images: [], voice: b.kind === "character" ? "en-US-AriaNeural" : undefined }); x.bible = S.buildBible(x); }); break;
      case "updateAsset": await db.update(id, (x) => { const a = x.assets.find((y) => y.id === b.assetId); if (a) { for (const k of a.locked ? ["name", "voice"] : ["name", "description", "details", "voice", "activeImage"]) if (k in b.patch) (a as unknown as Record<string, unknown>)[k] = b.patch[k]; if ("activeImage" in b.patch && !a.locked) { a.approved = true; a.refState = undefined; } if (!a.locked && ("description" in b.patch || "details" in b.patch)) a.spec = undefined; } x.bible = S.buildBible(x); }); break;
      case "deleteAsset": await db.update(id, (x) => { x.assets = x.assets.filter((a) => a.id !== b.assetId); x.scenes.forEach((s) => s.shots.forEach((sh) => (sh.assetIds = sh.assetIds.filter((a) => a !== b.assetId)))); x.bible = S.buildBible(x); }); break;
      case "assetImage": result = await S.assetImage(p, b.assetId, b.prompt || ""); await S.reviewReference(id, b.assetId); break;
      case "expandSpec": result = await S.expandSpec(p, b.assetId); break;
      case "lockAsset": await S.lockAsset(p, b.assetId, b.locked !== false); break;
      case "autoContinuity": await S.autoContinuity(id, b.shotId ? [b.shotId] : undefined); break;
      case "autofillAsset": result = await S.autofillAsset(p, b.assetId); break;
      case "autocreateAssets": result = await S.autocreateAndAdvance(id); break;
      case "approveAsset": await db.update(id, (x) => { const a = x.assets.find((y) => y.id === b.assetId); if (a) { a.approved = b.approved !== false; if (a.approved) a.refState = a.refState === "attention" ? "passed" : a.refState; } }); break;
      case "buildStoryboard": result = await S.buildStoryboard(p); break;
      case "frame": result = await S.generateFrame(p, b.shotId, b.which === "end" ? "end" : "start", b.prompt || undefined); await S.autoContinuity(id, [b.shotId]); break;
      case "autofillFrames": {
        const shots = p.scenes.flatMap((s) => s.shots).filter((sh) => !sh.activeStart).slice(0, b.limit || 50);
        for (const sh of shots) { await S.generateFrame(db.getProject(id)!, sh.id, "start"); if (b.withEnd) await S.generateFrame(db.getProject(id)!, sh.id, "end"); }
        result = { generated: shots.length }; await S.autoContinuity(id); break;
      }
      case "selectVersion": await db.update(id, (x) => { const sh = S.findShot(x, b.shotId); if (b.which === "end") sh.activeEnd = b.versionId; else sh.activeStart = b.versionId; sh.continuity = undefined; }); break;
      case "updateShot": await db.update(id, (x) => { const sh = S.findShot(x, b.shotId); const prevDur = sh.durationSec; for (const k of ["description", "camera", "dialogue", "narration", "speaker", "durationSec", "assetIds", "trimStart", "trimEnd"]) if (k in b.patch) (sh as unknown as Record<string, unknown>)[k] = b.patch[k]; if ("dialogue" in b.patch || "narration" in b.patch) sh.audioUrl = undefined; if ("durationSec" in b.patch && Number(b.patch.durationSec) !== prevDur) sh.durationLocked = true; }); break;
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
      case "clip": result = await R.queueClips(id, [b.shotId]); break;
      case "clipAll": result = await R.queueClips(id, p.scenes.flatMap((s) => s.shots).filter((s) => s.activeStart && (b.all || !s.clipUrl)).map((s) => s.id)); break;
      case "videoEstimate": result = R.videoEstimate(p); break;
      case "render": {
        if (p.render.status === "running") break;
        await db.update(id, (x) => { x.render = { status: "queued", progress: 0, message: "Queued", updatedAt: new Date().toISOString() }; });
        void R.renderProject(id);
        break;
      }
      case "aiEdit": result = await R.aiEdit(p, String(b.prompt || "")); break;
      case "addNote": await db.update(id, (x) => { const at = new Date().toISOString(); (x.research ||= []).push({ id: nanoid(8), goal: String(b.goal || "Research"), notes: String(b.note || ""), at, provider: b.provider }); x.brainstorm.push({ role: "assistant", kind: "note", content: `📎 Research notes attached: ${String(b.goal || "Research")}`, at }); }); break;
      default: return J({ error: "unknown action" }, { status: 400 });
    }
    return J({ ok: true, result, project: db.getProject(id) });
  } catch (e) {
    console.error(e);
    return J({ error: (e as Error).message, project: db.getProject(id) }, { status: 500 });
  }
}

setRunner((projectId, body) => runAction(projectId, body));
