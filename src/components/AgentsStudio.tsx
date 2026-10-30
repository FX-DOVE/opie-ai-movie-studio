"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Loader2, Menu, Pencil, Plus, Square, Trash2, Wrench, X } from "lucide-react";
import { friendly, ndjson, resumeStream } from "@/lib/net";

type Agent = { id: string; name: string; color: string; brief: string; filmStyle?: string; projectId?: string; approval: "auto" | "key"; notes: string[] };
type Card = { id: string; name: string; ok?: boolean; summary?: string };
type Msg = { id: string; role: "user" | "agent" | "info"; agentId?: string; text: string; at: string; cards?: Card[]; projectId?: string };
type ChatLite = { id: string; title: string; color?: string; topic?: string; filmStyle?: string; approval?: "auto" | "key"; notes?: string[]; projectIds?: string[]; agentIds: string[]; last: string; busy?: boolean; updatedAt?: string };
type Chat = ChatLite & { msgs: Msg[] };

const STYLES: [string, string][] = [["", "Auto"], ["blockbuster", "Blockbuster"], ["martial_comedy", "Martial-arts comedy"], ["commando", "Commando"], ["war_epic", "War epic"], ["kdrama_romcom", "K-drama rom-com"], ["epic_fantasy", "Epic fantasy"], ["prison_break", "Prison break"], ["nollywood", "Nollywood"]];
const COLORS = ["#0071e3", "#af52de", "#ff9500", "#34c759", "#ff2d55", "#5ac8fa", "#5856d6", "#a2845e"];
const LABEL = (n: string) => n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const j = (u: string, m = "GET", b?: unknown) => fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

function Avatar({ a, size = 28 }: { a?: Agent; size?: number }) {
  return <span className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-[#fff] shadow-sm" style={{ width: size, height: size, background: a?.color || "#8e8e93", fontSize: size * 0.42 }}>{(a?.name || "?").slice(0, 1).toUpperCase()}</span>;
}

function AgentForm({ init, onSave, onClose }: { init: Chat; onSave: (a: Partial<Chat>) => void; onClose: () => void }) {
  const [f, setF] = useState<Partial<Chat>>({ title: init.title, color: init.color || COLORS[0], topic: init.topic || "", filmStyle: init.filmStyle || "", approval: init.approval || "auto" });
  const set = (k: keyof Chat, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-[#000]/30 p-4" onClick={onClose}>
      <motion.form initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (f.title?.trim()) onSave(f); }}
        className="w-full max-w-md space-y-3 rounded-3xl bg-[#fff] p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Agent settings</h2><button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        <label className="block text-sm">Name<input data-t="agent-name" autoFocus value={f.title || ""} onChange={(e) => set("title", e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 px-3 py-2" placeholder="e.g. AI video agent" /></label>
        <div className="text-sm">Colour<div className="mt-1 flex gap-2">{COLORS.map((c) => <button type="button" key={c} onClick={() => set("color", c)} aria-label={c} className={`h-7 w-7 rounded-full ring-offset-2 ${f.color === c ? "ring-2 ring-[#1d1d1f]" : ""}`} style={{ background: c }} />)}</div></div>
        <label className="block text-sm">Topic (optional)<textarea data-t="agent-brief" value={f.topic || ""} onChange={(e) => set("topic", e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/15 px-3 py-2" placeholder="What this agent makes, e.g. wildlife documentaries" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Film style<select value={f.filmStyle || ""} onChange={(e) => set("filmStyle", e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 px-2 py-2">{STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="block text-sm">Approvals<select data-t="agent-approval" value={f.approval} onChange={(e) => set("approval", e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 px-2 py-2"><option value="auto">Fully automatic</option><option value="key">Ask at key steps</option></select></label>
        </div>
        {init.notes?.length ? <div className="text-xs text-white/60"><div className="mb-1 font-medium text-white/80">Memory</div>{init.notes.slice(-6).map((n, i) => <div key={i}>• {n}</div>)}</div> : null}
        {init.projectIds?.length ? <div className="text-xs"><div className="mb-1 font-medium text-white/80">Projects</div><div className="flex flex-wrap gap-1.5">{init.projectIds.map((id) => <Link key={id} href={`/studio/${id}`} className="rounded-full border border-white/15 px-2 py-0.5 text-brand-400">{id}</Link>)}</div></div> : null}
        <button className="btn-brand w-full rounded-full py-2.5" data-t="agent-save">Save</button>
      </motion.form>
    </motion.div>
  );
}

export function AgentsStudio() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [list, setList] = useState<ChatLite[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [form, setForm] = useState<Chat | null>(null);
  const [sheet, setSheet] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const byId = (id?: string): Agent | undefined => { const c = id === chat?.id ? chat : list.find((x) => x.id === id); return agents.find((a) => a.id === id) || (c ? { id: c.id, name: c.title, color: c.color || COLORS[0], brief: c.topic || "", approval: "auto", notes: [] } : undefined); };

  const refresh = useCallback(async () => { const c = await j("/api/chats"); setAgents([]); setList(c.chats || []); return c.chats as ChatLite[]; }, []);
  const open = useCallback(async (id: string) => { const r = await j(`/api/chats/${id}`); if (r.chat) { setChat(r.chat); localStorage.setItem("rf-chat", id); setSheet(false); } }, []);
  useEffect(() => { refresh().then((c) => { const last = localStorage.getItem("rf-chat"); const id = c?.find((x) => x.id === last)?.id || c?.[0]?.id; if (id) open(id); }); }, [refresh, open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat?.msgs.length, chat?.msgs[chat.msgs.length - 1]?.text.length]);

  // live events → patch the open chat's messages (the server persists the same thing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEvent = (e: any) => setChat((c) => {
    if (!c) return c; const msgs = [...c.msgs]; const i = msgs.findIndex((m) => m.id === e.msgId);
    if (e.type === "speaker" && i < 0) msgs.push({ id: e.msgId, role: "agent", agentId: e.agentId, text: "", at: new Date().toISOString(), cards: [] });
    else if (i >= 0) {
      const m = { ...msgs[i], cards: [...(msgs[i].cards || [])] };
      if (e.type === "delta") m.text += e.text || "";
      else if (e.type === "turn_end" && m.text && !m.text.endsWith("\n\n")) m.text += "\n\n";
      else if (e.type === "tool_start") m.cards.push({ id: e.id, name: e.name });
      else if (e.type === "tool_end") m.cards = m.cards.map((k) => k.id === e.id ? { ...k, ok: e.ok, summary: e.summary } : k);
      else if (e.type === "project") m.projectId = e.id;
      msgs[i] = m;
    } else if (e.type === "info") msgs.push({ id: String(Math.random()), role: "info", text: e.text, at: "" });
    return { ...c, msgs };
  });

  // reattach to a background reply after a refresh
  useEffect(() => { if (!chat) return; const job = localStorage.getItem("rf-chat-job:" + chat.id); if (!job || busy) return; setBusy(true);
    open(chat.id).then(() => resumeStream(job, () => {})).catch(() => {}).finally(() => { localStorage.removeItem("rf-chat-job:" + chat.id); setBusy(false); open(chat.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  const send = async () => {
    const t = input.trim(); if (!t || !chat || busy) return; setInput(""); setErr(""); setBusy(true);
    setChat((c) => c && { ...c, msgs: [...c.msgs, { id: "u" + Date.now(), role: "user", text: t, at: new Date().toISOString() }] });
    try { await ndjson(`/api/chats/${chat.id}/message`, { message: t }, onEvent, undefined, (job) => localStorage.setItem("rf-chat-job:" + chat.id, job)); }
    catch (x) { setErr(friendly(x)); }
    finally { localStorage.removeItem("rf-chat-job:" + chat.id); setBusy(false); open(chat.id); refresh(); }
  };
  const stop = () => chat && j(`/api/chats/${chat.id}/stop`, "POST");
  const newChat = async () => { const r = await j("/api/chats", "POST", { title: "New agent" }); await refresh(); if (r.chat) open(r.chat.id); };
  const rename = async (c: ChatLite) => { const r = await j(`/api/chats/${c.id}`); if (r.chat) setForm(r.chat); };
  const del = async (c: ChatLite) => { if (!confirm(`Delete agent “${c.title}” and its chat history? Its projects stay.`)) return; await j(`/api/chats/${c.id}`, "DELETE"); if (chat?.id === c.id) setChat(null); refresh(); };
  const saveAgent = async (f: Partial<Chat>) => { if (!form) return; const r = await j(`/api/chats/${form.id}`, "PATCH", f); setForm(null); if (r.chat && chat?.id === r.chat.id) setChat(r.chat); refresh(); };

  const side = (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">Agents</h2>
          <button data-t="new-agent" onClick={newChat} className="flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1 text-xs font-medium text-[#fff]"><Plus className="h-3.5 w-3.5" />New</button></div>
        <ul className="space-y-1">{!list.length && <p className="text-sm text-white/55">Each agent is its own conversation with its own memory and projects.</p>}{list.map((c) => (
          <motion.li layout key={c.id} className={`group flex items-center gap-2 rounded-xl px-2 py-2 ${chat?.id === c.id ? "bg-brand-500/10" : "hover:bg-white/5"}`}>
            <button onClick={() => open(c.id)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-1.5 text-sm font-medium"><Avatar a={byId(c.id)} size={22} /><span className="truncate">{c.title}</span>{c.busy && <Loader2 className="h-3 w-3 animate-spin text-brand-500" />}</span><span className="block truncate text-xs text-white/55">{c.last || "No messages yet"}</span></button>
            <button onClick={() => rename(c)} aria-label="Rename or edit agent" className="opacity-60 hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => del(c)} aria-label="Delete agent" className="opacity-60 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </motion.li>))}</ul>
      </section>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-[#fff] shadow-sm md:h-[calc(100dvh-6rem)]">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#f5f5f7] md:block">{side}</aside>
      <AnimatePresence>{sheet && <>
        <motion.div className="fixed inset-0 z-40 bg-[#000]/30 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
        <motion.aside className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] rounded-t-3xl bg-[#fff] shadow-2xl md:hidden" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>{side}</motion.aside></>}</AnimatePresence>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <button className="md:hidden" onClick={() => setSheet(true)} aria-label="Chats and agents"><Menu className="h-5 w-5" /></button>
          {chat && <Avatar a={byId(chat.id)} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 truncate font-semibold">{chat?.title || "Agents"}{chat && <button onClick={() => setForm(chat)} aria-label="Agent settings" className="opacity-50 hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>}</div>
            {chat?.topic && <div className="truncate text-xs text-white/55">{chat.topic}</div>}</div>
          {busy && <button data-t="stop" onClick={stop} className="flex items-center gap-1 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-xs font-medium text-[#fff]"><Square className="h-3 w-3" />Stop</button>}
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {!chat && <div className="mx-auto mt-16 max-w-sm text-center text-white/60"><p className="text-lg font-semibold text-white">Your film agents</p><p className="mt-2 text-sm">Each agent makes films end to end on its own — script, references, storyboard, Meta MMS voice, motion and render — or just one step when you ask.</p><button onClick={newChat} className="btn-brand mt-5 rounded-full px-5 py-2">New agent</button></div>}
          <AnimatePresence initial={false}>{chat?.msgs.map((m) => {
            const a = byId(m.agentId);
            if (m.role === "info") return <motion.p key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-white/55">{m.text}</motion.p>;
            if (m.role === "user") return <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-brand-500 px-4 py-2.5 text-sm text-[#fff]">{m.text}</motion.div>;
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[92%] gap-2.5">
                <Avatar a={a} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-xs font-semibold" style={{ color: a?.color }}>{a?.name || "Agent"}</div>
                  {m.cards?.length ? <div className="grid gap-1.5 sm:grid-cols-2">{m.cards.map((k) => (
                    <motion.div layout key={k.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-white/10 bg-[#f5f5f7] px-3 py-2 text-xs">
                      <div className="flex items-center gap-1.5 font-medium">{k.ok === undefined ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" /> : k.ok ? <Check className="h-3.5 w-3.5 text-[#248a3d]" /> : <X className="h-3.5 w-3.5 text-[#d70015]" />}<Wrench className="h-3 w-3 opacity-50" />{LABEL(k.name)}</div>
                      {k.summary && <div className="mt-1 line-clamp-3 text-white/65">{k.summary}</div>}
                    </motion.div>))}</div> : null}
                  {m.text && <div className="whitespace-pre-wrap rounded-3xl rounded-tl-md bg-[#f5f5f7] px-4 py-2.5 text-sm leading-relaxed">{m.text.trim()}</div>}
                  {!m.text && !m.cards?.length && <Loader2 className="h-4 w-4 animate-spin text-white/50" />}
                  {m.projectId && <Link href={`/studio/${m.projectId}`} className="inline-block text-xs font-medium text-brand-400 underline">Open project →</Link>}
                </div>
              </motion.div>);
          })}</AnimatePresence>
          {err && <p className="text-center text-xs text-[#d70015]">⚠ {err}</p>}
          <div ref={end} />
        </div>
        {chat && <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-white/10 p-3">
          <textarea data-t="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1}
            placeholder={`Ask ${chat.title} to make a film, or one step…`} className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-white/15 bg-[#fff] px-4 py-2.5 text-sm" />
          <button disabled={busy || !input.trim()} aria-label="Send" className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-[#fff] disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}</button>
        </form>}
      </main>
      <AnimatePresence>{form && <AgentForm init={form} onSave={saveAgent} onClose={() => setForm(null)} />}</AnimatePresence>
    </div>
  );
}
