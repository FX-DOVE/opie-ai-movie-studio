"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, Loader2, Send, Sparkles, Square, Wrench, X } from "lucide-react";

type Item =
  | { k: "user"; text: string }
  | { k: "ai"; text: string; provider?: string; live?: boolean }
  | { k: "tool"; id: string; name: string; args: Record<string, unknown>; ok?: boolean; summary?: string; status?: string[] }
  | { k: "info"; text: string };

const LABEL: Record<string, string> = { create_project: "Create project", open_project: "Open project", list_projects: "List projects", brainstorm: "Brainstorm", use_idea: "Use idea", write_script: "Write script", extract_assets: "Extract assets", generate_asset_images: "Generate asset images", build_storyboard: "Build storyboard", generate_frames: "Generate frames", edit_shot: "Edit shot", continuity_check: "Continuity check", fix_continuity: "Fix continuity", voiceover: "Voiceover", render_video: "Render video", edit_video: "Edit video", research: "Virtual desktop research", project_status: "Project status" };

function Text({ t }: { t: string }) {
  return <>{t.split("\n").map((l, i) => { const b = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/); const parts = (b ? b[1] : l).replace(/^#+\s*/, "").split(/(\*\*[^*]+\*\*)/g).map((x, k) => x.startsWith("**") ? <strong key={k} className="text-white">{x.slice(2, -2)}</strong> : x); return l.trim() ? <p key={i} className={b ? "flex gap-1.5 pl-1" : ""}>{b && <span className="text-brand-400">•</span>}<span>{parts}</span></p> : <div key={i} className="h-1.5" />; })}</>;
}

export function AgentChat({ projectId, onSession, className = "", starters }: { projectId?: string; onSession?: (id: string) => void; className?: string; starters?: string[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const conv = useRef<string | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => { conv.current = sessionStorage.getItem("opie-conv") || undefined; try { setItems(JSON.parse(sessionStorage.getItem("opie-chat") || "[]")); } catch { /* */ } }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); if (!busy) sessionStorage.setItem("opie-chat", JSON.stringify(items.slice(-60))); }, [items, busy, thinking]);

  const send = async (text = input) => {
    const msg = text.trim(); if (!msg) return; setInput("");
    setItems((x) => [...x, { k: "user", text: msg }]);
    const interrupting = busy;
    if (!interrupting) setBusy(true);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ convId: conv.current, message: msg, projectId }) });
      if (!r.body) throw new Error("No response");
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      let open = false;
      const push = (f: (x: Item[]) => Item[]) => setItems(f);
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const l of lines) {
          if (!l.trim()) continue; const e = JSON.parse(l);
          if (e.type === "conv") { conv.current = e.id; sessionStorage.setItem("opie-conv", e.id); }
          else if (e.type === "thinking") setThinking(true);
          else if (e.type === "delta") { setThinking(false); if (!e.text) continue; push((x) => { const last = x[x.length - 1]; if (open && last?.k === "ai") return [...x.slice(0, -1), { ...last, text: last.text + e.text }]; open = true; return [...x, { k: "ai", text: e.text.replace(/^\s+/, ""), live: true }]; }); }
          else if (e.type === "turn_end") { open = false; setThinking(false); push((x) => x.map((it, i) => i === x.length - 1 && it.k === "ai" ? { ...it, live: false, provider: e.provider } : it).filter((it) => !(it.k === "ai" && !it.text.trim()))); }
          else if (e.type === "tool_start") { open = false; push((x) => [...x, { k: "tool", id: e.id, name: e.name, args: e.args }]); }
          else if (e.type === "status") push((x) => { const i = x.map((it) => it.k).lastIndexOf("tool"); if (i < 0 || (x[i] as { ok?: boolean }).ok !== undefined) return [...x, { k: "info", text: e.text }]; const t = x[i] as Extract<Item, { k: "tool" }>; return [...x.slice(0, i), { ...t, status: [...(t.status || []), e.text].slice(-6) }, ...x.slice(i + 1)]; });
          else if (e.type === "tool_args") push((x) => x.map((it) => it.k === "tool" && it.id === e.id ? { ...it, args: e.args } : it));
          else if (e.type === "plan") push((x) => [...x, { k: "info", text: `Plan: ${e.steps.map((t: string) => LABEL[t] || t).join(" → ")}` }]);
          else if (e.type === "tool_end") push((x) => x.map((it) => it.k === "tool" && it.id === e.id ? { ...it, ok: e.ok, summary: e.summary } : it));
          else if (e.type === "session") onSession?.(e.id);
          else if (e.type === "project") push((x) => [...x, { k: "info", text: `Created project “${e.title}” — /studio/${e.id}` }]);
          else if (e.type === "error") push((x) => [...x, { k: "info", text: "⚠ " + e.error }]);
          else if (e.type === "done" && e.projectId && !interrupting) router.refresh();
        }
      }
    } catch (err) { setItems((x) => [...x, { k: "info", text: "⚠ " + (err as Error).message }]); }
    finally { if (!interrupting) { setBusy(false); setThinking(false); } }
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {!items.length && <div className="space-y-3 p-2 text-ink-400"><p className="flex items-center gap-2 text-white"><Sparkles className="h-4 w-4 text-brand-400" />Hi — I’m Opie. Tell me what you want to make or find out.</p><p className="text-xs">I can create projects, brainstorm, write scripts, build assets and storyboards, fix continuity, voice and render — or browse YouTube on the virtual desktop. Interrupt me any time.</p>
          <div className="flex flex-wrap gap-1.5">{(starters || ["Make a 60s TikTok product ad for my akara brand", "What’s trending in Nollywood family drama on YouTube?", "Watch https://www.youtube.com/watch?v=jNQXAC9IVRw and tell me the hook"]).map((s) => <button key={s} className="chip max-w-full whitespace-normal text-left" onClick={() => send(s)}>{s}</button>)}</div></div>}
        {items.map((it, i) => it.k === "user" ? <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-brand-500/20 px-3 py-2 text-white">{it.text}</div>
          : it.k === "ai" ? <div key={i} className="mr-4 space-y-1 text-ink-200"><Text t={it.text} />{it.live && <span className="inline-block h-3 w-1.5 animate-pulse bg-brand-400" />}{it.provider && <p className="text-[10px] text-ink-500">answered by {it.provider}</p>}</div>
          : it.k === "tool" ? <div key={i} className="rounded-xl border border-white/[0.08] bg-ink-900/80 p-2.5 text-xs">
              <div className="flex items-center gap-2 font-medium text-white">{it.ok === undefined ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" /> : it.ok ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <X className="h-3.5 w-3.5 text-red-400" />}<Wrench className="h-3 w-3 text-ink-500" />{LABEL[it.name] || it.name}<span className="truncate font-normal text-ink-500">{Object.values(it.args || {}).filter((v) => typeof v === "string").join(" · ").slice(0, 60)}</span></div>
              {it.status && it.ok === undefined && <ul className="mt-1.5 space-y-0.5 text-ink-400">{it.status.map((s, j) => <li key={j} className="truncate">{s}</li>)}</ul>}
              {it.summary && <details className="mt-1.5 text-ink-400"><summary className="cursor-pointer select-none">result</summary><p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{it.summary}</p></details>}
            </div>
          : <p key={i} className="text-center text-[11px] text-ink-500">{it.text.includes("/studio/") ? <a className="underline" href={it.text.split("— ")[1]}>{it.text.split(" — ")[0]} → open</a> : it.text}</p>)}
        {thinking && <p className="flex items-center gap-2 text-xs text-ink-500"><Loader2 className="h-3 w-3 animate-spin" />thinking…</p>}
        <div ref={end} />
      </div>
      <div className="border-t border-white/[0.06] p-2">
        <div className="flex items-end gap-2 rounded-xl bg-ink-900 p-1.5">
          <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={busy ? "Interrupt or redirect… (say “stop” to halt)" : "Ask Opie to make or find anything…"} className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink-500" />
          {busy && !input && <button title="Stop" className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/20 text-red-300" onClick={() => send("stop")}><Square className="h-4 w-4" /></button>}
          <button title="Send" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-white disabled:opacity-40" disabled={!input.trim()} onClick={() => send()}><Send className="h-4 w-4" /></button>
        </div>
        {items.length > 0 && !busy && <button className="mt-1 text-[10px] text-ink-500 hover:text-ink-300" onClick={() => { setItems([]); conv.current = undefined; sessionStorage.removeItem("opie-conv"); sessionStorage.removeItem("opie-chat"); }}>New conversation</button>}
      </div>
    </div>
  );
}

/** App-wide floating assistant (hidden on the Virtual Desktop page, which embeds the chat). */
export function FloatingAgent() {
  const path = usePathname() || "";
  const [open, setOpen] = useState(false);
  if (path.startsWith("/research") || path.startsWith("/admin")) return null;
  const projectId = path.match(/^\/studio\/([^/]+)/)?.[1];
  return (
    <>
      {open && <div className="fixed inset-x-2 bottom-20 top-16 z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950/95 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[620px] sm:max-h-[80dvh] sm:w-[420px]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5"><Bot className="h-4 w-4 text-brand-400" /><span className="text-sm font-semibold">Opie assistant</span><span className="text-[10px] text-ink-500">{projectId ? "this project" : "all of Opie"}</span><button className="ml-auto text-ink-400" onClick={() => setOpen(false)}><ChevronDown className="h-4 w-4" /></button></div>
        <AgentChat projectId={projectId} className="flex-1" />
      </div>}
      <button aria-label="Open Opie assistant" onClick={() => setOpen(!open)} className="fixed bottom-20 right-4 z-50 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-white shadow-lg sm:bottom-5">{open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</button>
    </>
  );
}
