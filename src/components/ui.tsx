"use client";
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className={`grid place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-sky-glow ${small ? "h-7 w-7" : "h-8 w-8"}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white"><path d="M8 5.5v13l10-6.5z" /></svg>
      </span>
      {!small && <span className="text-[15px]">Opie <span className="text-ink-400 font-normal">Studio</span></span>}
    </span>
  );
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className={`relative flex h-full w-full ${wide ? "sm:max-w-[560px]" : "sm:max-w-[440px]"} flex-col border-l border-white/10 bg-ink-900 shadow-2xl`}>
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 h-14 shrink-0">
          <div className="min-w-0 truncate font-semibold">{title}</div>
          <button className="btn-ghost h-8 w-8 px-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-ink-900 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-ink-900/95 backdrop-blur px-6 h-14">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost h-8 w-8 px-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4200); return () => clearTimeout(t); }, [msg]);
  const node = msg ? (
    <div className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-xl max-w-[92vw] ${msg.err ? "border-red-500/30 bg-red-950/90 text-red-100" : "border-white/10 bg-ink-800/95 text-white"}`}>{msg.text}</div>
  ) : null;
  return { toast: (text: string, err = false) => setMsg({ text, err }), node };
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`chip ${value === o.value ? "chip-on" : ""}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const map: Record<string, string> = { meta: "bg-sky-500/15 text-sky-300", mock: "bg-amber-500/15 text-amber-300", upload: "bg-emerald-500/15 text-emerald-300" };
  const label: Record<string, string> = { meta: "Muse", mock: "Demo", upload: "Upload" };
  return <span className={`badge ${map[source] || "bg-sky-500/15 text-sky-300"}`}>{label[source] || source}</span>;
}
