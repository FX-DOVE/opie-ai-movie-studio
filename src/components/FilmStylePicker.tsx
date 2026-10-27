"use client";
import { FILM_STYLES } from "@/lib/genres/options";

/** Film style (genre skill) picker — a compact two-column list; the selected style drives script, shots, look, motion and review. */
export function FilmStylePicker({ value, onChange, auto }: { value?: string; onChange: (v: string) => void; auto?: boolean }) {
  const v = value || "blockbuster";
  return (
    <div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Film style">
        {FILM_STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={v === s.id} onClick={() => onChange(s.id)}
            className={`rounded-xl border px-3 py-2 text-left transition ${v === s.id ? "border-white/60 bg-white/[0.08]" : "border-white/10 hover:border-white/25"}`}>
            <div className="text-[13px] font-medium leading-tight">{s.label}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-ink-400">{s.short}</div>
          </button>
        ))}
      </div>
      {auto && <p className="mt-1.5 text-[11px] text-ink-400">Not picked yet — Reel chooses one from your idea. Tap a style to lock it.</p>}
    </div>
  );
}
