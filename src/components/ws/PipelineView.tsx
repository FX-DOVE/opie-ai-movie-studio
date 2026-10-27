"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { Spinner } from "../ui";

type Used = { provider: string; model: string; meta: boolean; calls: number; tokens: number; images: number; usd: number; last: string };
type Planned = { provider: string; model: string; meta: boolean };
type Stage = { id: string; title: string; done: boolean; detail: string; used: Used[]; planned: Planned[] };
export type PipelineData = { stages: Stage[]; contributor: boolean; totals: { calls: number; metaCalls: number; usd: number } };

const TAB: Record<string, string> = { idea: "script", screenplay: "script", references: "assets", shots: "storyboard", continuity: "storyboard", fix: "storyboard", export: "edit" };

/** "muse-spark-1.3" → "Muse Spark 1.3", "meta-models/muse-spark-open-1026" → "Muse Spark Open". */
export function prettyModel(m: string) {
  const x = m.replace(/^meta-models\//, "").replace(/-\d{4}$/, "");
  if (/^sam-/i.test(x)) return x.replace(/^sam-/i, "SAM ").replace(/\s*\(.*/, "");
  if (/^muse-/i.test(x)) return x.split("-").map((w) => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return m;
}
function MetaMark() {
  return <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3 shrink-0 text-sky-300"><path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M3 15c0-4 2-8 4.5-8S12 12 12 12s2-5 4.5-5S21 11 21 15c0 2-1 3-2.5 3S15 15 12 12c-3 3-4 6-6.5 6S3 17 3 15z" /></svg>;
}
function Chip({ m, n, dim }: { m: Planned; n?: number; dim?: boolean }) {
  const name = prettyModel(m.model); const via = m.meta ? (m.provider === "Meta Muse" ? "" : m.provider) : m.provider;
  return <span title={`${m.provider} · ${m.model}`} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-5 ${m.meta ? "border-sky-400/30 bg-sky-500/10 text-sky-100" : "border-white/10 bg-white/[0.04] text-ink-300"} ${dim ? "opacity-75" : ""}`}>
    {m.meta ? <MetaMark /> : null}
    <span className="truncate">{name}</span>
    {via ? <span className="text-ink-400">{" "}· {via}</span> : null}
    {n ? <span className="text-ink-400">{" "}× {n}</span> : null}
  </span>;
}

/** Process view: every pipeline step with the model that actually ran it (from this project's run log). */
export function PipelineView({ id, go }: { id: string; go: (tab: string) => void }) {
  const [d, setD] = useState<PipelineData | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`/api/projects/${id}/pipeline`, { cache: "no-store" }).then((r) => r.json()).then((j) => on && setD(j)).catch(() => {});
    load(); const t = setInterval(load, 4000); return () => { on = false; clearInterval(t); };
  }, [id]);
  if (!d) return <div className="grid place-items-center py-10"><Spinner /></div>;
  const next = d.stages.find((s) => !s.done);
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-400">Built with Meta: each step lists the model that actually ran it in this project (from the run log), or the model that will run it next under your current Admin routing. Meta models carry the <span className="inline-flex translate-y-0.5"><MetaMark /></span> mark; anything else is a fallback.</p>
      {d.contributor && <p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Contributor mode is ON: text inputs in this project go to muse-spark-1.3-contributor and may be used by Meta for training.</p>}
      <ol className="relative space-y-3">
        {d.stages.map((s, i) => (
          <li key={s.id} className={`rounded-xl border p-3 ${s === next ? "border-brand-500/40 bg-brand-500/[0.05]" : "border-white/[0.06] bg-white/[0.02]"}`}>
            <div className="flex items-start gap-2.5">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : s === next ? <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-x-2"><span className="min-w-0 flex-1 text-sm font-medium">{i + 1}. {s.title}</span>
                  <button className="ml-auto mt-0.5 shrink-0 whitespace-nowrap text-[11px] text-ink-400 hover:text-white" onClick={() => go(TAB[s.id])}>{s === next ? "Do this next →" : "Open"}</button></div>
                <p className="text-xs text-ink-400">{s.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  {s.used.length ? s.used.map((u) => <Chip key={u.provider + u.model} m={u} n={u.calls} />)
                    : <><span className="self-center text-[10px] uppercase tracking-wide text-ink-500">Next </span>{s.planned.map((m) => <Chip key={m.provider + m.model} m={m} dim />)}</>}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-ink-500">{d.totals.metaCalls}/{d.totals.calls} logged model calls in this project ran on Meta models{d.totals.usd ? ` · est. $${d.totals.usd.toFixed(4)} (Admin prices)` : ""}.</p>
    </div>
  );
}
