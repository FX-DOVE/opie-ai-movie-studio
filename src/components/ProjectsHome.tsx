"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Clapperboard, Film, Image as ImageIcon, Megaphone, Plus, Search, Trash2, Video } from "lucide-react";
import { Modal, Segmented, Spinner, Logo } from "./ui";
import { StatusPill } from "./AppShell";

type Row = { id: string; title: string; mode: string; format: string; aspect: string; style: string; outputType: string; cover?: string; updatedAt: string; shots: number; rendered: boolean };
const MODE_LABEL: Record<string, string> = { drama: "Drama", documentary: "Documentary", ad: "Product Ad" };
const FORMAT_LABEL: Record<string, string> = { yt_shorts: "YouTube Shorts", tiktok: "TikTok", fb_reels: "Facebook Reels", yt_long: "YouTube Video" };
const ratio = (a: string) => a.replace(":", "/");

export function ProjectsHome() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const load = () => fetch("/api/projects").then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);
  const list = (rows || []).filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between md:hidden"><Logo /><StatusPill /></div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="hidden items-center gap-3 md:flex"><StatusPill /></div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Your projects</h1>
          <p className="mt-1 text-sm text-ink-400">Films, anime, documentaries and ads — each with its own cast, storyboard and cut.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input h-10 pl-9" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn-brand h-10" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New project</span><span className="sm:hidden">New</span></button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <button onClick={() => setOpen(true)} className="group flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-ink-400 transition-colors hover:border-brand-400/60 hover:text-white">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.05] group-hover:bg-brand-500/20"><Plus className="h-5 w-5" /></span>
          <span className="text-sm font-medium">New project</span>
        </button>
        {rows === null && Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer aspect-[4/3] rounded-2xl" />)}
        {list.map((r) => (
          <div key={r.id} className="group relative">
            <Link href={`/studio/${r.id}`} className="block overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850 transition hover:border-white/20">
              <div className="relative aspect-[4/3] bg-ink-800">
                {r.cover ? <img src={r.cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-ink-600"><Clapperboard className="h-10 w-10" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0" />
                <div className="absolute left-2.5 top-2.5 flex gap-1.5"><span className="badge bg-black/50 text-white/90">{MODE_LABEL[r.mode]}</span>{r.rendered && <span className="badge bg-emerald-500/20 text-emerald-300">Cut ready</span>}</div>
                <span className="absolute bottom-2.5 right-2.5 badge bg-black/50 text-white/80">{r.aspect}</span>
              </div>
              <div className="p-3 sm:p-4">
                <div className="truncate font-medium">{r.title}</div>
                <div className="mt-1 truncate text-xs text-ink-400">{FORMAT_LABEL[r.format]} · {r.style} · {r.shots} shots</div>
              </div>
            </Link>
            <button aria-label="Delete project" className="absolute right-2 top-2 hidden h-8 w-8 place-items-center rounded-lg bg-black/60 text-white/80 hover:text-red-300 group-hover:grid" onClick={async () => { if (confirm(`Delete “${r.title}”?`)) { await fetch(`/api/projects/${r.id}`, { method: "DELETE" }); load(); } }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <NewProject open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewProject({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState("drama");
  const [format, setFormat] = useState("yt_shorts");
  const [aspect, setAspect] = useState("9:16");
  const [style, setStyle] = useState("realistic");
  const [customStyle, setCustom] = useState("");
  const [outputType, setOut] = useState("image");
  const [start, setStart] = useState<"idea" | "script" | "brainstorm">("idea");
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title || undefined, mode, format, aspect, style, customStyle, outputType, idea, script: start === "script" ? script : "" }) });
    const p = await r.json();
    if (start === "idea" && idea.trim()) {
      await fetch(`/api/projects/${p.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "writeScript", prompt: idea }) });
    }
    router.push(`/studio/${p.id}${start === "brainstorm" ? "?brainstorm=1" : ""}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <div className="space-y-6">
        <div>
          <span className="label">What are you making?</span>
          <div className="grid grid-cols-3 gap-2">
            {[{ v: "drama", l: "Drama / Film", i: Film }, { v: "documentary", l: "Documentary", i: Video }, { v: "ad", l: "Product Ad", i: Megaphone }].map((m) => (
              <button key={m.v} onClick={() => setMode(m.v)} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 sm:p-4 text-xs sm:text-sm font-medium transition ${mode === m.v ? "border-brand-400/70 bg-brand-500/10 text-white" : "border-white/10 text-ink-300 hover:border-white/20"}`}>
                <m.i className="h-5 w-5" />{m.l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <span className="label">Format</span>
            <Segmented value={format} onChange={(v) => { setFormat(v); setAspect(v === "yt_long" ? "16:9" : "9:16"); }} options={[{ value: "yt_shorts", label: "YouTube Shorts" }, { value: "tiktok", label: "TikTok" }, { value: "fb_reels", label: "FB Reels" }, { value: "yt_long", label: "YouTube video" }]} />
          </div>
          <div>
            <span className="label">Aspect ratio</span>
            <Segmented value={aspect} onChange={setAspect} options={["9:16", "16:9", "1:1", "4:5"].map((a) => ({ value: a, label: <><span className="inline-block border border-current rounded-[2px]" style={{ aspectRatio: ratio(a), height: 11 }} />{a}</> }))} />
          </div>
        </div>
        <div>
          <span className="label">Visual style</span>
          <Segmented value={style} onChange={setStyle} options={[{ value: "realistic", label: "Realistic" }, { value: "pixar", label: "Pixar / 3D" }, { value: "cartoon", label: "Cartoon" }, { value: "anime", label: "Anime" }, { value: "custom", label: "Custom…" }]} />
          {style === "custom" && <input className="input mt-2" placeholder="e.g. 1970s Nollywood VHS, warm grain" value={customStyle} onChange={(e) => setCustom(e.target.value)} />}
        </div>
        <div>
          <span className="label">Output</span>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: "image", l: "Image mode", d: "Many stills + motion + voice. Free, great for long-form.", i: ImageIcon }, { v: "video", l: "Video mode", d: "Start → end frame clips via your video engine.", i: Video }].map((o) => (
              <button key={o.v} onClick={() => setOut(o.v)} className={`rounded-2xl border p-3 text-left transition ${outputType === o.v ? "border-brand-400/70 bg-brand-500/10" : "border-white/10 hover:border-white/20"}`}>
                <div className="flex items-center gap-2 text-sm font-medium"><o.i className="h-4 w-4" />{o.l}</div>
                <p className="mt-1 text-xs text-ink-400">{o.d}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Start from</span>
          <Segmented value={start} onChange={setStart} options={[{ value: "idea", label: "An idea" }, { value: "script", label: "My script" }, { value: "brainstorm", label: "Brainstorm with AI" }]} />
          <input className="input mt-3" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          {start === "idea" && <textarea className="input mt-2 min-h-24" placeholder="e.g. A Lagos akara seller discovers her fiancé has a secret family in Abuja" value={idea} onChange={(e) => setIdea(e.target.value)} />}
          {start === "script" && <textarea className="input screenplay mt-2 min-h-40 text-[13px]" placeholder={"TITLE: ...\n\nINT. LOCATION - NIGHT\nAction...\n\nCHARACTER\nDialogue"} value={script} onChange={(e) => setScript(e.target.value)} />}
          {start === "brainstorm" && <p className="mt-2 text-sm text-ink-400">You’ll land in the script room with Muse ready to brainstorm.</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-ghost h-11" onClick={onClose}>Cancel</button>
          <button className="btn-brand h-11 px-6" disabled={busy || (start === "idea" && !idea.trim()) || (start === "script" && script.trim().length < 20)} onClick={create}>{busy ? <><Spinner /> Writing…</> : "Create project"}</button>
        </div>
      </div>
    </Modal>
  );
}
