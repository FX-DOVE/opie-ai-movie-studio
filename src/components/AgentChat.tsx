"use client";
import { showDesktop } from "./DesktopWidget";
import { friendly, ndjson } from "@/lib/net";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronLeft, Loader2, Paperclip, RotateCw, Square, Volume2, VolumeX, Wrench, X } from "lucide-react";
import { Mascot } from "./Mascot";
import { autoResearchPref } from "@/lib/autopref";
import { ResearchBar, type ResearchJob } from "./ResearchBar";

type Item =
  | { k: "user"; text: string }
  | { k: "ai"; text: string; provider?: string; live?: boolean }
  | { k: "tool"; id: string; name: string; args: Record<string, unknown>; ok?: boolean; summary?: string; status?: string[] }
  | { k: "info"; text: string; retry?: string };

const LABEL: Record<string, string> = { create_project: "Create project", open_project: "Open project", list_projects: "List projects", brainstorm: "Brainstorm", use_idea: "Use idea", write_script: "Write script", extract_assets: "Extract assets", generate_asset_images: "Generate asset images", build_storyboard: "Build storyboard", generate_frames: "Generate frames", edit_shot: "Edit shot", continuity_check: "Continuity check", fix_continuity: "Fix continuity", voiceover: "Voiceover", render_video: "Render video", edit_video: "Edit video", research: "Virtual desktop research", project_status: "Project status" };

function Text({ t }: { t: string }) {
  return <>{t.split("\n").map((l, i) => { const b = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/); const parts = (b ? b[1] : l).replace(/^#+\s*/, "").split(/(\*\*[^*]+\*\*)/g).map((x, k) => x.startsWith("**") ? <strong key={k} className="text-white">{x.slice(2, -2)}</strong> : x); return l.trim() ? <p key={i} className={b ? "flex gap-1.5 pl-1" : ""}>{b && <span className="text-brand-400">•</span>}<span>{parts}</span></p> : <div key={i} className="h-1.5" />; })}</>;
}

export function AgentChat({ projectId, onSession, className = "", starters }: { projectId?: string; onSession?: (id: string) => void; className?: string; starters?: string[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [rjob, setRjob] = useState<ResearchJob | null>(null);
  const researchDone = async (j: ResearchJob, st: string) => {
    setRjob(null);
    const r = await fetch(`/api/research/${j.id}?since=99999`).then((x) => x.ok ? x.json() : null).catch(() => null);
    if (r?.notes) setItems((x) => [...x, { k: "ai", text: r.notes, provider: r.provider }]);
    else if (st !== "done") setItems((x) => [...x, { k: "info", text: `Research on “${j.topic}” ${st}` }]);
    if (r?.projectId) router.refresh();
  };
  const conv = useRef<string | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => { conv.current = sessionStorage.getItem("opie-conv") || undefined; try { setItems(JSON.parse(sessionStorage.getItem("opie-chat") || "[]")); } catch { /* */ } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); if (!busy) sessionStorage.setItem("opie-chat", JSON.stringify(items.slice(-60))); }, [items, busy, thinking]);

  const [files, setFiles] = useState<{ name: string; text?: string }[]>([]);
  useEffect(() => { const f = (e: Event) => { const t = (e as CustomEvent).detail?.text; if (t) setInput(t); }; window.addEventListener("rf:chat", f); return () => window.removeEventListener("rf:chat", f); }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = async (text = input) => {
    let msg = text.trim(); if (!msg && !files.length) return; setInput("");
    if (files.length) { msg = (msg || "Take a look at the attached file.") + "\n\n" + files.map((f) => `[Attached: ${f.name}]${f.text ? "\n" + f.text.slice(0, 6000) : ""}`).join("\n\n"); setFiles([]); }
    setItems((x) => [...x, { k: "user", text: msg }]);
    const interrupting = busy;
    if (!interrupting) setBusy(true);
    try {
      let open = false;
      const push = (f: (x: Item[]) => Item[]) => setItems(f);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ndjson("/api/agent", { convId: conv.current, message: msg, projectId, autoResearch: autoResearchPref() }, (e: any) => {
          if (e.type === "conv") { conv.current = e.id; sessionStorage.setItem("opie-conv", e.id); }
          else if (e.type === "thinking") setThinking(true);
          else if (e.type === "delta") { setThinking(false); if (!e.text) return; push((x) => { const last = x[x.length - 1]; if (open && last?.k === "ai") return [...x.slice(0, -1), { ...last, text: last.text + e.text }]; open = true; return [...x, { k: "ai", text: e.text.replace(/^\s+/, ""), live: true }]; }); }
          else if (e.type === "turn_end") { open = false; setThinking(false); push((x) => x.map((it, i) => i === x.length - 1 && it.k === "ai" ? { ...it, live: false, provider: e.provider } : it).filter((it) => !(it.k === "ai" && !it.text.trim()))); }
          else if (e.type === "tool_start") { open = false; push((x) => [...x, { k: "tool", id: e.id, name: e.name, args: e.args }]); }
          else if (e.type === "status") push((x) => { const i = x.map((it) => it.k).lastIndexOf("tool"); if (i < 0 || (x[i] as { ok?: boolean }).ok !== undefined) return [...x, { k: "info", text: e.text }]; const t = x[i] as Extract<Item, { k: "tool" }>; return [...x.slice(0, i), { ...t, status: [...(t.status || []), e.text].slice(-6) }, ...x.slice(i + 1)]; });
          else if (e.type === "tool_args") push((x) => x.map((it) => it.k === "tool" && it.id === e.id ? { ...it, args: e.args } : it));
          else if (e.type === "plan") push((x) => [...x, { k: "info", text: `Plan: ${e.steps.map((t: string) => LABEL[t] || t).join(" → ")}` }]);
          else if (e.type === "tool_end") push((x) => x.map((it) => it.k === "tool" && it.id === e.id ? { ...it, ok: e.ok, summary: e.summary } : it));
          else if (e.type === "research") setRjob({ id: e.id, topic: e.topic });
          else if (e.type === "session") { showDesktop(e.id); onSession?.(e.id); }
          else if (e.type === "project") push((x) => [...x, { k: "info", text: `Created project “${e.title}” — /studio/${e.id}` }]);
          else if (e.type === "error") push((x) => [...x, { k: "info", text: "⚠ " + e.error }]);
          else if (e.type === "done" && e.projectId && !interrupting) router.refresh();
      });
    } catch (err) { setItems((x) => [...x, { k: "info", text: "⚠ " + friendly(err), retry: msg }]); }
    finally { if (!interrupting) { setBusy(false); setThinking(false); } }
  };

  const pick = async (fl: FileList | null) => {
    if (!fl) return; const out: { name: string; text?: string }[] = [];
    for (const f of Array.from(fl).slice(0, 3)) out.push({ name: f.name, text: /^text\/|json|srt|fountain|md$/.test(f.type + f.name) && f.size < 200_000 ? await f.text() : undefined });
    setFiles((x) => [...x, ...out]);
  };
  const time = (d = new Date()) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-4 text-[15px] sm:text-sm">
        {!items.length && <div className="flex flex-col items-center px-4 pt-6 text-center">
          <Mascot size={72} still />
          <p className="mt-4 text-base font-medium text-white">Hi, I’m Reel.</p>
          <p className="mt-1 max-w-xs text-sm text-ink-400">Tell me what you want to make. I can start projects, brainstorm, write, storyboard, voice and render — or research on my computer.</p>
          <div className="mt-6 flex w-full flex-col gap-2">{(starters || ["Make a 60s TikTok ad for my akara brand", "What’s trending in Nollywood family drama?", "Turn my last idea into a 3-scene script"]).map((s) => <button key={s} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-ink-200 transition hover:border-brand-500/50 hover:text-white" onClick={() => send(s)}>{s}</button>)}</div></div>}
        {items.map((it, i) => it.k === "user" ? <div key={i} className="flex justify-end"><div className="max-w-[82%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-brand-500 px-3.5 py-2 text-ink-950">{it.text.replace(/\n\n\[Attached: ([^\]]+)\][\s\S]*$/, "\n📎 $1")}</div></div>
          : it.k === "ai" ? <div key={i} className="flex items-end gap-2"><img src="/brand/reel.webp" alt="" className="h-7 w-7 shrink-0 rounded-full" /><div className="max-w-[82%] space-y-1 break-words rounded-[20px] rounded-bl-md bg-ink-800 px-3.5 py-2 text-ink-100"><Text t={it.text} />{it.live && <span className="inline-block h-3 w-1.5 animate-pulse bg-brand-400 align-middle" />}</div></div>
          : it.k === "tool" ? <div key={i} className="ml-9 max-w-[82%] rounded-2xl border border-white/[0.08] bg-ink-900 p-2.5 text-xs">
              <div className="flex items-center gap-2 font-medium text-white">{it.ok === undefined ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" /> : it.ok ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}<Wrench className="h-3 w-3 text-ink-500" />{LABEL[it.name] || it.name}<span className="truncate font-normal text-ink-500">{Object.values(it.args || {}).filter((v) => typeof v === "string").join(" · ").slice(0, 60)}</span></div>
              {it.status && it.ok === undefined && <ul className="mt-1.5 space-y-0.5 text-ink-400">{it.status.map((s, j) => <li key={j} className="truncate">{s}</li>)}</ul>}
              {it.summary && <details className="mt-1.5 text-ink-400"><summary className="cursor-pointer select-none">result</summary><p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{it.summary}</p></details>}
            </div>
          : it.retry ? <div key={i} role="alert" className="mx-auto flex max-w-[90%] flex-col items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-center text-xs text-red-200">{it.text.replace(/^⚠ /, "")}<button className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-950" onClick={() => { setItems((x) => x.filter((_, j) => j !== i && !(j === i - 1 && x[j].k === "user"))); send(it.retry); }}><RotateCw className="h-3.5 w-3.5" />Retry</button></div>
          : <p key={i} className="text-center text-[11px] text-ink-500">{it.text.includes("/studio/") ? <a className="underline" href={it.text.split("— ")[1]}>{it.text.split(" — ")[0]} → open</a> : it.text}</p>)}
        {thinking && <div className="flex items-end gap-2" aria-label="Reel is typing"><img src="/brand/reel.webp" alt="" className="h-7 w-7 rounded-full" /><div className="dot-typing flex gap-1 rounded-[20px] rounded-bl-md bg-ink-800 px-4 py-3">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-300" />)}</div></div>}
        <div ref={end} />
      </div>
      <div className="pb-safe border-t border-white/[0.06] bg-ink-950 px-3 pt-2">
        {rjob && <div className="mb-2"><ResearchBar job={rjob} onDone={(st) => researchDone(rjob, st)} /></div>}
        {files.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{files.map((f, j) => <span key={j} className="chip h-7">📎 {f.name}<button aria-label="Remove attachment" onClick={() => setFiles((x) => x.filter((_, k) => k !== j))}><X className="h-3 w-3" /></button></span>)}</div>}
        <div className="mb-2 flex items-end gap-2">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <button aria-label="Attach file" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-white" onClick={() => fileRef.current?.click()}><Paperclip className="h-5 w-5" /></button>
          <div className="flex min-h-10 flex-1 items-end rounded-[22px] border border-white/10 bg-ink-900 pl-4 pr-1 focus-within:border-white/25">
            <textarea rows={1} value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px"; }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); send(); } }} placeholder={busy ? "Redirect Reel, or say “stop”…" : "Message Reel"} aria-label="Message" className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-ink-500 sm:text-sm" />
            {busy && !input ? <button aria-label="Stop" className="m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-ink-950" onClick={() => send("stop")}><Square className="h-3.5 w-3.5 fill-current" /></button>
              : <button aria-label="Send" className="m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-ink-950 disabled:bg-white/10 disabled:text-ink-500" disabled={!input.trim() && !files.length} onClick={() => send()}><ArrowUp className="h-4 w-4" /></button>}
          </div>
        </div>
        {items.length > 0 && !busy && <button className="mb-2 block w-full text-center text-[11px] text-ink-500 hover:text-ink-300" onClick={() => { setItems([]); conv.current = undefined; sessionStorage.removeItem("opie-conv"); sessionStorage.removeItem("opie-chat"); }}>New conversation · {time()}</button>}
      </div>
    </div>
  );
}

/** App-wide assistant: the draggable Reel mascot; opens a fullscreen chat on phones, a large panel on desktop. */
export function FloatingAgent() {
  const path = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(localStorage.getItem("rf-mute") === "1"); const o = () => setOpen(true); window.addEventListener("rf:chat", o); return () => window.removeEventListener("rf:chat", o); }, []);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); const mob = matchMedia("(max-width: 767px)").matches; if (mob) document.body.style.overflow = "hidden"; return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [open]);
  if (path.startsWith("/admin")) return null;
  const projectId = path.match(/^\/studio\/([^/]+)/)?.[1];
  const mute = () => { const m = !muted; setMuted(m); localStorage.setItem("rf-mute", m ? "1" : "0"); };
  return (
    <>
      {open && <div role="dialog" aria-label="Chat with Reel" className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-ink-950 md:inset-auto md:bottom-6 md:right-6 md:h-[min(760px,calc(100dvh-48px))] md:w-[520px] md:overflow-hidden md:rounded-3xl md:border md:border-white/10 md:shadow-[0_40px_120px_-20px_rgba(0,0,0,.8)]">
        <header className="pt-safe shrink-0 border-b border-white/[0.06] bg-ink-950/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-2 md:px-4">
            <button aria-label="Close chat" className="grid h-10 w-10 place-items-center rounded-full text-ink-300 hover:bg-white/5 md:hidden" onClick={() => setOpen(false)}><ChevronLeft className="h-6 w-6" /></button>
            <div className="relative"><img src="/brand/reel.webp" alt="" className="h-9 w-9 rounded-full" /><span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-emerald-400" /></div>
            <div className="min-w-0 flex-1 leading-tight"><p className="text-[15px] font-semibold">Reel</p><p className="truncate text-xs text-ink-400">{projectId ? "Working on this project" : "Producer · ReelForge Studio"}</p></div>
            <button aria-label={muted ? "Unmute sounds" : "Mute sounds"} className="grid h-10 w-10 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-white" onClick={mute}>{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
            <button aria-label="Close" className="hidden h-10 w-10 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-white md:grid" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
          </div>
        </header>
        <AgentChat projectId={projectId} className="flex-1" />
      </div>}
      {!open && <Mascot floating onTap={() => setOpen(true)} />}
    </>
  );
}
