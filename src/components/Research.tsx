"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Hand, Keyboard, RotateCw, Bot, Captions, Eye, Film, Globe2, Lightbulb, MonitorPlay, MousePointerClick, NotebookPen, Pause, Play, Send, Square, TrendingUp } from "lucide-react";
import { Spinner, useToast } from "./ui";
import { StatusPill } from "./AppShell";
import { AgentChat } from "./AgentChat";
import { showDesktop } from "./DesktopWidget";

type Step = { n: number; at: string; action: string; thought?: string; kind?: string };
type Video = { title: string; channel: string; views?: string; url: string; thumb?: string; published?: string };
type Session = { control?: boolean; needsUser?: string; id: string; goal: string; task: string; status: string; steps: Step[]; notes: string; findings: string[]; trending: Video[]; frames: string[]; transcript?: string; mode: string; provider: string; error?: string; maxSteps: number; screen?: string; pageUrl?: string; projectId?: string; savedToProject?: boolean };

const TASKS = [
  { id: "trending", label: "Trending topics", icon: TrendingUp, ph: "Niche, e.g. Nollywood family drama", presets: ["Nollywood family drama", "Anime short films", "African history documentaries", "Skincare product ads"] },
  { id: "analyse", label: "Titles & thumbnails", icon: Eye, ph: "Niche to analyse, e.g. AI animated stories", presets: ["AI animated stories", "Pixar style shorts", "True crime documentaries"] },
  { id: "watch", label: "Watch a video", icon: Film, ph: "Paste a YouTube video link", presets: [] },
  { id: "custom", label: "Custom goal", icon: Bot, ph: "Tell the agent anything to research on the web", presets: ["Find the 5 most viewed Nollywood YouTube channels and what they post"] },
];

function Md({ text }: { text: string }) {
  return <div className="space-y-1 text-sm leading-relaxed text-ink-300">{text.split("\n").map((l, i) => {
    if (!l.trim()) return <div key={i} className="h-2" />;
    const h = l.match(/^#{1,4}\s+(.*)/); if (h) return <p key={i} className="pt-2 font-semibold text-white">{h[1].replace(/\*\*/g, "")}</p>;
    const b = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    const t = (b ? b[1] : l).split(/(\*\*[^*]+\*\*)/g).map((x, k) => x.startsWith("**") ? <strong key={k} className="text-white">{x.slice(2, -2)}</strong> : x);
    return b ? <p key={i} className="flex gap-2 pl-1"><span className="text-brand-400">•</span><span>{t}</span></p> : <p key={i}>{t}</p>;
  })}</div>;
}

export function Research() {
  const [task, setTask] = useState("trending");
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState(14);
  const [s, setS] = useState<Session | null>(null);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [target, setTarget] = useState("");
  const [showT, setShowT] = useState(false);
  const { toast, node } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/projects").then((r) => r.json()).then((p) => { setProjects(p); const q = new URLSearchParams(location.search).get("project"); setTarget(q || p[0]?.id || ""); }); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [s?.steps.length]);

  const poll = (id: string) => {
    showDesktop(id);
    let last = 0; let acc: Step[] = [];
    const tick = async () => {
      const r = await fetch(`/api/research/${id}?since=${last}`); if (!r.ok) return;
      const x: Session = await r.json();
      acc = [...acc, ...x.steps]; last = acc.length ? acc[acc.length - 1].n : last;
      setS({ ...x, steps: acc });
      if (x.status === "running" || x.status === "paused") timer.current = setTimeout(tick, 900);
    };
    tick();
  };
  const start = async (g = goal) => {
    if (!g.trim()) return;
    setGoal(g);
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: g, task, url: task === "watch" ? g : undefined, projectId: target || undefined, maxSteps: steps }) });
    const j = await r.json(); if (!r.ok) return toast(j.error, true);
    if (timer.current) clearTimeout(timer.current);
    setShowT(false); poll(j.id);
  };
  const [ctrlOn, setCtrlOn] = useState(false);
  const [live, setLive] = useState<{ screen?: string; url?: string }>({});
  const [addr, setAddr] = useState("");
  const [kb, setKb] = useState("");
  const scr = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const send = async (e: Record<string, unknown>) => {
    if (!s) return; inFlight.current = true;
    try { const r = await fetch(`/api/research/${s.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }); const j = await r.json(); if (r.ok) { setLive(j); if (j.url && document.activeElement?.id !== "addr") setAddr(j.url); } } finally { inFlight.current = false; }
  };
  const controlling = ctrlOn && !!s && (s.status === "running" || s.status === "paused");
  useEffect(() => { if (!controlling) return; const t = setInterval(() => { if (!inFlight.current) send({ t: "frame" }); }, 450); return () => clearInterval(t); }, [controlling, s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s?.control && s.mode === "manual") setCtrlOn(true); }, [s?.id, s?.control, s?.mode]);
  const takeover = async () => { await ctl("takeover"); setCtrlOn(true); setTimeout(() => scr.current?.focus(), 50); };
  const handback = async () => { await ctl("handback"); setCtrlOn(false); setLive({}); };
  const openBrowser = async (url?: string) => {
    if (s && pagesLive() && s.mode === "manual") return send({ t: "navigate", url });
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manual: true, url }) }); const j = await r.json();
    if (timer.current) clearTimeout(timer.current); setCtrlOn(true); poll(j.id);
  };
  const pagesLive = () => s?.status === "running" || s?.status === "paused";
  const onScreenClick = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); send({ t: "click", x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); scr.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) return; // let paste etc. through
    if (e.key.length === 1) { e.preventDefault(); send({ t: "type", text: e.key }); }
    else if (["Enter", "Tab", "Backspace", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete"].includes(e.key)) { e.preventDefault(); send({ t: "key", key: e.key }); }
  };
  const ctl = (op: string) => s && fetch(`/api/research/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op }) });
  const running = s?.status === "running" || s?.status === "paused";
  const T = TASKS.find((t) => t.id === task)!;
  const acts = s?.steps.filter((x) => x.kind === "act").length || 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="flex flex-wrap items-center gap-2"><StatusPill />{s && <span className="badge bg-sky-500/10 text-sky-300"><Bot className="h-3 w-3" />{s.provider}</span>}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Virtual desktop</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-400">Its live screen opens in the <b className="text-ink-200">computer</b> window (top-right). A research agent with its own Chromium browser. Each step it looks at a screenshot and the page’s accessibility tree, then decides to navigate, click, type, scroll, read transcripts or sample video frames — and writes notes straight into your project’s brainstorm.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto pb-1">
        {TASKS.map((t) => <button key={t.id} disabled={running} onClick={() => { setTask(t.id); setGoal(""); }} className={`chip shrink-0 ${task === t.id ? "chip-on" : ""}`}><t.icon className="h-3.5 w-3.5" />{t.label}</button>)}
      </div>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row">
        <input className="input h-11 flex-1" placeholder={T.ph} value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !running && start()} disabled={running} />
        <div className="flex gap-2">
          <select className="input h-11 w-auto min-w-0 flex-1 lg:max-w-[200px]" value={target} onChange={(e) => setTarget(e.target.value)} disabled={running} title="Save notes to project">
            <option value="">Don’t save to a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>→ {p.title}</option>)}
          </select>
          <select className="input h-11 w-[92px]" value={steps} onChange={(e) => setSteps(Number(e.target.value))} disabled={running} title="Max agent steps">{[6, 10, 14, 20, 30].map((n) => <option key={n} value={n}>{n} steps</option>)}</select>
        </div>
        {running ? (
          <div className="flex gap-2">
            {s?.status === "paused" ? <button className="btn-outline h-11 flex-1" onClick={() => ctl("resume")}><Play className="h-4 w-4" />Resume</button> : <button className="btn-outline h-11 flex-1" onClick={() => ctl("pause")}><Pause className="h-4 w-4" />Pause</button>}
            <button className="btn-outline h-11 flex-1 text-red-300" onClick={() => ctl("stop")}><Square className="h-4 w-4" />Stop</button>
          </div>
        ) : <button className="btn-brand h-11 px-5" onClick={() => start()} disabled={!goal.trim()}><Play className="h-4 w-4" />Start agent</button>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-[11px] text-ink-500">Open browser:</span>{[["Google Drive", "https://drive.google.com"], ["YouTube", "https://www.youtube.com"], ["Gmail", "https://mail.google.com"], ["Google", "https://www.google.com"]].map(([l, u]) => <button key={l} className="chip" onClick={() => openBrowser(u)}><Globe2 className="h-3.5 w-3.5" />{l}</button>)}<span className="text-[11px] text-ink-500">· logins persist in this workspace’s browser profile</span></div>
      {!running && T.presets.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{T.presets.map((p) => <button key={p} className="chip" onClick={() => start(p)}>{p}</button>)}</div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="contents">
        <div className="panel flex h-[560px] flex-col overflow-hidden lg:h-[640px]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5"><Bot className="h-4 w-4 text-brand-400" /><span className="text-sm font-semibold">Talk to the agent</span><span className="text-[10px] text-ink-500">it drives the desktop for you</span></div>
          <AgentChat projectId={target || undefined} className="flex-1" onSession={(id) => { if (timer.current) clearTimeout(timer.current); setShowT(false); poll(id); }} starters={["What’s trending in Nollywood family drama right now?", "Watch https://www.youtube.com/watch?v=jNQXAC9IVRw and tell me what happens", "Compare thumbnails of top anime short films"]} />
        </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="panel p-4">
            <span className="label flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" />Action log</span>
            <ol className="max-h-[340px] space-y-2 overflow-y-auto pr-1 text-sm">
              {!s && <li className="text-ink-400">Idle — pick a task and start the agent.</li>}
              {s?.steps.map((x) => (
                <li key={x.n} className="flex gap-2">
                  <span className="mt-0.5 shrink-0">{x.kind === "note" ? <NotebookPen className="h-3.5 w-3.5 text-emerald-300" /> : x.kind === "error" ? <Square className="h-3.5 w-3.5 text-red-300" /> : x.kind === "info" ? <Bot className="h-3.5 w-3.5 text-sky-300" /> : <MousePointerClick className="h-3.5 w-3.5 text-ink-400" />}</span>
                  <span className="min-w-0"><span className="break-words text-white/90">{x.action}</span>{x.thought && <span className="block break-words text-xs text-ink-400">{x.thought}</span>}</span>
                </li>
              ))}
              {s?.error && <li className="break-words text-red-300">{s.error}</li>}
              <div ref={logEnd} />
            </ol>
          </div>
          {s && s.findings.length > 0 && (
            <div className="panel p-4"><span className="label flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" />Findings ({s.findings.length})</span>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-ink-300">{s.findings.map((f, i) => <li key={i} className="break-words">• {f}</li>)}</ul></div>
          )}
          {s && s.trending.length > 0 && (
            <div className="panel p-4">
              <span className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Videos seen ({s.trending.length})</span>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {s.trending.slice(0, 20).map((v, i) => (
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

      {s?.transcript && (
        <div className="panel mt-5 p-4"><button className="flex items-center gap-2 text-sm font-semibold" onClick={() => setShowT(!showT)}><Captions className="h-4 w-4 text-sky-300" />Transcript ({s.transcript.split(" ").length} words) <span className="text-xs font-normal text-ink-400">{showT ? "hide" : "show"}</span></button>
          {showT && <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-400">{s.transcript}</p>}</div>
      )}
      {(s?.notes || (s && !running && s.status !== "error")) && (
        <div className="panel mt-5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="flex items-center gap-2 font-semibold"><NotebookPen className="h-4 w-4 text-brand-400" />Research notes</span>
            {s?.notes && <span className="text-[11px] text-ink-500">by {s.provider}</span>}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {s?.savedToProject && s.projectId ? <Link className="btn-primary" href={`/studio/${s.projectId}?brainstorm=1`}><Send className="h-4 w-4" />Brainstorm with these notes</Link>
                : s?.notes && projects.length > 0 && <>
                  <select className="input h-9 w-auto max-w-[220px]" value={target} onChange={(e) => setTarget(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
                  <button className="btn-primary" disabled={!target} onClick={async () => { await fetch(`/api/projects/${target}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addNote", note: s.notes, goal: s.goal, provider: s.provider }) }); setS({ ...s, savedToProject: true, projectId: target }); toast("Notes saved to the project"); }}><Send className="h-4 w-4" />Save to project</button>
                </>}
            </div>
          </div>
          <div className="mt-4">{s?.notes ? <Md text={s.notes} /> : <p className="text-sm text-ink-400">No notes were produced.</p>}</div>
        </div>
      )}
      {node}
    </div>
  );
}
