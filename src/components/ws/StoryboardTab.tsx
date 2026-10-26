"use client";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clapperboard, ImagePlus, Mic, Plus, ShieldCheck, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import type { Shot } from "@/lib/types";
import { Drawer, SourceBadge, Spinner } from "../ui";
import { PromptBar } from "./PromptBar";
import { active, ratio, shotsOf, type TabProps } from "./common";

export function StoryboardTab(props: TabProps & { next: () => void }) {
  const { p, act, busy, next } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [which, setWhich] = useState<"start" | "end">("start");
  const shots = shotsOf(p);
  const open = shots.find((s) => s.id === openId);
  const framed = shots.filter((s) => s.activeStart).length;
  const flagged = shots.filter((s) => s.continuity && !s.continuity.ok).length;
  const cols = p.aspect === "9:16" || p.aspect === "4:5" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8" : "grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

  return (
    <>
      <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Storyboard</h2>
              <p className="mt-0.5 text-sm text-ink-400">{shots.length ? `${p.scenes.length} scenes · ${shots.length} shots · ${framed} framed${flagged ? ` · ${flagged} continuity flags` : ""}` : "The director agent turns your script into a shot list with start and end frames."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" disabled={!p.script || busy.has("buildStoryboard")} onClick={() => { if (!shots.length || confirm("Rebuild the shot list? Existing frames will be replaced.")) act("buildStoryboard"); }}>{busy.has("buildStoryboard") ? <Spinner /> : <Clapperboard className="h-4 w-4" />}{shots.length ? "Rebuild" : "Build shot list"}</button>
              <button className="btn-outline" disabled={!shots.length || busy.has("autofillFrames")} onClick={() => act("autofillFrames", { withEnd: p.outputType === "video" })}>{busy.has("autofillFrames") ? <Spinner /> : <Sparkles className="h-4 w-4" />} Autofill frames</button>
              <button className="btn-outline" disabled={!framed || busy.has("continuityAll")} onClick={() => act("continuityAll")}>{busy.has("continuityAll") ? <Spinner /> : <ShieldCheck className="h-4 w-4" />} Check continuity</button>
              <button className="btn-brand" disabled={!framed} onClick={next}>Video <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>

          {!shots.length && (
            <div className="panel mt-8 grid place-items-center gap-3 p-10 text-center">
              <Clapperboard className="h-8 w-8 text-ink-600" />
              <p className="max-w-md text-sm text-ink-400">Build the shot list from your script. Every shot gets a camera direction, dialogue or narration, linked cast references, and start/end frames.</p>
            </div>
          )}

          {p.scenes.map((sc, si) => (
            <section key={sc.id} className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="badge bg-white/[0.06] text-ink-300">Scene {si + 1}</span>
                <h3 className="font-mono text-sm font-semibold uppercase tracking-wide">{sc.heading}</h3>
                <span className="text-xs text-ink-400">{sc.shots.length} frames</span>
                <button className="btn-ghost ml-auto h-8" onClick={() => act("addShot", { sceneId: sc.id })}><Plus className="h-4 w-4" />Frame</button>
              </div>
              <div className={`grid gap-3 ${cols}`}>
                {sc.shots.map((sh) => <ShotCard key={sh.id} sh={sh} aspect={p.aspect} busy={busy.has("frame-" + sh.id)} onOpen={() => { setOpenId(sh.id); setWhich("start"); }} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
      {open && <PromptBar busy={busy.has("frame-" + open.id)} placeholder={`Shot ${open.index + 1} (${which} frame): tell it what to change…`} onSubmit={(v) => act("frame", { shotId: open.id, which, prompt: v }, { busyKey: "frame-" + open.id })} hint="The image model edits the selected frame and keeps everything else identical." />}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `Shot ${open.index + 1} · ${open.camera}` : ""} wide>
        {open && <ShotEditor key={open.id} sh={open} which={which} setWhich={setWhich} {...props} onDeleted={() => setOpenId(null)} />}
      </Drawer>
    </>
  );
}

function ShotCard({ sh, aspect, busy, onOpen }: { sh: Shot; aspect: string; busy: boolean; onOpen: () => void }) {
  const img = active(sh.startFrame, sh.activeStart);
  const end = active(sh.endFrame, sh.activeEnd);
  return (
    <button onClick={onOpen} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850 text-left transition hover:border-white/25">
      <div className="relative bg-ink-800" style={{ aspectRatio: ratio(aspect) }}>
        {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-ink-600"><ImagePlus className="h-7 w-7" /></div>}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/55"><Spinner className="h-6 w-6" /></div>}
        <span className="absolute left-2 top-2 badge bg-black/60 text-white">{sh.index + 1}</span>
        {end && <img src={end.url} alt="" className="absolute bottom-2 right-2 h-[28%] rounded-md border border-white/40 object-cover shadow-lg" style={{ aspectRatio: ratio(aspect) }} />}
        {sh.continuity && <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full ${sh.continuity.ok ? "bg-emerald-500/90" : "bg-amber-500/90"}`}>{sh.continuity.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-white" /> : <AlertTriangle className="h-3.5 w-3.5 text-white" />}</span>}
      </div>
      <div className="space-y-1 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400"><span className="truncate">{sh.camera}</span><span className="ml-auto shrink-0">{sh.durationSec}s</span>{sh.audioUrl && <Mic className="h-3 w-3 text-sky-glow" />}</div>
        <p className="line-clamp-2 text-xs leading-snug text-ink-300">{sh.dialogue ? <><b className="text-white/90">{sh.speaker}:</b> {sh.dialogue}</> : sh.narration ? <><b className="text-white/90">VO:</b> {sh.narration}</> : sh.description}</p>
      </div>
    </button>
  );
}

function ShotEditor({ sh, which, setWhich, p, act, busy, setP, toast, onDeleted }: TabProps & { sh: Shot; which: "start" | "end"; setWhich: (w: "start" | "end") => void; onDeleted: () => void }) {
  const [f, setF] = useState({ description: sh.description, camera: sh.camera, dialogue: sh.dialogue || "", narration: sh.narration || "", durationSec: sh.durationSec });
  const list = which === "start" ? sh.startFrame : sh.endFrame;
  const img = active(list, which === "start" ? sh.activeStart : sh.activeEnd);
  const key = "frame-" + sh.id;
  const save = (patch: Record<string, unknown>) => act("updateShot", { shotId: sh.id, patch }, { busyKey: "save" });
  const upload = async (file: File) => {
    const fd = new FormData(); fd.set("file", file); fd.set("kind", "frame"); fd.set("shotId", sh.id); fd.set("which", which);
    const r = await fetch(`/api/projects/${p.id}/upload`, { method: "POST", body: fd });
    const j = await r.json(); if (j.project) { setP(j.project); toast("Frame uploaded"); } else toast(j.error, true);
  };
  return (
    <div className="space-y-5">
      <div className="flex rounded-xl border border-white/10 p-0.5">
        {(["start", "end"] as const).map((w) => <button key={w} onClick={() => setWhich(w)} className={`btn h-8 flex-1 ${which === w ? "bg-white/10 text-white" : "text-ink-400"}`}>{w === "start" ? "Start frame" : "End frame"}</button>)}
      </div>
      <div className="relative mx-auto overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-800" style={{ aspectRatio: ratio(p.aspect), maxHeight: "52dvh" }}>
        {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-400">No {which} frame yet</div>}
        {busy.has(key) && <div className="absolute inset-0 grid place-items-center bg-black/60"><Spinner className="h-7 w-7" /></div>}
        <span className="absolute left-3 top-3"><SourceBadge source={img?.source} /></span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-brand h-10" disabled={busy.has(key)} onClick={() => act("frame", { shotId: sh.id, which }, { busyKey: key })}><Sparkles className="h-4 w-4" />{img ? "Regenerate" : "Create image"}</button>
        <label className="btn-outline h-10 cursor-pointer"><Upload className="h-4 w-4" />Upload<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      </div>
      {img && <ChangeBox busy={busy.has(key)} onGo={(v) => act("frame", { shotId: sh.id, which, prompt: v }, { busyKey: key })} />}
      {list.length > 0 && (
        <div>
          <span className="label">History</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...list].reverse().map((v) => (
              <button key={v.id} title={v.prompt} onClick={() => act("selectVersion", { shotId: sh.id, which, versionId: v.id })} className={`relative h-16 shrink-0 overflow-hidden rounded-lg border-2 ${v.id === img?.id ? "border-brand-400" : "border-transparent opacity-70 hover:opacity-100"}`} style={{ aspectRatio: ratio(p.aspect) }}>
                <img src={v.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.07] p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-400" /><span className="text-sm font-semibold">Continuity</span>
          {sh.continuity && <SourceBadge source={sh.continuity.source} />}
          <button className="btn-ghost ml-auto h-8" disabled={busy.has("continuity") || !sh.activeStart} onClick={() => act("continuity", { shotId: sh.id })}>{busy.has("continuity") ? <Spinner /> : "Check"}</button>
        </div>
        {sh.continuity ? (
          sh.continuity.ok ? <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Matches the production bible.</p> : (
            <div className="mt-2 space-y-2">
              <ul className="space-y-1 text-sm text-amber-200">{sh.continuity.issues.map((i, k) => <li key={k} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{i}</li>)}</ul>
              <button className="btn-brand h-9" disabled={busy.has("fixContinuity")} onClick={() => act("fixContinuity", { shotId: sh.id })}>{busy.has("fixContinuity") ? <Spinner /> : <Wand2 className="h-4 w-4" />} One-click fix</button>
            </div>
          )
        ) : <p className="mt-2 text-xs text-ink-400">The vision model compares this frame against the linked reference sheets (face, skin tone, hair, wardrobe, makeup, watches, props, location).</p>}
      </div>

      <div className="space-y-4">
        <div><span className="label">Frame description</span><textarea className="input min-h-24" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} onBlur={() => save({ description: f.description })} /></div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div><span className="label">Camera</span><input className="input" value={f.camera} onChange={(e) => setF({ ...f, camera: e.target.value })} onBlur={() => save({ camera: f.camera })} /></div>
          <div><span className="label">Seconds</span><input type="number" min={1} max={30} className="input" value={f.durationSec} onChange={(e) => setF({ ...f, durationSec: +e.target.value })} onBlur={() => save({ durationSec: f.durationSec })} /></div>
        </div>
        {sh.narration !== undefined ? (
          <div><span className="label">Narration</span><textarea className="input min-h-20" value={f.narration} onChange={(e) => setF({ ...f, narration: e.target.value })} onBlur={() => save({ narration: f.narration })} /></div>
        ) : (
          <div><span className="label">Dialogue {sh.speaker ? `· ${sh.speaker}` : ""}</span><textarea className="input min-h-16" value={f.dialogue} onChange={(e) => setF({ ...f, dialogue: e.target.value })} onBlur={() => save({ dialogue: f.dialogue })} placeholder="No dialogue" /></div>
        )}
        {(sh.dialogue || sh.narration) && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-outline" disabled={busy.has("voiceShot")} onClick={() => act("voiceShot", { shotId: sh.id })}>{busy.has("voiceShot") ? <Spinner /> : <Mic className="h-4 w-4" />}{sh.audioUrl ? "Re-voice" : "Generate voice"}</button>
            {sh.audioUrl && <audio controls src={sh.audioUrl} className="h-9 min-w-0 flex-1" />}
          </div>
        )}
        <div>
          <span className="label">Reference assets in this shot</span>
          <div className="flex flex-wrap gap-1.5">
            {p.assets.map((a) => {
              const on = sh.assetIds.includes(a.id);
              return <button key={a.id} onClick={() => save({ assetIds: on ? sh.assetIds.filter((x) => x !== a.id) : [...sh.assetIds, a.id] })} className={`chip ${on ? "chip-on" : ""}`}>{active(a.images, a.activeImage) && <img src={active(a.images, a.activeImage)!.url} alt="" className="h-5 w-5 rounded-full object-cover" />}{a.name}</button>;
            })}
          </div>
        </div>
        <button className="btn-ghost text-red-300 hover:text-red-200" onClick={async () => { if (confirm("Delete this shot?")) { await act("deleteShot", { shotId: sh.id }); onDeleted(); } }}><Trash2 className="h-4 w-4" />Delete shot</button>
      </div>
    </div>
  );
}

function ChangeBox({ busy, onGo }: { busy: boolean; onGo: (v: string) => void }) {
  const [v, setV] = useState("");
  const go = () => { if (v.trim()) { onGo(v); setV(""); } };
  return (
    <div className="flex gap-2">
      <input className="input h-10" placeholder="Tell it what to change… (e.g. make her cry, keep the red gele)" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button className="btn-outline h-10" disabled={busy || !v.trim()} onClick={go}><Wand2 className="h-4 w-4" />Edit</button>
    </div>
  );
}
