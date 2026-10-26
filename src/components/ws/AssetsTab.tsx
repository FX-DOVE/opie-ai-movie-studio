"use client";
import { useState } from "react";
import { ArrowRight, ImagePlus, MapPin, Package, Plus, Sparkles, Trash2, Upload, User, Wand2 } from "lucide-react";
import type { Asset } from "@/lib/types";
import { Drawer, SourceBadge, Spinner } from "../ui";
import { active, type TabProps } from "./common";

const KINDS = [
  { k: "character" as const, label: "Characters", icon: User, detail: "Clothing & accessories" },
  { k: "location" as const, label: "Locations", icon: MapPin, detail: "Time of day & lighting" },
  { k: "prop" as const, label: "Props", icon: Package, detail: "Material, colour, details" },
];

export function AssetsTab(props: TabProps & { next: () => void }) {
  const { p, act, busy, next } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = p.assets.find((a) => a.id === openId);
  const missing = p.assets.filter((a) => !a.activeImage).length;

  return (
    <div className="flex-1 px-3 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Cast & assets</h2>
            <p className="mt-0.5 text-sm text-ink-400">Lock every face, outfit, place and prop before the storyboard. Upload your own references or let the AI create them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" disabled={!p.script || busy.has("extractAssets")} onClick={() => act("extractAssets")}>{busy.has("extractAssets") ? <Spinner /> : <Wand2 className="h-4 w-4" />} Extract from script</button>
            <button className="btn-outline" disabled={!missing || busy.has("autocreateAssets")} onClick={() => act("autocreateAssets")}>{busy.has("autocreateAssets") ? <Spinner /> : <Sparkles className="h-4 w-4" />} Autocreate {missing ? `(${missing})` : ""}</button>
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
      <div className={`relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-800 ${a.kind === "location" ? "aspect-video" : "aspect-square"}`}>
        {img ? <img src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center text-sm text-ink-400">No reference yet</div>}
        {busy.has(key) && <div className="absolute inset-0 grid place-items-center bg-black/60"><Spinner className="h-7 w-7" /></div>}
        <span className="absolute left-3 top-3"><SourceBadge source={img?.source} /></span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-brand h-10" disabled={busy.has(key)} onClick={() => act("assetImage", { assetId: a.id }, { busyKey: key })}><Sparkles className="h-4 w-4" />{img ? "Regenerate" : "Create image"}</button>
        <label className="btn-outline h-10 cursor-pointer"><Upload className="h-4 w-4" />Upload reference<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      </div>
      {img && (
        <div className="flex gap-2">
          <input className="input h-10" placeholder="Tell it what to change (e.g. make the dress emerald green)" value={change} onChange={(e) => setChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && change.trim()) { act("assetImage", { assetId: a.id, prompt: change }, { busyKey: key }); setChange(""); } }} />
          <button className="btn-outline h-10" disabled={!change.trim() || busy.has(key)} onClick={() => { act("assetImage", { assetId: a.id, prompt: change }, { busyKey: key }); setChange(""); }}>Edit</button>
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
