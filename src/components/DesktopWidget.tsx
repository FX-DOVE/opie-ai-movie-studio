"use client";
import { usePathname } from "next/navigation";
import { friendly, H } from "@/lib/net";
import { useCallback, useEffect, useRef, useState } from "react";
import { HomeScreen, Scaled, SleepScreen, type DeskApp } from "./DeskApps";
import { ArrowLeft, ArrowRight, Bot, Hand, Maximize2, Minimize2, Minus, Monitor, RotateCw, Smartphone, Square, X } from "lucide-react";

/** App-wide "computer" widget: the agent's live virtual desktop in a floating window (Grok-style). */
type Sess = { id: string; status: string; mode: string; control?: boolean; needsUser?: string; screen?: string; pageUrl?: string; goal: string; maxSteps: number; steps: { action: string; kind: string }[] };
const KEY = "opie-desk";
export const showDesktop = (id: string) => { try { localStorage.setItem(KEY, id); } catch { /* */ } window.dispatchEvent(new CustomEvent("opie:desk", { detail: { id, open: true } })); };
const live = (s?: Sess | null) => s?.status === "running" || s?.status === "paused";

export function DesktopWidget() {
  const path = usePathname();
  const [id, setId] = useState<string>();
  const [s, setS] = useState<Sess | null>(null);
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(false);
  const [fs, setFs] = useState(false);
  const [rot, setRot] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  const [frame, setFrame] = useState<string>();
  const [addr, setAddr] = useState("");
  const [bar, setBar] = useState(true);
  const [help, setHelp] = useState(false);
  const [land, setLand] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [awake, setAwake] = useState(false);
  const [app, setApp] = useState<DeskApp>(null);
  const [btn, setBtn] = useState<{ r: number; t: number } | null>(null);
  const moved = useRef(false);
  const fsRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const mq = matchMedia("(max-width: 767px), (pointer: coarse) and (max-height: 500px)"); const lq = matchMedia("(orientation: landscape)");
    const f = () => { setMobile(mq.matches); setLand(mq.matches && lq.matches); }; f(); mq.addEventListener("change", f); lq.addEventListener("change", f); screen.orientation?.addEventListener?.("change", f);
    const saved = localStorage.getItem(KEY); if (saved) setId(saved);
    try { const b = JSON.parse(localStorage.getItem("rf-pc-pos") || "null"); if (b) setBtn(b); } catch { /* */ }
    const oa = (e: Event) => { setAwake(true); setApp((e as CustomEvent).detail); }; window.addEventListener("rf:app", oa);
    const on = (e: Event) => { const d = (e as CustomEvent).detail; setId(d.id); if (d.open && !matchMedia("(max-width: 767px), (pointer: coarse) and (max-height: 500px)").matches) { setOpen(true); setMin(false); } };
    window.addEventListener("opie:desk", on);
    const fc = () => { if (!document.fullscreenElement) { setFs(false); setRot(false); } };
    document.addEventListener("fullscreenchange", fc);
    return () => { lq.removeEventListener("change", f); screen.orientation?.removeEventListener?.("change", f); mq.removeEventListener("change", f); window.removeEventListener("opie:desk", on); window.removeEventListener("rf:app", oa); document.removeEventListener("fullscreenchange", fc); };
  }, []);

  // poll status + screen (cheap: steps since a huge n are empty)
  useEffect(() => {
    if (!id) return; let t: ReturnType<typeof setTimeout>; let dead = false;
    const tick = async () => {
      const r = await fetch(`/api/research/${id}?since=${Number.MAX_SAFE_INTEGER}`).catch(() => null);
      if (dead) return; if (!r?.ok) { if (r?.status === 404) { localStorage.removeItem(KEY); setS(null); } return; }
      const x: Sess = await r.json(); setS(x); if (live(x)) { setAwake(true); setApp("browser"); }
      if (x.control && x.mode === "manual") setCtrl(true);
      if (live(x)) t = setTimeout(tick, open || fs ? 900 : 2500); else setCtrl(false);
    };
    tick(); return () => { dead = true; clearTimeout(t); };
  }, [id, open, fs]);

  // phone rotated to landscape while the viewer is open → edge-to-edge (Fullscreen API where supported, CSS 100vw/100dvh otherwise)
  useEffect(() => { if (!fs || !mobile) return; setRot(false); setHelp(false); if (land) { fsRef.current?.requestFullscreen?.().catch(() => {}); setBar(true); clearTimeout(hide.current); hide.current = setTimeout(() => setBar(false), 2600); } }, [land, fs, mobile]);
  const send = useCallback(async (e: Record<string, unknown>) => {
    if (!s) return; busy.current = true;
    try { const r = await fetch(`/api/research/${s.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }); const j = await r.json(); if (r.ok) { if (j.screen) setFrame(j.screen); if (j.url && document.activeElement?.id !== "desk-addr") setAddr(j.url); } } finally { busy.current = false; }
  }, [s]);
  const controlling = ctrl && live(s);
  useEffect(() => { if (!controlling || !(open || fs)) return; const t = setInterval(() => { if (!busy.current) send({ t: "frame" }); }, 450); return () => clearInterval(t); }, [controlling, open, fs, send]);
  const op = (o: string) => s && fetch(`/api/research/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: o }) });
  const take = async () => { await op("takeover"); setCtrl(true); };
  const back = async () => { await op("handback"); setCtrl(false); setFrame(undefined); };
  const stop = async () => { await op("stop"); setCtrl(false); };

  const enterFs = async () => {
    setFs(true); setBar(true);
    requestAnimationFrame(() => fsRef.current?.requestFullscreen?.().catch(() => {}));
  };
  const exitFs = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setFs(false); setRot(false); try { screen.orientation.unlock(); } catch { /* */ } };
  const rotate = async () => {
    if (rot) { setRot(false); try { screen.orientation.unlock(); } catch { /* */ } return; }
    try { if (!document.fullscreenElement) await fsRef.current?.requestFullscreen(); await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock("landscape"); setRot(false); } catch { setRot(true); } // CSS rotate fallback (iOS)
  };
  const poke = () => { setBar(true); clearTimeout(hide.current); hide.current = setTimeout(() => setBar(false), 2600); };

  const img = live(s) ? (controlling && frame) || s?.screen : undefined;
  const browse = async (url: string) => {
    const u = /^https?:\/\//.test(url) ? url : /\.[a-z]{2,}/i.test(url) && !url.includes(" ") ? "https://" + url : "https://www.google.com/search?q=" + encodeURIComponent(url);
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 25000);
    try {
      const x = await fetch("/api/research", { method: "POST", headers: H, body: JSON.stringify({ manual: true, url: u }), signal: ac.signal });
      const r = await x.json(); if (!r?.id) throw new Error(r?.error || "Couldn’t start the browser");
      showDesktop(r.id); setId(r.id); setCtrl(true); setAwake(true); setApp("browser");
    } catch (e) { throw new Error((e as Error).name === "AbortError" ? "The browser took too long to start — tap Go to retry." : friendly(e)); }
    finally { clearTimeout(to); }
  };
  // map a click on an object-contain image to normalised page coords
  const click = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!controlling || rot) return; const el = e.currentTarget; const r = el.getBoundingClientRect();
    const ar = (el.naturalWidth || 16) / (el.naturalHeight || 10); const cover = getComputedStyle(el).objectFit === "cover"; let w = r.width, h = r.width / ar; if (cover ? h < r.height : h > r.height) { h = r.height; w = h * ar; }
    const x = (e.clientX - r.left - (r.width - w) / 2) / w, y = (e.clientY - r.top - (r.height - h) / 2) / h;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) send({ t: "click", x, y });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (!controlling || e.metaKey || e.ctrlKey) return;
    if (e.key.length === 1) { e.preventDefault(); send({ t: "type", text: e.key }); }
    else if (["Enter", "Tab", "Backspace", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete"].includes(e.key)) { e.preventDefault(); send({ t: "key", key: e.key }); }
  };
  const Screen = ({ cls, cover }: { cls: string; cover?: boolean }) => img
    ? <img src={img} alt="Agent desktop" draggable={false} onClick={click} className={`${cls} select-none ${cover ? "object-cover" : "object-contain"} ${controlling && !rot ? "cursor-pointer" : ""}`} />
    : live(s) ? <div className={`${cls} grid place-items-center text-center text-ink-500`}><div><Monitor className="mx-auto h-9 w-9" /><p className="mt-2 text-xs">Booting browser…</p></div></div>
    : <div className={`${cls} overflow-hidden`}><Scaled>{awake ? <HomeScreen app={app} setApp={setApp} steps={s?.steps || []} lastScreen={s?.screen} goal={s?.goal} onBrowse={browse} onSleep={() => { setAwake(false); setApp(null); }} /> : <SleepScreen onWake={() => setAwake(true)} />}</Scaled></div>;

  const running = s?.status === "running";
  const status = !s ? "idle" : s.status === "running" ? (controlling ? "you" : "live") : s.status;
  const IB = "grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white disabled:opacity-40";
  const last = s?.steps?.length ? s.steps[s.steps.length - 1]?.action : "";

  // drag (desktop window)
  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); const ox = e.clientX - box.left, oy = e.clientY - box.top;
    const mv = (m: PointerEvent) => setPos({ x: Math.max(8, Math.min(innerWidth - 160, m.clientX - ox)), y: Math.max(8, Math.min(innerHeight - 48, m.clientY - oy)) });
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const dragBtn = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget; const r0 = el.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; moved.current = false; el.setPointerCapture(e.pointerId);
    const mv = (m: PointerEvent) => { if (!moved.current && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return; moved.current = true;
      setBtn({ r: Math.max(8, Math.min(innerWidth - 48, innerWidth - r0.right - (m.clientX - sx))), t: Math.max(8, Math.min(innerHeight - 48, r0.top + m.clientY - sy)) }); };
    const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); setBtn((b) => { if (b && moved.current) localStorage.setItem("rf-pc-pos", JSON.stringify(b)); return b; }); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  };
  if (path === "/" && !open && !fs) return null; // landing page stays clean

  return <>
    {/* header button (top-right, app-wide) */}
    <button aria-label="Open computer (drag to move)" title={`Computer · ${status}`} onPointerDown={dragBtn} onClick={() => { if (moved.current) { moved.current = false; return; } if (mobile) enterFs(); else if (open) setMin(!min); else { setOpen(true); setMin(false); } }}
      style={{ touchAction: "none", ...(btn ? { right: btn.r, top: btn.t } : {}) }}
      className="fixed right-3 top-3 z-[60] grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-ink-900/85 text-ink-200 shadow-lg backdrop-blur transition hover:border-brand-400/50 hover:text-white md:right-5 md:top-4">
      <Monitor className="h-[18px] w-[18px]" />
      {live(s) && <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3"><span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${running ? "animate-ping bg-emerald-400" : "bg-amber-400"}`} /><span className={`relative inline-flex h-3 w-3 rounded-full border-2 border-ink-900 ${running ? "bg-emerald-400" : "bg-amber-400"}`} /></span>}
    </button>

    {/* floating window (tablet/desktop) */}
    {open && !fs && !mobile && (
      <div role="dialog" aria-label="Virtual desktop" style={pos ? { left: pos.x, top: pos.y } : { right: 20, top: 64 }}
        className={`fixed z-[55] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950/95 shadow-2xl shadow-black/60 backdrop-blur ${min ? "w-[300px]" : "h-[440px] w-[640px] min-h-[260px] min-w-[360px] max-h-[90dvh] max-w-[96vw] resize"}`}>
        <div onPointerDown={drag} className="flex h-11 shrink-0 cursor-move items-center gap-2 border-b border-white/[0.06] bg-ink-900 px-3">
          <Monitor className="h-4 w-4 text-brand-400" /><span className="text-sm font-semibold">ReelForge computer</span>
          <span className={`badge ${status === "live" ? "bg-emerald-500/15 text-emerald-300" : status === "you" ? "bg-brand-500/20 text-brand-200" : status === "paused" ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-ink-300"}`}>{status === "live" && <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />}{status === "you" ? "You’re in control" : status.toUpperCase()}</span>
          <span className="ml-auto flex items-center gap-0.5">
            <button className={IB} title={min ? "Restore" : "Minimise"} aria-label="Minimise" onClick={() => setMin(!min)}><Minus className="h-4 w-4" /></button>
            <button className={IB} title="Fullscreen" aria-label="Fullscreen" onClick={enterFs}><Maximize2 className="h-4 w-4" /></button>
            <button className={IB} title="Close" aria-label="Close desktop window" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
          </span>
        </div>
        {!min && <>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
            <button className={IB} disabled={!controlling} onClick={() => send({ t: "back" })} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
            <button className={IB} disabled={!controlling} onClick={() => send({ t: "forward" })} aria-label="Forward"><ArrowRight className="h-4 w-4" /></button>
            <button className={IB} disabled={!controlling} onClick={() => send({ t: "reload" })} aria-label="Reload"><RotateCw className="h-4 w-4" /></button>
            <input id="desk-addr" className="h-8 min-w-0 flex-1 rounded-lg bg-ink-800 px-3 text-xs text-white outline-none placeholder:text-ink-500 focus:ring-1 focus:ring-brand-400 disabled:text-ink-400" disabled={!controlling}
              value={controlling ? addr : s?.pageUrl || ""} placeholder="about:blank" onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { send({ t: "navigate", url: addr }); (e.target as HTMLInputElement).blur(); } }} />
          </div>
          {s?.needsUser === "signin" && !controlling && <div className="border-b border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">Sign-in needed — take control and sign in yourself. The agent never types passwords.</div>}
          <div tabIndex={0} onKeyDown={keys} onWheel={controlling ? (e) => send({ t: "scroll", dy: Math.max(-800, Math.min(800, e.deltaY * 2)) }) : undefined}
            onPaste={controlling ? (e) => { e.preventDefault(); send({ t: "type", text: e.clipboardData.getData("text") }); } : undefined}
            className={`relative min-h-0 flex-1 bg-black outline-none ${controlling ? "ring-2 ring-inset ring-brand-400/50" : ""}`}>{Screen({ cls: "absolute inset-0 h-full w-full" })}
            {last && !controlling && <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-[11px] text-white/85">{last}</div>}
          </div>
          <div className="flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.06] px-2">
            {live(s) ? (controlling
              ? (s?.mode === "manual" ? <span className="text-[11px] text-ink-400">Manual browser — click & type on the screen</span> : <button className="btn-brand h-8 px-3 text-xs" onClick={back}><Bot className="h-3.5 w-3.5" />Hand back to agent</button>)
              : <button className={`h-8 px-3 text-xs ${s?.needsUser ? "btn-brand animate-pulse" : "btn-outline"}`} onClick={take}><Hand className="h-3.5 w-3.5" />Take control</button>)
              : <span className="text-[11px] text-ink-500">{s ? `Session ${s.status}` : "Idle"}</span>}
            <span className="ml-auto truncate text-[11px] text-ink-500">{s?.goal}</span>
            {live(s) && <button className="btn-outline h-8 px-3 text-xs text-red-300" onClick={stop}><Square className="h-3.5 w-3.5" />Stop</button>}
          </div>
        </>}
      </div>
    )}

    {/* fullscreen: desktop = remote screen edge-to-edge; mobile = 16:9 letterbox like a video player */}
    {fs && (
      <div ref={fsRef} tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape" && !controlling) exitFs(); else keys(e); }} onMouseMove={poke} onTouchStart={poke}
        onWheel={controlling ? (e) => send({ t: "scroll", dy: Math.max(-800, Math.min(800, e.deltaY * 2)) }) : undefined}
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black outline-none" style={{ touchAction: "pinch-zoom" }}>
        <div className={mobile && land ? "fixed inset-0 h-[100dvh] w-screen" : rot ? "absolute left-1/2 top-1/2 h-[100vw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90" : mobile ? "relative aspect-video w-full max-h-full" : "absolute inset-0"}>
          {Screen({ cls: "absolute inset-0 h-full w-full", cover: mobile && land })}
        </div>
        {mobile && land ? <div className={`transition-opacity duration-300 ${bar ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <button aria-label="Exit fullscreen" onClick={exitFs} className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur"><X className="h-4 w-4" /></button>
          {live(s) && <button onClick={controlling ? (s?.mode === "manual" ? stop : back) : take} className="absolute bottom-3 right-3 h-9 rounded-full bg-black/60 px-4 text-sm text-white ring-1 ring-white/15 backdrop-blur">{controlling ? (s?.mode === "manual" ? "Done" : "Hand back") : "Take control"}</button>}
        </div> : mobile ? <>
          <div className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] ${rot ? "opacity-0 pointer-events-none" : ""}`}>
            <button aria-label="Back" onClick={exitFs} className="grid h-12 w-12 place-items-center rounded-full bg-ink-900/90 text-white ring-1 ring-white/10"><ArrowLeft className="h-5 w-5" /></button>
            <span className="flex items-center gap-2 text-[17px] font-medium text-white"><img src="/brand/reel.webp" alt="" className={`h-7 w-7 rounded-full ${running ? "animate-pulse" : ""}`} />Reel’s computer</span>
            <button aria-label="Help" onClick={() => setHelp(!help)} className="grid h-12 w-12 place-items-center rounded-full bg-ink-900/90 text-xl text-white ring-1 ring-white/10">?</button>
          </div>
          {help && <div className="absolute right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] w-64 rounded-2xl border border-white/10 bg-ink-900/95 p-3 text-xs text-ink-300 shadow-2xl">
            <p className="text-white">{s?.goal || "ReelForge computer"}</p><p className="mt-1 truncate text-ink-500">{s?.pageUrl} · {status}</p>
            <p className="mt-2">Pinch to zoom. Take control to tap and type on the page — the agent never types passwords.</p>
            <div className="mt-3 flex gap-2"><button className="btn-outline h-8 flex-1 px-2 text-xs" onClick={() => { setHelp(false); rotate(); }}><Smartphone className="h-3.5 w-3.5 rotate-90" />Landscape</button>
              {live(s) && <button className="btn-outline h-8 flex-1 px-2 text-xs text-red-300" onClick={() => { setHelp(false); stop(); }}><Square className="h-3.5 w-3.5" />Stop</button>}</div>
          </div>}
          {rot && <button aria-label="Exit landscape" onClick={rotate} className="absolute bottom-4 left-4 grid h-10 w-10 place-items-center rounded-full bg-ink-900/90 text-white ring-1 ring-white/10"><Minimize2 className="h-4 w-4" /></button>}
          {live(s) && <button onClick={controlling ? (s?.mode === "manual" ? stop : back) : take} className={`absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-4 h-12 rounded-full px-5 text-[17px] text-white ring-1 ring-white/10 ${s?.needsUser && !controlling ? "bg-brand-500" : "bg-ink-900/95"}`}>{controlling ? (s?.mode === "manual" ? "Done" : "Hand back") : "Take control"}</button>}
          {controlling && !rot && <input aria-label="Type into the page" placeholder="Type, then ⏎" enterKeyHint="send" className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-4 h-12 w-[45%] rounded-full bg-ink-900/95 px-4 text-sm text-white outline-none ring-1 ring-white/10" onKeyDown={(e) => { const t = e.currentTarget; if (e.key === "Enter") { e.preventDefault(); const v = t.value; t.value = ""; (v ? send({ t: "type", text: v }) : Promise.resolve()).then(() => send({ t: "key", key: "Enter" })); } }} />}
        </> : (
        <div className={`absolute inset-x-0 top-0 flex items-center gap-1.5 bg-gradient-to-b from-black/85 via-black/50 to-transparent px-3 pb-6 pt-3 transition-opacity duration-300 ${bar || !img ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-emerald-400" : live(s) ? "bg-amber-400" : "bg-ink-500"}`} />
          <span className="min-w-0 flex-1 truncate text-xs text-white/80">{s?.pageUrl || "ReelForge computer"}</span>
          {live(s) && (controlling ? (s?.mode !== "manual" && <button className="btn-brand h-8 px-2.5 text-xs" onClick={back}><Bot className="h-3.5 w-3.5" />Hand back</button>)
            : <button className="btn-outline h-8 border-white/20 px-2.5 text-xs text-white" onClick={take}><Hand className="h-3.5 w-3.5" />Take control</button>)}
          {live(s) && <button className={IB + " text-red-300"} aria-label="Stop agent" title="Stop" onClick={stop}><Square className="h-4 w-4" /></button>}
          <button className={IB + " text-white"} aria-label="Exit fullscreen" title="Exit fullscreen" onClick={exitFs}><Minimize2 className="h-4 w-4" /></button>
        </div>)}
      </div>
    )}
  </>;
}
