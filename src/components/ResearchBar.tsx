"use client";
import { useEffect, useRef, useState } from "react";
import { Monitor, Search as Youtube, Square } from "lucide-react";
import { showDesktop } from "./DesktopWidget";

export type ResearchJob = { id: string; topic: string };
type Step = { n: number; action: string; thought?: string; kind: string };

/** Subtle live status for an auto-research run on Reel's computer, with Stop. Calls onDone when the run ends. */
export function ResearchBar({ job, onDone, autoOpen = true }: { job: ResearchJob; onDone: (status: string) => void; autoOpen?: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
  const [stopping, setStopping] = useState(false);
  const since = useRef(0); const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    if (autoOpen) showDesktop(job.id);
    let alive = true; since.current = 0;
    const tick = async () => {
      while (alive) {
        try {
          const r = await fetch(`/api/research/${job.id}?since=${since.current}`, { cache: "no-store" });
          if (r.status === 404) { done.current("gone"); return; }
          const s = await r.json() as { status: string; steps: Step[] };
          if (s.steps.length) { since.current = s.steps[s.steps.length - 1].n; setLines((l) => [...l, ...s.steps.map((x) => x.action)].slice(-3)); }
          if (s.status !== "running" && s.status !== "paused") { done.current(s.status); return; }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    tick(); return () => { alive = false; };
  }, [job.id, autoOpen]);
  const stop = async () => { setStopping(true); await fetch(`/api/research/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "stop" }) }).catch(() => {}); };
  return (
    <div className="rounded-xl border border-red-400/15 bg-red-500/[0.06] px-3 py-2 text-xs text-ink-300" role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <Youtube className="h-3.5 w-3.5 shrink-0 animate-pulse text-red-400" />
        <span className="min-w-0 flex-1 truncate">{stopping ? "Stopping…" : <>Researching on YouTube… <span className="text-ink-400">“{job.topic}”</span></>}</span>
        <button className="flex items-center gap-1 text-ink-400 hover:text-white" onClick={() => showDesktop(job.id)} title="Watch on Reel’s computer"><Monitor className="h-3.5 w-3.5" />Watch</button>
        <button className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-ink-300 hover:text-white" onClick={stop} disabled={stopping}><Square className="h-3 w-3" />Stop</button>
      </div>
      {lines.length > 0 && <div className="mt-1 space-y-0.5 pl-5 text-[11px] text-ink-400">{lines.map((l, i) => <p key={i} className="truncate">· {l}</p>)}</div>}
    </div>
  );
}
