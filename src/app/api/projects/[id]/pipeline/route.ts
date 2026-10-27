import { NextResponse } from "next/server";
import { requireProject } from "@/lib/guard";
import { contributorOn, getConfig, llmChain, providerName, type LlmTask } from "@/lib/config";
import { endpoint, metaLive } from "@/lib/providers/meta";
import { samOn } from "@/lib/providers/sam";
import { ttsProvider } from "@/lib/providers/tts";
import { chain } from "@/lib/providers/videoProviders";
import { projectTrace } from "@/lib/usage";
import { isApproved, isDraft } from "@/lib/types";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Meta-built models: anything served by the Meta Model API, plus Meta's open Muse Spark weights on Baseten. */
const isMeta = (provider: string, model: string) => provider === "Meta Muse" || /muse|^meta-models\//i.test(model);

/** Process view: which model did each step of this project (from the run log), and which will run next (from routing). */
export async function GET(_: Request, { params }: Ctx) {
  const g = await requireProject((await params).id); if (g instanceof Response) return g;
  const p = g.p;
  const rows = projectTrace(p.id);
  const plannedLlm = (t: LlmTask, vision = false) => { const w = llmChain(t)[0]; if (!w) return { provider: "Demo", model: "offline planner", meta: false }; const e = endpoint(w, { task: t, vision }); return { provider: providerName(w), model: e.model, meta: isMeta(providerName(w), e.model) }; };
  const img = metaLive() ? { provider: "Meta Muse", model: getConfig("META_IMAGE_MODEL") || "muse-image-1.0", meta: true } : { provider: "Demo", model: "placeholder images (add a Meta key)", meta: false };
  const shots = p.scenes.flatMap((s) => s.shots);
  const live = p.assets.filter((a) => !isDraft(a)); const chars = live.filter((a) => a.kind === "character");
  const reviewed = shots.filter((s) => s.continuity);
  const open = reviewed.filter((s) => s.continuity && !s.continuity.ok);
  const stages = [
    { id: "idea", title: "Idea & research", steps: ["idea", "research"], done: !!p.idea || p.brainstorm.some((m) => m.role === "assistant"), detail: p.idea ? "Idea chosen" : `${p.brainstorm.length} brainstorm messages`, planned: [plannedLlm("director")] },
    { id: "screenplay", title: "Screenplay", steps: ["screenplay"], done: !!p.script.trim(), detail: p.script ? `${p.script.split(/\s+/).length} words` : "Not written yet", planned: [plannedLlm("director")] },
    { id: "references", title: "Character bible & approved references", steps: ["bible", "references"], done: live.length > 0 && live.every(isApproved), detail: live.length ? `${live.filter(isApproved).length}/${live.length} references approved (auto-approved when the review passes)${live.some((a) => a.refState === "attention") ? ` · needs you: ${live.filter((a) => a.refState === "attention").map((a) => a.name).join(", ")}` : ""}` : "No characters yet", planned: [plannedLlm("director"), img] },
    { id: "shots", title: "Connected shots", steps: ["shots", "video"], done: shots.length > 0 && shots.every((s) => s.activeStart), detail: shots.length ? `${shots.filter((s) => s.activeStart).length}/${shots.length} shots framed (each frame conditioned on the approved references + the previous shot)` : "No shot list yet", planned: [plannedLlm("director"), img, ...(p.outputType === "video" ? [{ provider: "Video", model: chain(p.videoProvider)[0]?.name || "Demo motion", meta: false }] : [])] },
    { id: "continuity", title: "Continuity review", steps: ["continuity"], done: shots.length > 0 && reviewed.length === shots.length, detail: reviewed.length ? `${reviewed.length}/${shots.length} reviewed automatically · ${shots.filter((s) => s.continuity?.state === "fixed").length} auto-fixed · ${shots.filter((s) => s.continuity?.state === "attention").length} need attention` : "Runs automatically after shots are generated", planned: [plannedLlm("review", true), ...(samOn() ? [{ provider: "Meta Muse", model: "sam-3.1 (person segmentation)", meta: true }] : [])] },
    { id: "fix", title: "Targeted fix", steps: ["fix"], done: reviewed.length > 0 && open.length === 0, detail: open.length ? `${open.length} shot(s) still flagged` : reviewed.length ? "No open issues" : "Automatic Muse Image edit when a review fails", planned: [img] },
    { id: "export", title: "Voice & export", steps: ["voice", "export"], done: p.render.status === "done", detail: p.render.status === "done" ? "Exported" : p.render.status === "running" || p.render.status === "queued" ? p.render.message : "Not exported yet", planned: [{ provider: "Voice", model: ttsProvider().id, meta: false }, { provider: "FFmpeg", model: "local render", meta: false }] },
  ];
  const out = stages.map((s) => {
    const mine = rows.filter((r) => s.steps.includes(r.step || ""));
    const used = Object.values(mine.reduce((m, r) => { const k = `${r.provider}·${r.model}`; const a = (m[k] ||= { provider: r.provider, model: r.model, meta: isMeta(r.provider, r.model), calls: 0, tokens: 0, images: 0, usd: 0, last: r.at }); a.calls++; a.tokens += r.in + r.out; a.images += r.images || 0; a.usd += r.usd; a.last = r.at; return m; }, {} as Record<string, { provider: string; model: string; meta: boolean; calls: number; tokens: number; images: number; usd: number; last: string }>));
    return { ...s, used };
  });
  const metaCalls = rows.filter((r) => isMeta(r.provider, r.model)).length;
  return NextResponse.json({ stages: out, contributor: contributorOn(), totals: { calls: rows.length, metaCalls, usd: +rows.reduce((a, r) => a + r.usd, 0).toFixed(4) } });
}
