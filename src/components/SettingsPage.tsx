"use client";
import { useEffect, useState } from "react";
import { Brain, Check, LogOut, Pencil, Trash2, X } from "lucide-react";
import { Spinner } from "./ui";

type Note = { id: string; text: string; category: string; at: string; hits?: number; source?: string };
type Mem = { enabled: boolean; notes: Note[]; max: number; categories: string[] };
const CAT_LABEL: Record<string, string> = { genre: "Genre", pacing: "Pacing", tone: "Tone", visual: "Visual look", characters: "Characters", wardrobe: "Wardrobe", voice: "Voices", rejects: "Things you reject", other: "Other" };

export function SettingsPage() {
  const [me, setMe] = useState<{ email: string; name?: string; role: string } | null>(null);
  const [m, setM] = useState<Mem | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try { const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (r.ok) setM((x) => ({ ...(x || { max: 40, categories: [] }), ...j })); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setMe(j.user));
    fetch("/api/me/memory").then((r) => r.json()).then(setM);
    const t = setInterval(() => { if (document.visibilityState === "visible") fetch("/api/me/memory").then((r) => r.json()).then((j) => setM((x) => (edit ? x : j))); }, 15000);
    return () => clearInterval(t);
  }, [edit]);
  const groups = m ? m.categories.map((c) => [c, m.notes.filter((n) => n.category === c)] as const).filter(([, l]) => l.length) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <section className="panel mt-6 flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1"><div className="text-sm text-ink-400">Signed in as</div><div className="truncate font-medium">{me ? `${me.name ? me.name + " · " : ""}${me.email}` : "…"}</div></div>
        <button className="btn-outline h-10" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}><LogOut className="h-4 w-4" />Sign out</button>
      </section>

      <section className="panel mt-6 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15"><Brain className="h-5 w-5 text-brand-400" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">What Reel has learned</h2>
            <p className="mt-1 text-sm text-ink-400">As you work, Reel keeps short notes about your taste — genre, pacing, tone, look, casting and wardrobe habits, voices and what you reject — and uses them in new projects. Only these notes are kept (never your scripts or media), and they stay when you delete a project. This is separate from Contributor mode.</p>
          </div>
        </div>
        {!m ? <div className="mt-4"><Spinner /></div> : <>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-4 py-3">
            <span className="text-sm"><b>Learn from my work</b><span className="block text-xs text-ink-400">{m.enabled ? "On — notes are added and used in prompts." : "Off — nothing new is learned and notes aren’t used."}</span></span>
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand-500,#f59e0b)]" checked={m.enabled} disabled={busy} onChange={(e) => call("/api/me/memory", "PATCH", { enabled: e.target.checked })} aria-label="Learn from my work" />
          </label>
          <div className="mt-4 flex items-center justify-between text-xs text-ink-400"><span>{m.notes.length} / {m.max} notes</span>
            {m.notes.length > 0 && (confirmClear
              ? <span className="flex items-center gap-2">Clear all notes? <button className="btn-ghost h-8 text-red-300" onClick={() => { setConfirmClear(false); call("/api/me/memory", "DELETE"); }}>Yes, clear</button><button className="btn-ghost h-8" onClick={() => setConfirmClear(false)}>Cancel</button></span>
              : <button className="btn-ghost h-8 text-red-300" onClick={() => setConfirmClear(true)}><Trash2 className="h-3.5 w-3.5" />Clear all</button>)}
          </div>
          {!m.notes.length && <p className="mt-3 rounded-xl bg-white/[0.03] px-4 py-6 text-center text-sm text-ink-400">Nothing yet. Reel learns as you approve or reject references, edit scripts, fix continuity, pick voices and give video feedback.</p>}
          <div className="mt-3 space-y-5">
            {groups.map(([c, list]) => (
              <div key={c}><div className="label">{CAT_LABEL[c] || c}</div>
                <ul className="space-y-2">{list.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm">
                    {edit?.id === n.id
                      ? <><textarea className="input min-h-16 flex-1" value={edit.text} maxLength={160} onChange={(e) => setEdit({ id: n.id, text: e.target.value })} autoFocus />
                        <button className="btn-ghost h-9 w-9 px-0" aria-label="Save" onClick={() => { const t = edit.text.trim(); setEdit(null); if (t) call(`/api/me/memory/${n.id}`, "PATCH", { text: t }); }}><Check className="h-4 w-4" /></button>
                        <button className="btn-ghost h-9 w-9 px-0" aria-label="Cancel" onClick={() => setEdit(null)}><X className="h-4 w-4" /></button></>
                      : <><span className="min-w-0 flex-1">{n.text}{(n.hits || 1) > 1 && <span className="ml-2 text-xs text-ink-500">×{n.hits}</span>}</span>
                        <button className="btn-ghost h-8 w-8 shrink-0 px-0" aria-label="Edit note" onClick={() => setEdit({ id: n.id, text: n.text })}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="btn-ghost h-8 w-8 shrink-0 px-0 text-red-300" aria-label="Delete note" onClick={() => call(`/api/me/memory/${n.id}`, "DELETE")}><Trash2 className="h-3.5 w-3.5" /></button></>}
                  </li>))}</ul>
              </div>
            ))}
          </div>
        </>}
      </section>
    </div>
  );
}
