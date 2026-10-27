"use client";
import { friendly, jobPost } from "@/lib/net";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Clapperboard, Film, ScrollText, Scissors, Settings2, Users, Workflow } from "lucide-react";
import type { Project } from "@/lib/types";
import { Spinner, useToast, Modal, Segmented } from "../ui";
import { StatusPill } from "../AppShell";
import type { Act } from "./common";
import { ScriptTab } from "./ScriptTab";
import { AssetsTab } from "./AssetsTab";
import { StoryboardTab } from "./StoryboardTab";
import { VideoTab } from "./VideoTab";
import { EditTab } from "./EditTab";
import { PipelineView } from "./PipelineView";

const TABS = [
  { id: "script", label: "Script", icon: ScrollText },
  { id: "assets", label: "Assets", icon: Users },
  { id: "storyboard", label: "Storyboard", icon: Clapperboard },
  { id: "video", label: "Video", icon: Film },
  { id: "edit", label: "Edit & Export", icon: Scissors },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Workspace({ id }: { id: string }) {
  const [p, setP] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const params = useSearchParams();
  const [tab, setTab] = useState<TabId>((params.get("tab") as TabId) || "script");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  const [settings, setSettings] = useState(false);
  const [pipe, setPipe] = useState(false);
  const [contrib, setContrib] = useState(false);
  const { toast, node } = useToast();
  const pRef = useRef(p); pRef.current = p;

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) return setMissing(true);
    setP(await r.json());
  }, [id]);
  useEffect(() => { load(); fetch("/api/status").then((r) => r.json()).then((s) => { setVoices(s.voices || []); setContrib(!!s.contributor); }); }, [load]);

  // poll while rendering, writing, or while automatic continuity / reference reviews run
  useEffect(() => {
    const reviewing = !!p && (p.scenes.some((sc) => sc.shots.some((s) => s.continuity?.state === "checking" || s.continuity?.state === "fixing" || s.clipJob?.state === "queued" || s.clipJob?.state === "running")) || p.assets.some((a) => a.refState === "checking" || a.refState === "fixing"));
    if (!p || (!reviewing && !["queued", "running"].includes(p.render.status) && !(p.writing && Date.now() - p.writing < 20 * 60_000))) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [p, load]);

  const act: Act = useCallback(async (action, payload = {}, opts = {}) => {
    const key = opts.busyKey || action;
    setBusy((b) => new Set(b).add(key));
    try {
      const r = await jobPost<Record<string, unknown> & { project?: Project; error?: string }>(`/api/projects/${id}/action`, { action, ...payload });
      const j = r.data;
      if (j.project) setP(j.project);
      if (!r.ok) toast(j.error || "Something went wrong — please retry.", true);
      else if (!j.project) load();
      return j;
    } catch (e) { toast(friendly(e), true); return null; }
    finally { setBusy((b) => { const n = new Set(b); n.delete(key); return n; }); }
  }, [id, toast]);

  const patch = async (body: Partial<Project>) => {
    const r = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) setP(await r.json());
  };

  if (missing) return <div className="grid min-h-dvh place-items-center text-ink-400">Project not found. <Link href="/studio" className="btn-outline mt-4">Back to projects</Link></div>;
  if (!p) return <div className="grid min-h-dvh place-items-center"><Spinner className="h-6 w-6" /></div>;

  const props = { p, act, busy, setP, toast, voices };
  const shotCount = p.scenes.reduce((n, s) => n + s.shots.length, 0);
  const counts: Record<TabId, string | number> = { script: p.script ? "" : "", assets: p.assets.length || "", storyboard: shotCount || "", video: "", edit: p.render.status === "done" ? "✓" : "" };

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Left rail: project nav (Flow-like) */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/70 lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-white/[0.06] px-4">
          <Link href="/studio" className="btn-ghost h-8 w-8 px-0" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="truncate text-sm font-semibold">{p.title}</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {TABS.map((t, i) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-3 rounded-xl px-3 h-10 text-sm transition ${tab === t.id ? "bg-white/[0.08] text-white" : "text-ink-300 hover:bg-white/[0.04] hover:text-white"}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-semibold ${tab === t.id ? "bg-brand-500 text-ink-950" : "bg-white/[0.06]"}`}>{i + 1}</span>
              <span className="flex-1 text-left">{t.label}</span>
              {counts[t.id] !== "" && <span className="text-xs text-ink-400">{counts[t.id]}</span>}
            </button>
          ))}
          <button onClick={() => setPipe(true)} className="mt-2 flex items-center gap-3 rounded-xl px-3 h-10 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-white">
            <Workflow className="h-4 w-4 text-sky-300" /><span className="flex-1 text-left">Pipeline</span><span className="text-[10px] text-sky-300">Built with Meta</span>
          </button>
        </nav>
        <div className="mt-auto space-y-3 border-t border-white/[0.06] p-4 text-xs text-ink-400">
          <div className="flex flex-wrap gap-1.5">
            <span className="badge bg-white/[0.06] text-ink-300">{p.mode}</span><span className="badge bg-white/[0.06] text-ink-300">{p.aspect}</span><span className="badge bg-white/[0.06] text-ink-300">{p.style}</span><span className="badge bg-white/[0.06] text-ink-300">{p.outputType} mode</span>
          </div>
          <button className="btn-outline w-full h-9" onClick={() => setSettings(true)}><Settings2 className="h-4 w-4" /> Project settings</button>
          <StatusPill />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar for < lg */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-2 pl-3 pr-14 sm:pl-5 sm:pr-16">
            <Link href="/studio" className="btn-ghost h-9 w-9 px-0" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
            <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
            <StatusPill />
            <button className="btn-ghost h-9 w-9 px-0" onClick={() => setPipe(true)} aria-label="Pipeline"><Workflow className="h-4 w-4 text-sky-300" /></button>
            <button className="btn-ghost h-9 w-9 px-0" onClick={() => setSettings(true)} aria-label="Settings"><Settings2 className="h-4 w-4" /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:px-5 [&::-webkit-scrollbar]:hidden">
            {TABS.map((t, i) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`chip shrink-0 ${tab === t.id ? "chip-on" : ""}`}><span className="text-ink-400">{i + 1}</span>{t.label}</button>
            ))}
          </nav>
        </header>
        {contrib && <div role="note" className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-1.5 text-center text-[11px] text-amber-200">Contributor mode is on (Admin): text inputs in this project may be used by Meta for training.</div>}
        <main className="flex min-h-0 flex-1 flex-col">
          {tab === "script" && <ScriptTab {...props} openBrainstorm={params.get("brainstorm") === "1"} next={() => setTab("assets")} />}
          {tab === "assets" && <AssetsTab {...props} next={() => setTab("storyboard")} />}
          {tab === "storyboard" && <StoryboardTab {...props} next={() => setTab("video")} />}
          {tab === "video" && <VideoTab {...props} patch={patch} next={() => setTab("edit")} />}
          {tab === "edit" && <EditTab {...props} patch={patch} />}
        </main>
      </div>
      {node}
      <Modal open={pipe} onClose={() => setPipe(false)} title="Pipeline · Built with Meta">
        <PipelineView id={id} go={(t) => { setTab(t as TabId); setPipe(false); load(); }} />
      </Modal>
      <Modal open={settings} onClose={() => setSettings(false)} title="Project settings">
        <div className="space-y-5">
          <div><span className="label">Title</span><input className="input" defaultValue={p.title} onBlur={(e) => patch({ title: e.target.value })} /></div>
          <div><span className="label">Mode</span><Segmented value={p.mode} onChange={(v) => patch({ mode: v })} options={[{ value: "drama", label: "Drama" }, { value: "documentary", label: "Documentary" }, { value: "ad", label: "Product Ad" }]} /></div>
          <div><span className="label">Format</span><Segmented value={p.format} onChange={(v) => patch({ format: v })} options={[{ value: "yt_shorts", label: "YouTube Shorts" }, { value: "tiktok", label: "TikTok" }, { value: "fb_reels", label: "FB Reels" }, { value: "yt_long", label: "YouTube video" }]} /></div>
          <div><span className="label">Aspect</span><Segmented value={p.aspect} onChange={(v) => patch({ aspect: v })} options={["9:16", "16:9", "1:1", "4:5"].map((a) => ({ value: a as Project["aspect"], label: a }))} /></div>
          <div><span className="label">Style</span><Segmented value={p.style} onChange={(v) => patch({ style: v })} options={[{ value: "realistic", label: "Realistic" }, { value: "pixar", label: "Pixar / 3D" }, { value: "cartoon", label: "Cartoon" }, { value: "anime", label: "Anime" }, { value: "custom", label: "Custom" }]} />
            {p.style === "custom" && <input className="input mt-2" defaultValue={p.customStyle} placeholder="Describe your style" onBlur={(e) => patch({ customStyle: e.target.value })} />}</div>
          <div><span className="label">Output</span><Segmented value={p.outputType} onChange={(v) => patch({ outputType: v })} options={[{ value: "image", label: "Image mode" }, { value: "video", label: "Video mode" }]} /></div>
        </div>
      </Modal>
    </div>
  );
}
