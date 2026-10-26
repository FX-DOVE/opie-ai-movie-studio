"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Eye, FileUp, MessageSquareText, PenLine, Send, Wand2 } from "lucide-react";
import { classify } from "@/lib/screenplay";
import { PromptBar } from "./PromptBar";
import { Brainstorm } from "./Brainstorm";
import { Spinner } from "../ui";
import type { TabProps } from "./common";

const INSERTS = [
  { k: "Title", t: "TITLE: " },
  { k: "Scene", t: "\nINT. LOCATION - DAY\n" },
  { k: "Action", t: "\n" },
  { k: "Dialog", t: "\nCHARACTER\nLine of dialogue.\n" },
  { k: "Transition", t: "\nCUT TO:\n" },
];

export function ScriptTab({ p, act, busy, toast, setP, openBrainstorm, next }: TabProps & { openBrainstorm?: boolean; next: () => void }) {
  const [text, setText] = useState(p.script);
  const [view, setView] = useState<"write" | "read">(p.script ? "read" : "write");
  const [chatOpen, setChatOpen] = useState(openBrainstorm || !p.script);
  const [msg, setMsg] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== p.script;
  useEffect(() => { setText(p.script); }, [p.script]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script: text }) });
      if (r.ok) setP(await r.json());
    }, 900);
    return () => clearTimeout(t);
  }, [text, dirty, p.id, setP]);
  const lines = useMemo(() => classify(text || ""), [text]);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [p.brainstorm.length]);

  const insert = (s: string) => {
    const el = ta.current; setView("write");
    if (!el) return setText((t) => t + s);
    const a = el.selectionStart, b = el.selectionEnd;
    setText(text.slice(0, a) + s + text.slice(b));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + s.length; });
  };
  const upload = async (f: File) => {
    const fd = new FormData(); fd.set("file", f); fd.set("kind", "script");
    const r = await fetch(`/api/projects/${p.id}/upload`, { method: "POST", body: fd });
    const j = await r.json(); if (j.project) { setP(j.project); toast("Script imported"); } else toast(j.error, true);
  };
  const send = async () => { if (!msg.trim()) return; const m = msg; setMsg(""); await act("brainstorm", { message: m }); };
  const writing = busy.has("writeScript") || !!(p.writing && Date.now() - p.writing < 20 * 60_000);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/10 p-0.5">
              <button onClick={() => setView("write")} className={`btn h-8 ${view === "write" ? "bg-white/10 text-white" : "text-ink-400"}`}><PenLine className="h-3.5 w-3.5" />Write</button>
              <button onClick={() => setView("read")} className={`btn h-8 ${view === "read" ? "bg-white/10 text-white" : "text-ink-400"}`}><Eye className="h-3.5 w-3.5" />Read</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {INSERTS.map((i) => <button key={i.k} onClick={() => insert(i.t)} className="chip h-8">{i.k}</button>)}
            </div>
            <div className="ml-auto flex gap-2">
              <label className="btn-outline cursor-pointer"><FileUp className="h-4 w-4" /><span className="hidden sm:inline">Import</span><input type="file" accept=".txt,.fountain,.md,text/plain" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
              <button className="btn-outline xl:hidden" onClick={() => setChatOpen((v) => !v)}><MessageSquareText className="h-4 w-4" /><span className="hidden sm:inline">Brainstorm</span></button>
            </div>
          </div>

          <div className="mx-auto mt-4 w-full max-w-4xl flex-1">
            {!text && view === "read" ? null : null}
            {view === "write" || !text ? (
              <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                placeholder={"Write or paste your screenplay — or describe your idea in the bar below and the AI will write it.\n\nTITLE: The Akara Girl\n\nINT. MARKET STALL - DAWN\nADA (24, red ankara, gold wristwatch) fans the fire.\n\nADA\nFirst customer gets it hot."}
                className="screenplay min-h-[60dvh] w-full resize-y rounded-2xl border border-white/[0.07] bg-ink-900 p-5 sm:p-8 text-[13.5px] leading-relaxed text-white/90 outline-none focus:border-brand-400/40" />
            ) : (
              <article className="screenplay mx-auto rounded-2xl border border-white/[0.07] bg-[#f6f4ee] px-5 py-8 text-[13.5px] leading-relaxed text-neutral-900 shadow-2xl sm:px-14 sm:py-12">
                {lines.map((l, i) => {
                  if (l.type === "blank") return <div key={i} className="h-3" />;
                  if (l.type === "title") return <h2 key={i} className="mb-6 text-center text-lg font-bold uppercase underline">{l.text.replace(/^title\s*:\s*/i, "")}</h2>;
                  if (l.type === "scene") return <p key={i} className="mt-4 font-bold uppercase">{l.text}</p>;
                  if (l.type === "character") return <p key={i} className="mt-3 pl-[30%] uppercase sm:pl-[38%]">{l.text}</p>;
                  if (l.type === "paren") return <p key={i} className="pl-[22%] sm:pl-[31%]">{l.text}</p>;
                  if (l.type === "dialog") return <p key={i} className="px-[12%] sm:px-[22%]">{l.text}</p>;
                  if (l.type === "transition") return <p key={i} className="mt-3 text-right uppercase">{l.text}</p>;
                  return <p key={i}>{l.text}</p>;
                })}
              </article>
            )}
          </div>
          <div className="mx-auto mt-4 flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
            <span>{dirty ? "Saving…" : text ? `Saved · ${text.split(/\s+/).filter(Boolean).length} words · ${lines.filter((l) => l.type === "scene").length} scenes` : "Empty script"}</span>
            <button className="btn-brand" disabled={!text.trim() || busy.has("extractAssets")} onClick={async () => { const r = await act("extractAssets"); if (r?.ok) next(); }}>
              {busy.has("extractAssets") ? <Spinner /> : <Wand2 className="h-4 w-4" />} Extract cast & assets <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <Brainstorm p={p} setP={setP} act={act} toast={toast} open={chatOpen} onScript={() => { setView("read"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </div>
      <PromptBar busy={writing} placeholder={p.script ? "Tell the writer how to revise the script… (e.g. add a twist in scene 2, make Ada angrier)" : "Describe your idea and the AI will write the screenplay…"}
        hint={writing ? "Writing your script in the background — you can leave this page, it keeps going…" : "Enter to send · Shift+Enter for a new line"}
        onSubmit={async (v) => { const r = await act("writeScript", { prompt: v }); if (r?.ok) { setView("read"); toast((r.result as { source: string })?.source === "mock" ? "Script drafted (demo mode)" : `Script written by ${(r.result as { source: string }).source}`); } }} />
    </>
  );
}
