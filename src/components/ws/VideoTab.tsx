"use client";
import { ArrowRight, Film, Image as ImageIcon, Mic, Play, Sparkles } from "lucide-react";
import type { Project, Shot } from "@/lib/types";
import { Spinner } from "../ui";
import { active, ratio, shotsOf, type TabProps } from "./common";
import { useEffect, useState } from "react";

type VP = { id: string; name: string; model: string; maxDuration: number; aspects: string[]; firstLast: boolean; costPerSec?: number; ready: boolean; type: string };
/** Live clip-job state on a shot (queued → running n% → done / failed, with provider + attempt). */
export function ClipJobBadge({ sh }: { sh: Shot }) {
  const j = sh.clipJob; if (!j || j.state === "done") return null;
  const c = j.state === "failed" ? "bg-red-500/90" : j.state === "queued" ? "bg-white/20" : "bg-violet-500/90";
  return <span title={j.error || j.provider} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${c}`}>{j.state === "running" && <Spinner className="h-2.5 w-2.5" />}{j.state === "queued" ? "Video queued" : j.state === "running" ? `Video ${j.progress || 0}%${(j.attempt || 1) > 1 ? ` · retry ${j.attempt}` : ""}` : "Video failed"}</span>;
}

export function VideoTab({ p, act, busy, voices, patch, next }: TabProps & { patch: (b: Partial<Project>) => void; next: () => void }) {
  const shots = shotsOf(p);
  const [live, setLive] = useState<{ video: boolean; tts: string } | null>(null);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setLive); }, []);
  const [provs, setProvs] = useState<VP[]>([]);
  useEffect(() => { fetch("/api/video-providers").then((r) => r.json()).then((j) => setProvs(j.providers || [])); }, []);
  const chosen = provs.find((v) => v.id === p.videoProvider) || provs.find((v) => v.ready && v.type !== "mock") || provs.find((v) => v.type === "mock");
  const framedShots = shots.filter((s) => s.activeStart);
  const estSecs = chosen ? framedShots.reduce((a, s) => a + Math.min(s.durationSec, chosen.maxDuration), 0) : 0;
  const estUsd = chosen?.costPerSec !== undefined ? estSecs * chosen.costPerSec : undefined;
  const jobs = shots.filter((s) => s.clipJob && (s.clipJob.state === "queued" || s.clipJob.state === "running")).length;
  const voiced = shots.filter((s) => s.audioUrl).length;
  const lines = shots.filter((s) => s.dialogue || s.narration).length;
  const clips = shots.filter((s) => s.clipUrl).length;
  const rendering = ["queued", "running"].includes(p.render.status);

  return (
    <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Video & voice</h2>
            <p className="mt-0.5 text-sm text-ink-400">Turn frames into motion and give every line a voice.</p>
          </div>
          <button className="btn-brand" disabled={rendering || !shots.length} onClick={async () => { await act("render"); next(); }}>{rendering ? <Spinner /> : <Sparkles className="h-4 w-4" />} Assemble film <ArrowRight className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <span className="label">Output mode</span>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "image" as const, l: "Image mode", d: "Stills with motion + voice", i: ImageIcon }, { v: "video" as const, l: "Video mode", d: "Start → end frame clips", i: Film }].map((o) => (
                <button key={o.v} onClick={() => patch({ outputType: o.v })} className={`rounded-xl border p-3 text-left transition ${p.outputType === o.v ? "border-brand-400/70 bg-brand-500/10" : "border-white/10 hover:border-white/20"}`}>
                  <div className="flex items-center gap-2 text-sm font-medium"><o.i className="h-4 w-4" />{o.l}</div><p className="mt-1 text-xs text-ink-400">{o.d}</p>
                </button>
              ))}
            </div>
            {p.outputType === "video" && (
              <div className="mt-4 space-y-3">
                <label className="block"><span className="label">Video provider</span>
                  <select className="input h-10" value={p.videoProvider || "auto"} onChange={(e) => patch({ videoProvider: e.target.value })}>
                    <option value="auto">Auto — Admin fallback order</option>
                    {provs.map((v) => <option key={v.id} value={v.id} disabled={!v.ready}>{v.name} · {v.model}{v.ready ? "" : " (no key)"}</option>)}
                  </select></label>
                {chosen && <p className="text-xs text-ink-400">Using <b className="text-white">{chosen.name}</b> · max {chosen.maxDuration}s per clip · {chosen.firstLast ? "first + last frame" : "first frame only"}{chosen.aspects.includes(p.aspect) ? "" : ` · ⚠ ${p.aspect} not listed for this provider`}. Estimate for {framedShots.length} framed shot(s): <b className="text-white">{estSecs}s</b>{estUsd !== undefined ? <> · ~<b className="text-white">${estUsd.toFixed(2)}</b></> : " · cost unknown (set cost/sec in Admin)"}. Failed clips retry, then fall back to the next provider.</p>}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-outline" disabled={busy.has("clipAll") || !framedShots.length || jobs > 0} onClick={() => act("clipAll")}>{busy.has("clipAll") || jobs ? <Spinner /> : <Film className="h-4 w-4" />} {jobs ? `Generating… ${jobs} in queue` : `Generate missing clips (${clips}/${shots.length})`}</button>
                  {clips > 0 && <button className="btn-ghost" disabled={jobs > 0} onClick={() => { if (confirm("Regenerate every clip?")) act("clipAll", { all: true }); }}>Regenerate all</button>}
                </div>
              </div>
            )}
          </div>
          <div className="panel p-5">
            <span className="label">Voiceover</span>
            <p className="text-xs text-ink-400">Provider: <b className="text-white">{live?.tts === "edge" || !live ? "Microsoft Edge neural (free)" : live.tts}</b>. Characters use the voice set on their asset card.</p>
            {p.mode !== "drama" || shots.some((s) => s.narration) ? (
              <div className="mt-3"><span className="label">Narrator</span>
                <select className="input h-10" value={p.narratorVoice} onChange={(e) => patch({ narratorVoice: e.target.value })}>{voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
              </div>
            ) : null}
            <button className="btn-outline mt-4" disabled={busy.has("voiceAll") || !lines} onClick={() => act("voiceAll")}>{busy.has("voiceAll") ? <Spinner /> : <Mic className="h-4 w-4" />} Voice all lines ({voiced}/{lines})</button>
          </div>
        </div>

        <div className="panel divide-y divide-white/[0.06]">
          {shots.map((sh) => {
            const s = active(sh.startFrame, sh.activeStart), e = active(sh.endFrame, sh.activeEnd);
            return (
              <div key={sh.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-6 text-center text-xs font-semibold text-ink-400">{sh.index + 1}</span>
                  {[s, e].map((v, i) => <div key={i} className="h-16 overflow-hidden rounded-lg bg-ink-800" style={{ aspectRatio: ratio(p.aspect) }}>{v && <img src={v.url} alt="" className="h-full w-full object-cover" />}</div>)}
                  {sh.clipUrl && <video src={sh.clipUrl} className="h-16 rounded-lg bg-black" style={{ aspectRatio: ratio(p.aspect) }} muted loop playsInline onMouseEnter={(ev) => ev.currentTarget.play()} onMouseLeave={(ev) => ev.currentTarget.pause()} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap gap-1.5"><ClipJobBadge sh={sh} />{sh.clipUrl && sh.clipProvider && <span className="text-[10px] text-ink-500">clip · {sh.clipProvider}</span>}</div>
                  {sh.clipJob?.state === "failed" && <p className="text-[11px] text-red-300/90 line-clamp-2">{sh.clipJob.error}</p>}
                  <p className="truncate text-sm">{sh.camera} · <span className="text-ink-400">{sh.description}</span></p>
                  {(sh.dialogue || sh.narration) && <p className="mt-0.5 truncate text-xs text-ink-300">{sh.dialogue ? `${sh.speaker}: ${sh.dialogue}` : `VO: ${sh.narration}`}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {sh.audioUrl && <audio controls src={sh.audioUrl} className="h-8 w-48" />}
                  {(sh.dialogue || sh.narration) && <button className="btn-ghost h-8" disabled={busy.has("voice-" + sh.id)} onClick={() => act("voiceShot", { shotId: sh.id }, { busyKey: "voice-" + sh.id })}>{busy.has("voice-" + sh.id) ? <Spinner /> : <Mic className="h-4 w-4" />}</button>}
                  {p.outputType === "video" && <button className="btn-outline h-8" disabled={!sh.activeStart || busy.has("clip-" + sh.id) || sh.clipJob?.state === "queued" || sh.clipJob?.state === "running"} onClick={() => act("clip", { shotId: sh.id }, { busyKey: "clip-" + sh.id })}>{busy.has("clip-" + sh.id) ? <Spinner /> : <Play className="h-3.5 w-3.5" />}Clip</button>}
                </div>
              </div>
            );
          })}
          {!shots.length && <p className="p-6 text-sm text-ink-400">Build the storyboard first.</p>}
        </div>
      </div>
    </div>
  );
}
