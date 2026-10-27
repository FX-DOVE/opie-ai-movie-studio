"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Film, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { Spinner } from "./ui";

type VType = "openai" | "ltx" | "ltx-comfy" | "minimax" | "veo" | "fal" | "replicate" | "mock";
type Prov = { id: string; name: string; type: VType; enabled: boolean; baseUrl: string; model: string; maxDuration: number; aspects: string[]; firstLast: boolean; i2v: boolean; costPerSec?: number; mapping?: string; workflow?: string; resolution?: string; key?: string };
const TYPE_LABEL: Record<VType, string> = { openai: "Generic OpenAI-compatible", ltx: "LTX-Video 2.x API server", "ltx-comfy": "LTX-Video via ComfyUI", minimax: "MiniMax Hailuo", veo: "Google Veo", fal: "fal.ai", replicate: "Replicate", mock: "Demo motion (local)" };
const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

/** Admin → Video providers: add/edit/reorder (fallback order), encrypted keys, 2-second test clip per provider. */
export function VideoProvidersAdmin({ toast }: { toast: (m: string, err?: boolean) => void }) {
  const [list, setList] = useState<Prov[] | null>(null);
  const [presets, setPresets] = useState<Record<string, Partial<Prov>>>({});
  const [keys, setKeys] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<string, { busy?: boolean; ok?: boolean; message?: string; url?: string }>>({});
  const apply = (j: { providers: Prov[]; presets: Record<string, Partial<Prov>> }) => { setList(j.providers); setPresets(j.presets); setKeys({}); setDirty(false); };
  useEffect(() => { fetch("/api/admin/video-providers").then((r) => r.json()).then(apply); }, []);
  if (!list) return null;
  const upd = (i: number, patch: Partial<Prov>) => { setList(list.map((p, k) => (k === i ? { ...p, ...patch } : p))); setDirty(true); };
  const move = (i: number, d: number) => { const l = [...list]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setList(l); setDirty(true); };
  const add = (t: VType) => { const pr = presets[t] || {}; let id = t; let n = 2; while (list.some((p) => p.id === id)) id = `${t}-${n++}` as VType; setList([...list.filter((p) => p.type !== "mock"), { id, type: t, enabled: true, name: pr.name || t, baseUrl: pr.baseUrl || "", model: pr.model || "", maxDuration: pr.maxDuration || 5, aspects: pr.aspects || ["16:9"], firstLast: !!pr.firstLast, i2v: pr.i2v ?? true, costPerSec: pr.costPerSec, mapping: pr.mapping, resolution: pr.resolution } as Prov, ...list.filter((p) => p.type === "mock")]); setDirty(true); };
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/video-providers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providers: list.map(({ key: _k, ...p }) => p), keys }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return toast(j.error || "Save failed", true);
    apply(j); toast("Video providers saved (keys encrypted)");
  };
  const test = async (id: string) => {
    setTests({ ...tests, [id]: { busy: true } });
    const j = await (await fetch("/api/admin/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video", id }) })).json().catch((e) => ({ ok: false, message: String(e) }));
    setTests((t) => ({ ...t, [id]: j }));
  };
  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2"><Film className="h-4 w-4 text-brand-400" /><h2 className="font-semibold">Video providers</h2>
        <a href="/docs/ltx" target="_blank" className="btn-ghost h-8 text-xs"><BookOpen className="h-3.5 w-3.5" />Host LTX on a GPU</a>
        <button className="btn-primary ml-auto" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Save</button></div>
      <p className="mb-4 text-xs text-ink-400">Order = fallback order. Each project in Video mode picks one (or “Auto”); if it fails after the retries, the next enabled provider runs, and Demo motion is the last resort. Image mode never calls a video API. Save before testing.</p>
      <div className="space-y-3">
        {list.map((p, i) => (
          <div key={p.id + i} className={`rounded-xl border p-3 sm:p-4 ${p.enabled ? "border-white/10" : "border-white/5 opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-white/10 text-ink-300">{i + 1}</span>
              <input className="input h-9 min-w-0 flex-1 sm:max-w-xs" value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
              <span className="text-xs text-ink-400">{TYPE_LABEL[p.type]}</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={p.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} />Enabled</label>
              <button className="btn-ghost h-8 px-2" disabled={i === 0} onClick={() => move(i, -1)} title="Earlier in fallback order"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button className="btn-ghost h-8 px-2" disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Later in fallback order"><ArrowDown className="h-3.5 w-3.5" /></button>
              {p.type !== "mock" && <button className="btn-ghost h-8 px-2 text-red-300" onClick={() => { setList(list.filter((_, k) => k !== i)); setKeys({ ...keys, [p.id]: null }); setDirty(true); }}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {p.type !== "mock" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block sm:col-span-2 lg:col-span-1"><span className="label">Base URL</span><input className="input h-9" value={p.baseUrl} onChange={(e) => upd(i, { baseUrl: e.target.value })} /></label>
                <label className="block"><span className="label flex items-center gap-1"><KeyRound className="h-3 w-3" />API key {p.type === "ltx-comfy" && "(optional)"}</span><input className="input h-9" type="password" autoComplete="off" placeholder={p.key || "Not set"} value={keys[p.id] ?? ""} onChange={(e) => { setKeys({ ...keys, [p.id]: e.target.value }); setDirty(true); }} /></label>
                <label className="block"><span className="label">Model</span><input className="input h-9" value={p.model} onChange={(e) => upd(i, { model: e.target.value })} /></label>
                <label className="block"><span className="label">Max duration (s)</span><input className="input h-9" type="number" min={1} max={30} value={p.maxDuration} onChange={(e) => upd(i, { maxDuration: Number(e.target.value) })} /></label>
                <label className="block"><span className="label">Cost per second (USD, estimate)</span><input className="input h-9" type="number" step="0.001" placeholder="unknown" value={p.costPerSec ?? ""} onChange={(e) => upd(i, { costPerSec: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
                {(p.type === "ltx" || p.type === "minimax") && <label className="block"><span className="label">Resolution</span><input className="input h-9" value={p.resolution || ""} onChange={(e) => upd(i, { resolution: e.target.value })} /></label>}
                <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className="text-ink-400">Aspects</span>
                  {ASPECTS.map((a) => <label key={a} className="flex items-center gap-1"><input type="checkbox" checked={p.aspects.includes(a)} onChange={(e) => upd(i, { aspects: e.target.checked ? [...p.aspects, a] : p.aspects.filter((x) => x !== a) })} />{a}</label>)}
                  <label className="flex items-center gap-1"><input type="checkbox" checked={p.i2v} onChange={(e) => upd(i, { i2v: e.target.checked })} />Image → video</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={p.firstLast} onChange={(e) => upd(i, { firstLast: e.target.checked })} />First + last frame</label>
                </div>
                {p.type === "openai" && <label className="block sm:col-span-2 lg:col-span-3"><span className="label">Request mapping (JSON: paths, field names, encoding multipart | json-dataurl | json-base64, status/url paths)</span><textarea className="input min-h-40 font-mono text-[11px]" value={p.mapping || ""} onChange={(e) => upd(i, { mapping: e.target.value })} /></label>}
                {p.type === "ltx-comfy" && <label className="block sm:col-span-2 lg:col-span-3"><span className="label">ComfyUI workflow (API format) — blank = built-in LTX image→video graph. Placeholders: {"{{PROMPT}} {{IMAGE}} {{END_IMAGE}} {{WIDTH}} {{HEIGHT}} {{FRAMES}} {{FPS}} {{SEED}}"}</span><textarea className="input min-h-24 font-mono text-[11px]" value={p.workflow || ""} onChange={(e) => upd(i, { workflow: e.target.value })} /></label>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-outline h-8 text-xs" disabled={dirty || tests[p.id]?.busy} title={dirty ? "Save first" : ""} onClick={() => test(p.id)}>{tests[p.id]?.busy ? <Spinner /> : <Film className="h-3.5 w-3.5" />}Test (2 s clip)</button>
              {tests[p.id]?.message && <span className={`text-[11px] ${tests[p.id].ok ? "text-emerald-300" : "text-amber-300"}`}>{tests[p.id].ok ? "✓ " : "⚠ "}{tests[p.id].message}</span>}
              {tests[p.id]?.url && <video src={tests[p.id].url} className="h-20 rounded-md" controls muted autoPlay loop />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="text-ink-400"><Plus className="inline h-3.5 w-3.5" /> Add:</span>
        {(Object.keys(TYPE_LABEL) as VType[]).filter((t) => t !== "mock").map((t) => <button key={t} className="btn-outline h-8 text-xs" onClick={() => add(t)}>{TYPE_LABEL[t]}</button>)}</div>
    </section>
  );
}
