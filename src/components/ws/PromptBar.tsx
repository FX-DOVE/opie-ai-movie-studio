"use client";
import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Spinner } from "../ui";

export function PromptBar({ placeholder, onSubmit, busy, left, hint }: { placeholder: string; onSubmit: (v: string) => Promise<unknown> | void; busy?: boolean; left?: React.ReactNode; hint?: React.ReactNode }) {
  const [v, setV] = useState("");
  const go = async () => { if (!v.trim() || busy) return; const t = v; setV(""); await onSubmit(t); };
  return (
    <div className="sticky bottom-0 pb-safe z-20 mt-auto border-t border-white/[0.06] bg-ink-950/85 backdrop-blur px-3 py-3 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-2xl shadow-black/40 focus-within:border-brand-400/50">
          {left}
          <Sparkles className="mb-2.5 ml-1.5 h-4 w-4 shrink-0 text-brand-400" />
          <textarea rows={1} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }} placeholder={placeholder}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-white placeholder:text-ink-400 outline-none" />
          <button onClick={go} disabled={busy || !v.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-ink-950 transition disabled:opacity-30" aria-label="Send">{busy ? <Spinner /> : <ArrowUp className="h-4 w-4" />}</button>
        </div>
        {hint && <div className="mt-1.5 px-1 text-[11px] text-ink-400">{hint}</div>}
      </div>
    </div>
  );
}
