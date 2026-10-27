"use client";
import { friendly, ndjson } from "@/lib/net";
import { useEffect, useRef, useState } from "react";
import { Check, FileText, Lightbulb, MessageSquareText, NotebookPen, RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import type { ChatMsg, Idea, Project } from "@/lib/types";
import { Spinner } from "../ui";
import type { Act } from "./common";
import { autoResearchPref, setAutoResearchPref } from "@/lib/autopref";
import { ResearchBar, type ResearchJob } from "../ResearchBar";

const STARTERS: Record<string, string[]> = {
  drama: ["Pitch 3 Nollywood family-drama hooks for Shorts", "A betrayal story with a twist in the last 5 seconds", "Give me a romance with a ticking clock"],
  documentary: ["3 angles for a doc about Lagos danfo drivers", "A history mystery most people get wrong", "Turn my research notes into a doc outline"],
  ad: ["Hooks for a budget smartwatch ad on TikTok", "Problem → solution ad for a skincare brand", "A funny 15s ad for a food delivery app"],
};

/** Tiny safe markdown: headings, bullets, bold/italic, code. */
function Md({ text }: { text: string }) {
  const inline = (s: string, k: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return <span key={k}>{parts.map((x, i) => x.startsWith("**") ? <strong key={i} className="text-white">{x.slice(2, -2)}</strong> : x.startsWith("`") ? <code key={i} className="rounded bg-white/10 px-1">{x.slice(1, -1)}</code> : x.startsWith("*") && x.length > 2 ? <em key={i}>{x.slice(1, -1)}</em> : x)}</span>;
  };
  return <div className="space-y-1.5">{text.split("\n").map((l, i) => {
    if (!l.trim()) return <div key={i} className="h-1" />;
    const h = l.match(/^#{1,4}\s+(.*)/); if (h) return <p key={i} className="pt-1 font-semibold text-white">{inline(h[1], i)}</p>;
    const b = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/); if (b) return <p key={i} className="flex gap-2 pl-1"><span className="text-brand-400">•</span><span>{inline(b[1], i)}</span></p>;
    return <p key={i}>{inline(l, i)}</p>;
  })}</div>;
}

function IdeaCard({ idea, onUse, onWrite, busy }: { idea: Idea; onUse: () => void; onWrite: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-brand-400/25 bg-gradient-to-b from-brand-500/10 to-transparent p-3">
      <div className="flex items-start gap-2"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0"><p className="text-sm font-semibold text-white">{idea.title}</p><p className="mt-0.5 text-[13px] text-ink-300">{idea.logline}</p></div></div>
      {idea.hook && <p className="mt-2 text-xs text-ink-400"><span className="text-sky-300">Hook · </span>{idea.hook}</p>}
      {(idea.beats?.length || idea.characters?.length) ? <button className="mt-2 text-[11px] text-brand-300 hover:underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} beat sheet & characters</button> : null}
      {open && (
        <div className="mt-2 space-y-2 text-xs text-ink-300">
          {idea.beats?.length ? <ol className="list-decimal space-y-0.5 pl-5">{idea.beats.map((b, i) => <li key={i}>{b}</li>)}</ol> : null}
          {idea.characters?.length ? <ul className="space-y-0.5">{idea.characters.map((c, i) => <li key={i}><span className="font-medium text-white">{c.name}</span> — {c.description}</li>)}</ul> : null}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-outline h-8 text-xs" onClick={onUse} disabled={busy}><Check className="h-3.5 w-3.5" />Use this idea</button>
        <button className="btn-primary h-8 text-xs" onClick={onWrite} disabled={busy}>{busy ? <Spinner /> : <FileText className="h-3.5 w-3.5" />}Write full script</button>
      </div>
    </div>
  );
}

export function Brainstorm({ p, setP, act, toast, open, onScript }: { p: Project; setP: (p: Project) => void; act: Act; toast: (t: string, e?: boolean) => void; open: boolean; onScript: () => void }) {
  const [msg, setMsg] = useState("");
  const [live, setLive] = useState<{ text: string; provider?: string } | null>(null);
  const [writing, setWriting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const RK = `rf-auto-${p.id}`;
  const [autoR, setAutoR] = useState(true);
  useEffect(() => setAutoR(autoResearchPref()), []);
  const [rjob, setRjobS] = useState<ResearchJob | null>(null);
  const setRjob = (j: ResearchJob | null) => { setRjobS(j); try { if (j) sessionStorage.setItem(RK, JSON.stringify(j)); else sessionStorage.removeItem(RK); } catch { /* */ } };
  useEffect(() => { try { const j = sessionStorage.getItem(RK); if (j) setRjobS(JSON.parse(j)); } catch { /* */ } }, [RK]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [p.brainstorm.length, live?.text]);

  const reload = async () => { const r = await fetch(`/api/projects/${p.id}`); if (r.ok) setP(await r.json()); };
  const send = async (text = msg) => {
    if (!text.trim() || live) return;
    setMsg(""); setLive({ text: "" });
    const ac = new AbortController(); abort.current = ac;
    try {
      let acc = ""; let prov: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ndjson(`/api/projects/${p.id}/brainstorm`, { message: text, autoResearch: autoResearchPref() }, (ev: any) => {
        if (ev.type === "provider") prov = ev.provider + (ev.model ? ` · ${ev.model}` : "");
        if (ev.type === "delta") acc += ev.text;
        if (ev.type === "error") throw new Error(ev.error);
        if (ev.type === "research") { setRjob({ id: ev.id, topic: ev.topic }); return; }
        setLive({ text: acc.replace(/```ideas[\s\S]*$/, "\n_…shaping idea cards…_"), provider: prov });
      }, ac.signal);
      await reload();
    } catch (e) { if ((e as Error).name !== "AbortError") toast(friendly(e), true); setMsg(text); }
    setLive(null); abort.current = null;
  };
  const ideaText = (i: Idea) => `${i.title}. ${i.logline}${i.hook ? ` Hook: ${i.hook}.` : ""}${i.beats?.length ? ` Beats: ${i.beats.join(" → ")}.` : ""}${i.characters?.length ? ` Characters: ${i.characters.map((c) => `${c.name} (${c.description})`).join("; ")}.` : ""}`;
  const use = async (i: Idea) => { const r = await act("useIdea", { idea: i }); if (r?.ok) toast(`“${i.title}” is now the project idea`); };
  const write = async (i: Idea) => {
    setWriting(true);
    await act("useIdea", { idea: i }, { quiet: true });
    const r = await act("writeScript", { prompt: `Write the full screenplay for this idea: ${ideaText(i)}` });
    setWriting(false);
    if (r?.ok) { toast(`Script written by ${(r.result as { source: string })?.source === "mock" ? "demo template" : (r.result as { source: string }).source}`); onScript(); }
  };
  const research = p.research || [];
  const shown: ChatMsg[] = p.brainstorm;

  return (
    <aside className={`${open ? "flex" : "hidden"} xl:flex min-h-[520px] w-full flex-col border-t border-white/[0.06] bg-ink-900/60 xl:sticky xl:top-0 xl:h-dvh xl:w-[420px] xl:border-l xl:border-t-0`}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 xl:pr-16">
        <MessageSquareText className="h-4 w-4 text-brand-400" /><span className="text-sm font-semibold">Brainstorm</span>
        <span className="badge bg-white/[0.06] text-ink-300 capitalize">{p.mode === "ad" ? "Product ad" : p.mode}</span>
        <button onClick={() => window.dispatchEvent(new CustomEvent("rf:chat", { detail: { text: `Research on your computer for "${p.title}": ` } }))} className="ml-auto flex items-center gap-1 text-[11px] text-ink-400 hover:text-white" title="Ask Reel to research on its computer — notes attach here"><NotebookPen className="h-3.5 w-3.5" />Ask Reel to research</button>
        {shown.length > 0 && <button className=" text-ink-400 hover:text-white" title="Clear conversation" onClick={async () => { if (confirm("Clear this brainstorm conversation?")) { await act("clearBrainstorm", {}, { quiet: true }); } }}><RotateCcw className="h-4 w-4" /></button>}
      </div>
      {research.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-4 py-2">
          <span className="text-[11px] text-ink-400">Context:</span>
          {research.map((r) => <span key={r.id} className="badge max-w-[220px] bg-emerald-500/10 text-emerald-300" title={r.notes.slice(0, 400)}><NotebookPen className="h-3 w-3 shrink-0" /><span className="truncate">{r.goal}</span><button aria-label="Remove" onClick={() => act("deleteResearch", { researchId: r.id }, { quiet: true })}><X className="h-3 w-3" /></button></span>)}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {shown.length === 0 && !live && (
          <div className="space-y-3">
            <p className="text-sm text-ink-400">Throw out a topic, feeling or half-idea. ReelForge pitches loglines, hooks, beat sheets and characters as cards — pick one and it writes the full script.{research.length ? " Your research notes are included as context." : ""}</p>
            <div className="flex flex-col gap-1.5">{(STARTERS[p.mode] || STARTERS.drama).map((s) => <button key={s} className="chip justify-start text-left" onClick={() => send(s)}><Sparkles className="h-3 w-3 shrink-0" />{s}</button>)}</div>
          </div>
        )}
        {shown.map((m, i) => m.kind === "research" ? (
          <div key={i} className="mr-2 space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] px-3.5 py-2.5 text-sm leading-relaxed text-ink-300">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-300"><NotebookPen className="h-3 w-3" />Research from Reel’s computer</p>
            <Md text={m.content} />
            {i === shown.length - 1 && !live && <button className="chip" onClick={() => send("Using that research, pitch 3 ideas with strong hooks.")}><Sparkles className="h-3 w-3" />Pitch ideas from this research</button>}
          </div>
        ) : m.kind === "note" ? (
          <p key={i} className="text-center text-[11px] text-emerald-300/80">{m.content}</p>
        ) : m.role === "user" ? (
          <div key={i} className="ml-8 whitespace-pre-wrap rounded-2xl bg-brand-500/20 px-3.5 py-2.5 text-sm text-white">{m.content}</div>
        ) : (
          <div key={i} className="mr-2 space-y-2.5">
            <div className="rounded-2xl bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-ink-300"><Md text={m.content} /></div>
            {m.ideas?.map((idea, k) => <IdeaCard key={k} idea={idea} busy={writing} onUse={() => use(idea)} onWrite={() => write(idea)} />)}
          </div>
        ))}
        {live && (
          <div className="mr-2 rounded-2xl bg-white/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-ink-300">
            {live.text ? <Md text={live.text} /> : <span className="flex items-center gap-2 text-ink-400"><Spinner />Thinking…</span>}
            
          </div>
        )}
        {rjob && <ResearchBar job={rjob} onDone={(st) => { setRjob(null); reload(); if (st === "done") toast("Research added to the brainstorm"); }} />}
        {writing && <div className="flex items-center gap-2 text-xs text-ink-400"><Spinner />Writing the full screenplay…</div>}
        <div ref={end} />
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <label className="mb-2 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-ink-400" title="When you name a concrete topic, Reel researches it on YouTube on its computer (once per topic)">
          <input type="checkbox" className="accent-brand-500" checked={autoR} onChange={(e) => { setAutoR(e.target.checked); setAutoResearchPref(e.target.checked); }} />Auto-research topics on YouTube
        </label>
        <div className="flex gap-2">
          <textarea rows={1} className="input min-h-10 resize-none py-2.5" placeholder="Brainstorm an idea…" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          {live ? <button className="btn-outline h-10 w-10 px-0" onClick={() => abort.current?.abort()} aria-label="Stop"><Square className="h-4 w-4" /></button>
            : <button className="btn-primary h-10 w-10 px-0" onClick={() => send()} disabled={!msg.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>}
        </div>
      </div>
    </aside>
  );
}
