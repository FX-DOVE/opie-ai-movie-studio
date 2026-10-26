"use client";
import { useEffect, useRef, useState } from "react";
import { Globe2, MonitorPlay, NotebookPen, Play, Send, Square, TrendingUp } from "lucide-react";
import { Spinner, useToast } from "./ui";
import { StatusPill } from "./AppShell";

type Step = { n: number; at: string; action: string; thought?: string; shot?: string };
type Session = { id: string; goal: string; status: string; steps: Step[]; notes: string; trending: { title: string; channel: string; views?: string; url: string; thumb?: string }[]; mode: string; error?: string };

const PRESETS = ["Trending Nollywood drama stories on YouTube this week", "Viral anime short formats on YouTube Shorts", "Best performing product ad hooks on TikTok", "Top documentary topics about African history"];

export function Research() {
  const [goal, setGoal] = useState("");
  const [s, setS] = useState<Session | null>(null);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [target, setTarget] = useState("");
  const { toast, node } = useToast();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { fetch("/api/projects").then((r) => r.json()).then((p) => { setProjects(p); if (p[0]) setTarget(p[0].id); }); return () => { if (timer.current) clearInterval(timer.current); }; }, []);

  const start = async (g = goal) => {
    if (!g.trim()) return;
    setGoal(g);
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: g }) });
    const j = await r.json(); if (!r.ok) return toast(j.error, true);
    if (timer.current) clearInterval(timer.current);
    const poll = async () => { const x = await (await fetch(`/api/research/${j.id}`)).json(); setS(x); if (x.status !== "running" && timer.current) clearInterval(timer.current); };
    poll(); timer.current = setInterval(poll, 1000);
  };
  const latest = s ? [...s.steps].reverse().find((x) => x.shot) : null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 sm:py-8">
      <div className="flex flex-wrap items-center gap-3"><StatusPill />{s && <span className="badge bg-white/[0.06] text-ink-300">{s.mode === "meta" ? "Muse Wonder computer use" : "Scripted browsing"}</span>}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Virtual desktop</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-400">A research agent with its own browser. Muse Wonder drives it with computer use — searching Google and YouTube, reading titles and thumbnails, watching videos and taking notes you can send straight into a project’s brainstorm.</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input className="input h-11" placeholder="What should the agent research?" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
        {s?.status === "running"
          ? <button className="btn-outline h-11" onClick={() => fetch(`/api/research/${s.id}`, { method: "DELETE" })}><Square className="h-4 w-4" />Stop</button>
          : <button className="btn-brand h-11 px-5" onClick={() => start()} disabled={!goal.trim()}><Play className="h-4 w-4" />Start agent</button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p} className="chip" onClick={() => start(p)}>{p}</button>)}</div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="panel overflow-hidden">
          <div className="flex h-10 items-center gap-2 border-b border-white/[0.06] bg-ink-900 px-3">
            <span className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" /></span>
            <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-ink-800 px-3 py-1 text-xs text-ink-400">{latest?.action || "about:blank"}</span>
            {s?.status === "running" && <Spinner className="h-3.5 w-3.5 text-sky-glow" />}
          </div>
          <div className="relative aspect-[16/10] bg-ink-950">
            {latest?.shot ? <img src={latest.shot} alt="Agent screen" className="absolute inset-0 h-full w-full object-contain" /> : (
              <div className="absolute inset-0 grid place-items-center text-center text-ink-600"><div><MonitorPlay className="mx-auto h-10 w-10" /><p className="mt-2 text-sm">The agent’s screen streams here live</p></div></div>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel p-4">
            <span className="label flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" />Agent steps</span>
            <ol className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {!s && <li className="text-ink-400">Idle.</li>}
              {s?.steps.map((x) => <li key={x.n} className="flex gap-2"><span className="w-5 shrink-0 text-right text-xs text-ink-400">{x.n}</span><span><span className="text-white/90">{x.action}</span>{x.thought && <span className="block text-xs text-ink-400">{x.thought}</span>}</span></li>)}
              {s?.error && <li className="text-red-300">{s.error}</li>}
            </ol>
          </div>
          {s && s.trending.length > 0 && (
            <div className="panel p-4">
              <span className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Titles & thumbnails</span>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {s.trending.slice(0, 10).map((v, i) => (
                  <a key={i} href={v.url} target="_blank" rel="noreferrer" className="flex gap-3 rounded-lg p-1.5 hover:bg-white/[0.04]">
                    {v.thumb ? <img src={v.thumb} alt="" className="aspect-video w-24 shrink-0 rounded-md object-cover" /> : <div className="aspect-video w-24 shrink-0 rounded-md bg-ink-800" />}
                    <span className="min-w-0"><span className="line-clamp-2 text-xs font-medium">{v.title}</span><span className="block truncate text-[11px] text-ink-400">{v.channel} {v.views && `· ${v.views}`}</span></span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {s?.notes && (
        <div className="panel mt-5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="flex items-center gap-2 font-semibold"><NotebookPen className="h-4 w-4 text-brand-400" />Research notes</span>
            {projects.length > 0 && (
              <div className="flex gap-2 sm:ml-auto">
                <select className="input h-9 w-auto max-w-[220px]" value={target} onChange={(e) => setTarget(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
                <button className="btn-primary" onClick={async () => { await fetch(`/api/projects/${target}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addNote", note: s.notes }) }); toast("Notes added to the project brainstorm"); }}><Send className="h-4 w-4" />Send to brainstorm</button>
              </div>
            )}
          </div>
          <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-300">{s.notes}</pre>
        </div>
      )}
      {node}
    </div>
  );
}
