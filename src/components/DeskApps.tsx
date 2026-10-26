"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Folder, Globe, Image as ImageIcon, Moon, SquareTerminal, Film, X } from "lucide-react";

export type DeskApp = "files" | "terminal" | "browser" | null;
type Step = { action: string; kind: string };
type Proj = { id: string; title: string; updatedAt: string; rendered: boolean };
type Full = { id: string; title: string; assets: { id: string; name: string; kind: string; images: { url: string; id: string }[]; activeImage?: string }[]; render: { status: string; url?: string } };

/** The computer when it's asleep. */
export function SleepScreen({ onWake, compact }: { onWake: () => void; compact?: boolean }) {
  return (
    <button onClick={onWake} aria-label="Idle, tap to wake up" className="absolute inset-0 grid place-items-center bg-[radial-gradient(60%_60%_at_50%_45%,#17171a,#060607)] text-center">
      <span>
        <span className="relative mx-auto block w-fit"><Moon className={`${compact ? "h-8 w-8" : "h-12 w-12"} text-ink-400`} /><span className="zz absolute -right-3 -top-2 font-display text-lg text-ink-400">z</span><span className="zz absolute -right-6 -top-5 font-display text-sm text-ink-500" style={{ animationDelay: ".8s" }}>z</span></span>
        <span className="mt-4 block text-sm font-medium text-white">Idle</span>
        <span className="mt-1 block text-xs text-ink-400">Tap to wake up</span>
      </span>
    </button>
  );
}

/** The awake desktop: three apps — Files, Terminal, Browser. */
export function HomeScreen({ app, setApp, steps, lastScreen, goal, onBrowse, onSleep }: { app: DeskApp; setApp: (a: DeskApp) => void; steps: Step[]; lastScreen?: string; goal?: string; onBrowse: (url: string) => Promise<void>; onSleep: () => void }) {
  const clock = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const APPS = [
    { id: "files" as const, label: "Files", icon: Folder, tint: "bg-[#2a2a2e] text-brand-400" },
    { id: "terminal" as const, label: "Terminal", icon: SquareTerminal, tint: "bg-[#111] text-emerald-400" },
    { id: "browser" as const, label: "Browser", icon: Globe, tint: "bg-[#1f2a30] text-sky-glow" },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-cover bg-center" style={{ backgroundImage: "linear-gradient(rgba(8,8,9,.55),rgba(8,8,9,.75)),url(/brand/still-desert.webp)" }}>
      <div className="flex h-7 items-center justify-between bg-black/40 px-3 text-[11px] text-white/80 backdrop-blur"><span className="font-medium">ReelForge OS</span><span className="flex items-center gap-3"><button onClick={onSleep} className="hover:text-white">Sleep</button>{clock}</span></div>
      {!app && <div className="grid h-[calc(100%-28px)] place-items-center">
        <div className="flex gap-6 sm:gap-10">
          {APPS.map((a) => <button key={a.id} onClick={() => setApp(a.id)} aria-label={`Open ${a.label}`} className="group flex w-16 flex-col items-center gap-2 sm:w-20">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl shadow-lg ring-1 ring-white/10 transition group-hover:-translate-y-0.5 sm:h-16 sm:w-16 ${a.tint}`}><a.icon className="h-7 w-7" /></span>
            <span className="text-xs text-white drop-shadow">{a.label}</span></button>)}
        </div>
      </div>}
      {app && <div className="absolute inset-x-2 bottom-2 top-9 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-950/95 shadow-2xl sm:inset-x-4 sm:bottom-4 sm:top-11">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
          <button aria-label="Back to desktop" onClick={() => setApp(null)} className="grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /></button>
          <span className="text-xs font-medium capitalize text-white">{app}</span>
          <button aria-label="Close app" onClick={() => setApp(null)} className="ml-auto grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {app === "files" && <Files />}
          {app === "terminal" && <Terminal steps={steps} goal={goal} onBrowse={onBrowse} />}
          {app === "browser" && <Browser lastScreen={lastScreen} onBrowse={onBrowse} />}
        </div>
      </div>}
    </div>
  );
}

function Files() {
  const [list, setList] = useState<Proj[] | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  useEffect(() => { fetch("/api/projects").then((r) => r.json()).then(setList).catch(() => setList([])); }, []);
  if (open) {
    const imgs = open.assets.flatMap((a) => { const v = a.images.find((i) => i.id === a.activeImage) || a.images[a.images.length - 1]; return v ? [{ name: a.name, url: v.url }] : []; });
    return <div className="p-3 text-xs">
      <button className="mb-2 flex items-center gap-1 text-ink-400 hover:text-white" onClick={() => setOpen(null)}><ArrowLeft className="h-3.5 w-3.5" />Projects / <span className="text-white">{open.title}</span></button>
      {open.render?.url && <a href={open.render.url} target="_blank" className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 p-2 text-white hover:bg-white/10"><Film className="h-4 w-4 text-brand-400" />final-render.mp4</a>}
      {imgs.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{imgs.map((i) => <a key={i.url} href={i.url} target="_blank" className="block"><img src={i.url} alt={i.name} className="aspect-square w-full rounded-md object-cover" /><span className="mt-1 block truncate text-ink-300">{i.name}</span></a>)}</div>
        : <p className="text-ink-500">No assets or renders yet.</p>}
    </div>;
  }
  return <ul className="divide-y divide-white/[0.05] text-xs">
    {list === null && <li className="p-3 text-ink-500">Loading…</li>}
    {list?.length === 0 && <li className="p-3 text-ink-500">No projects yet.</li>}
    {list?.map((p) => <li key={p.id}><button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5" onClick={() => fetch(`/api/projects/${p.id}`).then((r) => r.json()).then(setOpen)}>
      <Folder className="h-4 w-4 shrink-0 text-brand-400" /><span className="min-w-0 flex-1 truncate text-white">{p.title}</span>{p.rendered && <Film className="h-3.5 w-3.5 text-ink-400" />}<ImageIcon className="h-3.5 w-3.5 text-ink-500" /></button></li>)}
  </ul>;
}

/** Sandboxed terminal: shows the agent's action log; accepts a few safe built-ins (nothing runs on the host). */
function Terminal({ steps, goal, onBrowse }: { steps: Step[]; goal?: string; onBrowse: (url: string) => Promise<void> }) {
  const [out, setOut] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [out, steps.length]);
  const run = async (cmd: string) => {
    const [c, ...a] = cmd.trim().split(/\s+/); const say = (...l: string[]) => setOut((o) => [...o, "$ " + cmd, ...l]);
    if (!c) return;
    if (c === "clear") return setOut([]);
    if (c === "help") return say("help · ls · status · open <url> · clear", "This is a sandbox — commands never run on the server.");
    if (c === "ls") { const r = await fetch("/api/projects").then((x) => x.json()).catch(() => []); return say(...(r as Proj[]).map((p) => `${p.id}  ${p.title}`)); }
    if (c === "status") return say(goal ? `last task: ${goal}` : "no task yet", `${steps.length} agent steps logged`);
    if (c === "open" && a[0]) { say(`opening ${a[0]} in Browser…`); return onBrowse(a[0]); }
    say(`${c}: not available in the sandbox (try "help")`);
  };
  return <div className="min-h-full bg-black p-3 font-mono text-[11.5px] leading-5 text-emerald-300/90">
    <p className="text-ink-500">reelforge sandbox — agent log{goal ? ` · ${goal}` : ""}</p>
    {steps.map((s, i) => <p key={i} className={s.kind === "error" ? "text-red-300" : s.kind === "done" ? "text-brand-400" : ""}>[{String(i + 1).padStart(2, "0")}] {s.action}</p>)}
    {out.map((l, i) => <p key={"o" + i} className={l.startsWith("$") ? "text-white" : "text-ink-300"}>{l}</p>)}
    <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem("c") as HTMLInputElement; run(f.value); f.value = ""; }} className="flex gap-2"><span className="text-white">$</span><input name="c" aria-label="Terminal command" autoComplete="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-base text-white outline-none sm:text-[11.5px]" /></form>
    <div ref={end} />
  </div>;
}

function Browser({ lastScreen, onBrowse }: { lastScreen?: string; onBrowse: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="flex h-full flex-col">
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onBrowse(url || "https://www.youtube.com").finally(() => setBusy(false)); }} className="flex gap-2 border-b border-white/[0.06] p-2">
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Search or enter a URL" aria-label="Address" className="h-8 min-w-0 flex-1 rounded-full bg-ink-800 px-3 text-base text-white outline-none sm:text-xs" />
      <button className="btn-brand h-8 px-3 text-xs" disabled={busy}>{busy ? "Opening…" : "Go"}</button>
    </form>
    <div className="relative min-h-0 flex-1 bg-black">{lastScreen ? <img src={lastScreen} alt="Last page the agent viewed" className="absolute inset-0 h-full w-full object-contain opacity-70" /> : <p className="grid h-full place-items-center p-4 text-center text-xs text-ink-500">A real Chromium browser. Enter a URL — or ask Reel to research something and it opens here.</p>}</div>
  </div>;
}
