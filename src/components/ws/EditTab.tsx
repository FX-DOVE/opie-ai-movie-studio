"use client";
import { ChevronLeft, ChevronRight, Download, Music, RefreshCw, Subtitles, PenLine } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { Spinner, Segmented } from "../ui";
import { PromptBar } from "./PromptBar";
import { active, ratio, shotsOf, type TabProps } from "./common";

export function EditTab({ p, act, busy, patch }: TabProps & { patch: (b: Partial<Project>) => void }) {
  const shots = shotsOf(p);
  const [sel, setSel] = useState<string | null>(shots[0]?.id || null);
  const cur = shots.find((s) => s.id === sel);
  const r = p.render;
  const rendering = ["queued", "running"].includes(r.status);
  const total = shots.reduce((n, s) => n + s.durationSec - (s.trimStart || 0) - (s.trimEnd || 0), 0);
  const move = (id: string, d: -1 | 1) => {
    const ids = shots.map((s) => s.id); const i = ids.indexOf(id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act("reorder", { order: ids });
  };
  const portrait = p.aspect === "9:16" || p.aspect === "4:5";

  return (
    <>
      <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <div className="panel overflow-hidden">
              <div className={`relative mx-auto bg-black ${portrait ? "max-w-[380px]" : ""}`} style={{ aspectRatio: ratio(p.aspect) }}>
                {r.status === "done" && r.url ? <video key={r.url} src={r.url} controls playsInline className="absolute inset-0 h-full w-full">{r.srtUrl && !p.subtitles && <track kind="subtitles" srcLang="en" label="English" src={r.srtUrl.replace(/\.srt$/, ".vtt")} />}</video> : (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    {rendering ? <div className="w-full max-w-xs space-y-3"><Spinner className="mx-auto h-7 w-7" /><p className="text-sm text-ink-300">{r.message}</p><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-brand-500 transition-all" style={{ width: `${r.progress}%` }} /></div><p className="text-[11px] text-ink-500">Rendering on the server — you can close this page and come back.</p></div>
                      : r.status === "error" ? <p className="text-sm text-red-300">Render failed: {r.message}</p>
                      : <p className="text-sm text-ink-400">Assemble your film to preview it here.</p>}
                  </div>
                )}
              </div>
              {!!r.warnings?.length && !rendering && (
                <div role="alert" className="space-y-1 border-t border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {r.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] p-3">
                <span className="text-xs text-ink-400">{shots.length} shots · ~{total.toFixed(0)}s · {p.aspect}{(() => { const c = shots.filter((s) => s.clarity); return c.length ? ` · dialogue ${c.filter((s) => s.clarity!.ok).length}/${c.length} clear` : ""; })()}</span>
                <div className="ml-auto flex gap-2">
                  <button className="btn-outline" disabled={rendering || !shots.length} onClick={() => act("render")}>{rendering ? <Spinner /> : <RefreshCw className="h-4 w-4" />}{r.status === "done" ? "Re-render" : "Render"}</button>
                  {r.status === "done" && r.url && <a className="btn-brand" href={r.url} download={`${p.title.replace(/[^\w-]+/g, "_")}.mp4`}><Download className="h-4 w-4" />Export MP4</a>}
                  {r.status === "done" && r.srtUrl && <a className="btn-outline" href={r.srtUrl} download={`${p.title.replace(/[^\w-]+/g, "_")}.srt`}>Subtitles</a>}
                </div>
              </div>
            </div>

            <div className="panel p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Timeline</span><span className="text-xs text-ink-400">Tap a shot to trim · arrows to reorder</span></div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {shots.map((sh) => {
                  const img = active(sh.startFrame, sh.activeStart);
                  const len = sh.durationSec - (sh.trimStart || 0) - (sh.trimEnd || 0);
                  return (
                    <button key={sh.id} onClick={() => setSel(sh.id)} style={{ width: Math.max(84, len * 26) }} className={`relative h-24 shrink-0 overflow-hidden rounded-xl border-2 bg-ink-800 transition ${sel === sh.id ? "border-brand-400" : "border-transparent hover:border-white/20"}`}>
                      {img && <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 px-2 py-1 text-[10px] font-semibold"><span>{sh.index + 1}</span><span>{len.toFixed(1)}s</span></div>
                      {sh.audioUrl && <div className="absolute inset-x-0 top-0 h-1 bg-sky-glow/80" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-400"><span className="h-1 w-4 rounded bg-sky-glow/80" />voice <span className="ml-3">{p.music !== "none" ? `♪ ${p.music} music bed` : "no music"}</span><span className="ml-3">{p.subtitles ? "subtitles on" : "subtitles off"}</span></div>
              {cur && (
                <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-[auto_1fr_1fr_1fr] sm:items-end">
                  <div className="flex gap-1">
                    <button className="btn-outline h-10 w-10 px-0" onClick={() => move(cur.id, -1)} aria-label="Move left"><ChevronLeft className="h-4 w-4" /></button>
                    <button className="btn-outline h-10 w-10 px-0" onClick={() => move(cur.id, 1)} aria-label="Move right"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                  {([["durationSec", "Length (s)"], ["trimStart", "Trim start (s)"], ["trimEnd", "Trim end (s)"]] as const).map(([k, l]) => (
                    <label key={k + cur.id}><span className="label">{l}</span><input type="number" step={0.5} min={0} className="input h-10" defaultValue={(cur[k] as number) || 0} onBlur={(e) => act("updateShot", { shotId: cur.id, patch: { [k]: +e.target.value } })} /></label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="panel space-y-4 p-5">
              <div><span className="label flex items-center gap-1.5"><Music className="h-3.5 w-3.5" />Music bed</span><Segmented value={p.music} onChange={(v) => patch({ music: v })} options={["none", "ambient", "tension", "upbeat"].map((m) => ({ value: m, label: m }))} /></div>
              <div><span className="label flex items-center gap-1.5"><Subtitles className="h-3.5 w-3.5" />Subtitles</span><Segmented value={p.subtitles ? "on" : "off"} onChange={(v) => patch({ subtitles: v === "on" })} options={[{ value: "on", label: "Burned in" }, { value: "off", label: "Off" }]} /></div>
            </div>
            {r.review && (
              <div className="panel p-5"><span className="label">AI review of the cut</span><p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-300">{r.review}</p></div>
            )}
            <div className="panel p-5">
              <span className="label flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" />Describe the change</span>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {p.editLog.length === 0 && <p className="text-sm text-ink-400">Ask for changes in plain words: “make shot 2 longer”, “move shot 4 to 1”, “tension music”, “turn off subtitles”, “Nigerian female narrator”. Then re-render.</p>}
                {p.editLog.map((m, i) => <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-6 bg-brand-500/20" : "mr-4 bg-white/[0.04] text-ink-300"}`}>{m.content}</div>)}
              </div>
            </div>
          </aside>
        </div>
      </div>
      <PromptBar busy={busy.has("aiEdit")} placeholder="Tell the AI editor what to change in the cut…" onSubmit={async (v) => { const res = await act("aiEdit", { prompt: v }); if (res?.ok) act("render"); }} hint="Changes apply to the timeline, then ReelForge re-renders automatically." />
    </>
  );
}
