"use client";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ImagePlus, Lock, MapPin, Package, Plus, Sparkles, Trash2, Unlock, Upload, User, Wand2 } from "lucide-react";
import { isApproved, isDraft, type Asset } from "@/lib/types";
import { Drawer, SourceBadge, Spinner } from "../ui";
import { active, type TabProps } from "./common";

const KINDS = [
  { k: "character" as const, label: "Characters", icon: User, detail: "Clothing & accessories" },
  { k: "location" as const, label: "Locations", icon: MapPin, detail: "Time of day & lighting" },
  { k: "prop" as const, label: "Props", icon: Package, detail: "Material, colour, details" },
];

const REF: Record<string, { t: string; c: string }> = { checking: { t: "Checking", c: "bg-sky-500/90" }, fixing: { t: "Fixing", c: "bg-sky-500/90" }, passed: { t: "Approved", c: "bg-emerald-600/90" }, fixed: { t: "Fixed · approved", c: "bg-emerald-600/90" }, attention: { t: "Needs attention", c: "bg-amber-500/90" } };
function RefBadge({ a }: { a: Asset }) {
  const s = a.refState ? REF[a.refState] : a.activeImage ? (isApproved(a) ? { t: "Approved", c: "bg-emerald-600/90" } : { t: "Needs approval", c: "bg-amber-500/90" }) : null;
  if (!s) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${s.c}`}>{a.locked && <Lock className="h-2.5 w-2.5" />}{s.t}</span>;
}
/** Read-only view of the structured spec (props: scale, materials, hex colours, exact text…). */
function SpecView({ spec }: { spec: Record<string, unknown> }) {
  const fmt = (v: unknown): string => Array.isArray(v) ? v.map(fmt).filter(Boolean).join("; ") : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).map(fmt).filter(Boolean).join(" ") : String(v ?? "");
  const rows = Object.entries(spec).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").toLowerCase(), fmt(v)]).filter(([, v]) => v);
  const hexes = JSON.stringify(spec).match(/#[0-9a-fA-F]{6}/g) || [];
  return <div className="space-y-1 text-xs">
    {!!hexes.length && <div className="mb-2 flex flex-wrap gap-1">{[...new Set(hexes)].slice(0, 12).map((h) => <span key={h} className="inline-flex items-center gap-1 rounded bg-white/[0.05] px-1.5 py-0.5"><span className="h-3 w-3 rounded-sm border border-white/20" style={{ background: h }} />{h}</span>)}</div>}
    {rows.map(([k, v]) => <p key={k}><span className="text-ink-400">{k}: </span><span className="text-ink-200">{v}</span></p>)}
  </div>;
}

export function AssetsTab(props: TabProps & { next: () => void }) {
  const { p, act, busy, next } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = p.assets.find((a) => a.id === openId);
  const missing = p.assets.filter((a) => !a.activeImage && !isDraft(a)).length;
  const live = p.assets.filter((a) => !isDraft(a));
  const approved = live.filter(isApproved).length;
  const attention = live.filter((a) => a.refState === "attention" || (a.activeImage && !isApproved(a)));

  return (
    <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Cast & assets</h2>
            <p className="mt-0.5 text-sm text-ink-400">Lock every face, outfit, place and prop before the storyboard. AI reference sheets are reviewed against their spec and approved automatically; uploads and flagged sheets need your Approve.</p>
            {!!live.length && <p className="mt-1 text-xs text-ink-300">{approved}/{live.length} references approved{attention.length ? ` · needs you: ${attention.map((a) => a.name).join(", ")}` : ""}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" disabled={!p.script || busy.has("extractAssets")} onClick={() => act("extractAssets")}>{busy.has("extractAssets") ? <Spinner /> : <Wand2 className="h-4 w-4" />} Extract from script</button>
            <button className="btn-outline" disabled={(!missing && !live.some((a) => a.activeImage && a.approved === false && a.refState !== "attention")) || busy.has("autocreateAssets")} onClick={async () => { const r = await act("autocreateAssets"); const res = (r as { result?: { advanced?: boolean } } | null)?.result; if (res?.advanced) next(); }}>{busy.has("autocreateAssets") ? <Spinner /> : <Sparkles className="h-4 w-4" />} Autocreate {missing ? `(${missing})` : ""}</button>
            <button className="btn-brand" disabled={!p.assets.length || busy.has("buildStoryboard")} onClick={async () => { const r = await act("buildStoryboard"); if (r?.ok) next(); }}>{busy.has("buildStoryboard") ? <Spinner /> : null} Build storyboard <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>

        {!p.assets.length && (
          <div className="panel mt-8 grid place-items-center gap-3 p-10 text-center">
            <User className="h-8 w-8 text-ink-600" />
            <p className="max-w-md text-sm text-ink-400">No assets yet. Write a script first, then extract the cast, locations and props automatically — or add them by hand.</p>
          </div>
        )}

        {KINDS.map(({ k, label, icon: Icon, detail }) => {
          const list = p.assets.filter((a) => a.kind === k);
          return (
            <section key={k} className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand-400" /><h3 className="font-semibold">{label}</h3><span className="text-sm text-ink-400">{list.length}</span>
                <button className="btn-ghost ml-auto h-8" onClick={async () => { const r = await act("addAsset", { kind: k }, { busyKey: "add-" + k }); const pr = (r as { project?: { assets: Asset[] } })?.project; if (pr) setOpenId(pr.assets[pr.assets.length - 1].id); }}><Plus className="h-4 w-4" />Add</button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {list.map((a) => {
                  const img = active(a.images, a.activeImage);
                  const working = busy.has("img-" + a.id);
                  return (
                    <button key={a.id} onClick={() => setOpenId(a.id)} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850 text-left transition hover:border-white/20">
                      <div className={`relative ${k === "location" ? "aspect-video" : "aspect-square"} bg-ink-800`}>
                        {img ? <img src={img.url} alt={a.name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-ink-600">{working ? <Spinner className="h-6 w-6" /> : <ImagePlus className="h-7 w-7" />}</div>}
                        {working && img && <div className="absolute inset-0 grid place-items-center bg-black/50"><Spinner className="h-6 w-6" /></div>}
                        <span className="absolute left-2 top-2"><SourceBadge source={img?.source} /></span>
                        <span className="absolute bottom-2 left-2"><RefBadge a={a} /></span>
                      </div>
                      <div className="p-3">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="mt-0.5 line-clamp-2 text-xs text-ink-400">{a.details || detail}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? <span className="flex items-center gap-2"><span className="badge bg-white/10 text-ink-300">{open.kind}</span>{open.name}</span> : ""} wide>
        {open && <AssetEditor key={open.id} a={open} {...props} onDeleted={() => setOpenId(null)} />}
      </Drawer>
    </div>
  );
}

function AssetEditor({ a, p, act, busy, setP, toast, voices, onDeleted }: TabProps & { a: Asset; onDeleted: () => void }) {
  const [f, setF] = useState({ name: a.name, description: a.description, details: a.details, voice: a.voice || "" });
  const [change, setChange] = useState("");
  const img = active(a.images, a.activeImage);
  const key = "img-" + a.id;
  const save = (patch: Partial<typeof f>) => act("updateAsset", { assetId: a.id, patch }, { quiet: true, busyKey: "save-" + a.id });
  const upload = async (file: File) => {
    const fd = new FormData(); fd.set("file", file); fd.set("kind", "asset"); fd.set("assetId", a.id);
    const r = await fetch(`/api/projects/${p.id}/upload`, { method: "POST", body: fd });
    const j = await r.json(); if (j.project) { setP(j.project); toast("Reference uploaded"); } else toast(j.error, true);
  };
  const kindDetail = a.kind === "character" ? "Clothing, makeup & accessories" : a.kind === "location" ? "Time of day & lighting" : "Details";

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-800" style={{ aspectRatio: img ? p.aspect.replace(":", " / ") : a.kind === "location" ? "16 / 9" : "1 / 1" }}>
        {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-sm text-ink-400">No reference yet</div>}
        {busy.has(key) && <div className="absolute inset-0 grid place-items-center bg-black/60"><Spinner className="h-7 w-7" /></div>}
        <span className="absolute left-3 top-3"><SourceBadge source={img?.source} /></span>
        <span className="absolute bottom-3 left-3"><RefBadge a={a} /></span>
      </div>
      {img && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {a.refState === "attention" && !!a.refIssues?.length && <p className="w-full rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-amber-200"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{a.refIssues.join("; ")}</p>}
          {!isApproved(a)
            ? <button className="btn-brand h-8 text-xs" onClick={() => act("approveAsset", { assetId: a.id })}><CheckCircle2 className="h-3.5 w-3.5" />Approve reference</button>
            : !a.locked && <button className="btn-ghost h-8 text-xs" onClick={() => act("approveAsset", { assetId: a.id, approved: false })}>Unapprove</button>}
          <button className="btn-outline h-8 text-xs" disabled={busy.has("lockAsset")} onClick={() => act("lockAsset", { assetId: a.id, locked: !a.locked })}>{a.locked ? <><Unlock className="h-3.5 w-3.5" />Unlock</> : <><Lock className="h-3.5 w-3.5" />Lock as bible entry</>}</button>
          {a.locked && <span className="text-ink-400">Locked: spec + this image are injected into every shot and used by the continuity check.</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-brand h-10" disabled={busy.has(key) || a.locked} onClick={() => act("assetImage", { assetId: a.id }, { busyKey: key })}><Sparkles className="h-4 w-4" />{img ? "Regenerate" : "Create image"}</button>
        <label className="btn-outline h-10 cursor-pointer"><Upload className="h-4 w-4" />Upload reference<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      </div>
      {img && (
        <div className="flex gap-2">
          <input className="input h-10" disabled={a.locked} placeholder={a.locked ? "Unlock to regenerate" : "Regenerate with notes (e.g. make the pot handle black, label reads “AKARA”)"} value={change} onChange={(e) => setChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && change.trim()) { act("assetImage", { assetId: a.id, prompt: change }, { busyKey: key }); setChange(""); } }} />
          <button className="btn-outline h-10 shrink-0" disabled={!change.trim() || busy.has(key) || a.locked} onClick={() => { act("assetImage", { assetId: a.id, prompt: change }, { busyKey: key }); setChange(""); }}>Regenerate with notes</button>
        </div>
      )}
      {a.images.length > 1 && (
        <div>
          <span className="label">Versions</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...a.images].reverse().map((v) => (
              <button key={v.id} onClick={() => act("updateAsset", { assetId: a.id, patch: { activeImage: v.id } })} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${v.id === a.activeImage ? "border-brand-400" : "border-transparent opacity-70 hover:opacity-100"}`} title={v.prompt}>
                <img src={v.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center gap-2"><span className="text-sm font-semibold">{a.kind === "prop" ? "Prop bible spec" : a.kind === "character" ? "Character bible spec" : "Location bible spec"}</span>
          <button className="btn-ghost ml-auto h-7 text-xs" disabled={busy.has("expandSpec") || a.locked} onClick={() => act("expandSpec", { assetId: a.id })}>{busy.has("expandSpec") ? <Spinner /> : <Wand2 className="h-3.5 w-3.5" />}{a.spec ? "Re-expand" : "Expand spec"}</button></div>
        {a.spec ? <SpecView spec={a.spec} /> : <p className="text-xs text-ink-400">The Director expands this into exact type, scale, materials, hex colours and label text before the reference sheet is generated.</p>}
      </div>
      <div className="space-y-4 border-t border-white/[0.06] pt-5">
        <div><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => save({ name: f.name })} /></div>
        <div><span className="label">Visual description</span><textarea className="input min-h-24" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} onBlur={() => save({ description: f.description })} placeholder={a.kind === "character" ? "Face, age, skin tone, hair, build" : "What it looks like"} /></div>
        <div><span className="label">{kindDetail}</span><textarea className="input min-h-20" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} onBlur={() => save({ details: f.details })} /></div>
        {a.kind === "character" && (
          <div><span className="label">Voice</span>
            <select className="input h-10" value={f.voice} onChange={(e) => { setF({ ...f, voice: e.target.value }); save({ voice: e.target.value }); }}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" disabled={busy.has("autofillAsset")} onClick={async () => { const r = await act("autofillAsset", { assetId: a.id }); const na = (r as { project?: { assets: Asset[] } })?.project?.assets.find((x) => x.id === a.id); if (na) setF({ ...f, description: na.description, details: na.details }); }}>{busy.has("autofillAsset") ? <Spinner /> : <Wand2 className="h-4 w-4" />} Autofill</button>
          <button className="btn-ghost ml-auto text-red-300 hover:text-red-200" onClick={async () => { if (confirm("Delete this asset?")) { await act("deleteAsset", { assetId: a.id }); onDeleted(); } }}><Trash2 className="h-4 w-4" />Delete</button>
        </div>
      </div>
    </div>
  );
}
