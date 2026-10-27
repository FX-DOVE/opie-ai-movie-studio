"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, MousePointer2, Pointer } from "lucide-react";
import { H } from "@/lib/net";
import { SleepScreen } from "./DeskApps";

/** Reel's real Linux desktop (Xvfb + Openbox + Chromium), streamed as JPEG frames; input goes back over xdotool. */
export type DeskState = "unavailable" | "asleep" | "starting" | "awake" | "error" | "loading";
export type InputMode = "mouse" | "touch";

export function useDesk() {
  const [state, setState] = useState<DeskState>("loading");
  const [control, setControl] = useState(false);
  const local = useRef(0); // ignore polls that started before a local change
  useEffect(() => {
    let dead = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const t0 = Date.now();
      const r = await fetch("/api/desk/status", { headers: H, cache: "no-store" }).catch(() => null);
      const j = r ? await r.json().catch(() => null) : null;
      if (dead) return; if (t0 > local.current) { setState(j?.state || "unavailable"); if (j && "control" in j) setControl(!!j.control); }
      t = setTimeout(tick, 3000);
    };
    tick(); return () => { dead = true; clearTimeout(t); };
  }, []);
  const post = (op: string, b: unknown = {}) => fetch("/api/desk/" + op, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({}));
  const wake = async () => { local.current = Date.now(); setState("starting"); const j = await post("wake"); setState(j.state || "error"); };
  const take = async (on: boolean) => { local.current = Date.now(); setControl(on); await post("control", { on }); local.current = Date.now(); };
  return { state, control, wake, take, post, sleep: async () => { await post("sleep"); setState("asleep"); setControl(false); } };
}

const MODE_KEY = "rf-input-mode";
export function useInputMode(): [InputMode, (m: InputMode) => void] {
  const [m, setM] = useState<InputMode>("touch");
  useEffect(() => { const v = localStorage.getItem(MODE_KEY); if (v === "mouse" || v === "touch") setM(v); }, []);
  return [m, (v) => { setM(v); try { localStorage.setItem(MODE_KEY, v); } catch { /* */ } }];
}

/**
 * Phone keyboard for the remote desktop. A plain tap never focuses the hidden input (that made iOS pop the keyboard up and drop it
 * on every tap). The keyboard opens only (a) when the tap lands on a text field in the desktop — probed while the finger is down so
 * focus() still happens inside the same gesture — or (b) from the keyboard button next to the mouse/touch toggle. Once open it stays
 * open while you type: taps on the desktop don't steal focus (touchstart is cancelled), and only an auto-opened keyboard closes when
 * you tap somewhere that isn't a text field.
 */
type KbState = { el: HTMLInputElement | null; open: boolean; auto: boolean; hint: boolean; control: boolean };
const kbBus: KbState & { subs: Set<() => void>; set: (p: Partial<KbState>) => void } = {
  el: null, open: false, auto: false, hint: false, control: false, subs: new Set(),
  set(p) { let ch = false; for (const k of Object.keys(p) as (keyof KbState)[]) if (this[k] !== p[k]) { (this as unknown as Record<string, unknown>)[k] = p[k]; ch = true; } if (ch) this.subs.forEach((f) => f()); },
};
function useKb() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); kbBus.subs.add(f); return () => { kbBus.subs.delete(f); }; }, []);
  return kbBus;
}
const openKb = (auto: boolean) => { const el = kbBus.el; if (!el) return; kbBus.set({ auto, hint: false }); if (document.activeElement !== el) el.focus({ preventScroll: true }); };
const closeKb = () => { kbBus.set({ hint: false }); kbBus.el?.blur(); };
/** Button handlers that never take focus from the hidden input: pointerdown is cancelled (no focus move, no compat mouse events),
 *  so the action runs on pointerup — still inside the user gesture iOS needs for focus() — and on keyboard "click" (detail 0). */
const tap = (fn: () => void) => ({
  onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); },
  onPointerUp: (e: React.PointerEvent) => { e.stopPropagation(); if (e.button === 0) fn(); },
  onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (e.detail === 0) fn(); },
});

export function ModeToggle({ mode, setMode, className = "" }: { mode: InputMode; setMode: (m: InputMode) => void; className?: string }) {
  const kb = useKb();
  const B = (m: InputMode, Icon: typeof Pointer, label: string) => (
    <button aria-label={label} aria-pressed={mode === m} title={label} {...tap(() => setMode(m))}
      className={`grid h-8 w-8 place-items-center rounded-full transition ${mode === m ? "bg-white text-black" : "text-white/70 hover:text-white"}`}><Icon className="h-4 w-4" /></button>
  );
  return <div className={`flex items-center gap-0.5 rounded-full bg-ink-900/90 p-0.5 ring-1 ring-white/10 ${className}`}>{B("mouse", MousePointer2, "Mouse mode")}{B("touch", Pointer, "Touch mode")}
    {kb.control && <button aria-label={kb.open ? "Hide keyboard" : "Show keyboard"} aria-pressed={kb.open} title={kb.open ? "Hide keyboard" : "Show keyboard"} {...tap(() => (kbBus.open ? closeKb() : openKb(false)))}
      className={`relative grid h-8 w-8 place-items-center rounded-full transition ${kb.open ? "bg-white text-black" : "text-white/70 hover:text-white"}`}><Keyboard className="h-4 w-4" />
      {kb.hint && !kb.open && <span className="pointer-events-none absolute inset-0 animate-ping rounded-full ring-2 ring-brand-400" />}</button>}
  </div>;
}

const KEYS = ["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];

export function RealDesk({ desk, mode }: { desk: ReturnType<typeof useDesk>; mode: InputMode }) {
  const { state, control, wake, post } = desk;
  const [src, setSrc] = useState<string>();
  const [cur, setCur] = useState({ x: 0.5, y: 0.5 });
  const box = useRef<HTMLDivElement>(null);
  const kb = useRef<HTMLInputElement>(null);
  const curRef = useRef(cur); curRef.current = cur;

  // Stream: a WebSocket pushes only changed JPEG frames and carries input both ways (no per-frame/per-click HTTP round trip).
  // Falls back to HTTP frame polling + POST input where WebSockets can't reach the desktop (e.g. the dev tunnel).
  const ws = useRef<WebSocket | null>(null);
  const acks = useRef(new Map<number, (j: { text?: boolean; cls?: string }) => void>());
  const seq = useRef(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (state !== "awake") return; let dead = false, url = "", sock: WebSocket | null = null, retry: ReturnType<typeof setTimeout>, fails = 0;
    const show = (b: Blob) => { const u = URL.createObjectURL(b); setSrc(u); if (url) setTimeout((o: string) => URL.revokeObjectURL(o), 500, url); url = u; };
    const connect = () => {
      if (dead || document.visibilityState !== "visible") return;
      try { sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/desk/ws`); } catch { fails = 9; poll(); return; }
      sock.binaryType = "blob"; let opened = false;
      sock.onopen = () => { opened = true; fails = 0; ws.current = sock; setLive(true); };
      sock.onmessage = (e) => {
        if (typeof e.data !== "string") return show(e.data as Blob);
        try { const j = JSON.parse(e.data); if (j.t === "ack") { acks.current.get(j.id)?.(j); acks.current.delete(j.id); } } catch { /* */ }
      };
      sock.onclose = () => { if (ws.current === sock) ws.current = null; setLive(false); if (dead) return; if (!opened) fails++; if (fails >= 2) poll(); else retry = setTimeout(connect, 800); };
    };
    let polling = false;
    const poll = async () => {
      if (polling) return; polling = true;
      while (!dead && !ws.current) {
        if (document.visibilityState === "visible") {
          const r = await fetch("/api/desk/frame", { headers: H, cache: "no-store" }).catch(() => null);
          if (r?.status === 200 && (r.headers.get("Content-Type") || "").includes("image")) { const b = await r.blob(); if (!dead) show(b); }
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      polling = false;
    };
    const vis = () => { if (document.visibilityState === "visible") { if (!ws.current && fails < 2) connect(); } else sock?.close(); };
    document.addEventListener("visibilitychange", vis); connect();
    return () => { dead = true; clearTimeout(retry); document.removeEventListener("visibilitychange", vis); sock?.close(); ws.current = null; if (url) URL.revokeObjectURL(url); };
  }, [state]);

  const q = useRef<Promise<unknown>>(Promise.resolve());
  // serialise input so keystrokes/clicks arrive in order
  const raw = useCallback((o: Record<string, unknown>): Promise<{ text?: boolean }> => {
    const s = ws.current;
    if (s && s.readyState === 1) {
      if (o.t !== "click" && o.t !== "up") { s.send(JSON.stringify(o)); return Promise.resolve({}); }
      const id = ++seq.current; s.send(JSON.stringify({ ...o, id }));
      return new Promise<{ text?: boolean; cls?: string }>((res) => { acks.current.set(id, res); setTimeout(() => { if (acks.current.delete(id)) res({}); }, 4000); })
        .then(async (j) => (/chrom/i.test(j.cls || "") ? { text: Number(o.y) < 0.13 || (await fetch("/api/desk/editable", { headers: H, cache: "no-store" }).then((r) => r.json()).catch(() => ({}))).text } : j));
    }
    const p = q.current.then(() => post("input", o)); q.current = p.catch(() => {}); return p as Promise<{ text?: boolean }>;
  }, [post]);
  // typed characters are batched (one message per burst, not per key)
  const buf = useRef(""); const bt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useCallback(() => { clearTimeout(bt.current); if (buf.current) { const text = buf.current; buf.current = ""; raw({ t: "type", text }); } }, [raw]);
  const send = useCallback((o: Record<string, unknown>) => {
    if (o.t === "type") { buf.current += String(o.text || ""); clearTimeout(bt.current); bt.current = setTimeout(flush, ws.current ? 25 : 60); return Promise.resolve({} as { text?: boolean }); }
    flush(); return raw(o);
  }, [raw, flush]);
  const at = (cx: number, cy: number) => { const r = box.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (cx - r.left) / r.width)), y: Math.max(0, Math.min(1, (cy - r.top) / r.height)) }; };
  // keyboard (see kbBus): never focus on a plain tap; probe the tap point while the finger is down, focus inside the same gesture only for text fields
  const kbs = useKb();
  useEffect(() => { kbBus.set({ control }); if (!control) closeKb(); }, [control]);
  useEffect(() => { kbBus.el = kb.current; });
  useEffect(() => () => { kbBus.el = null; kbBus.set({ open: false, hint: false, control: false }); }, []);
  const probe = useRef<{ at: number; text?: boolean }>({ at: 0 });
  const startProbe = (p: { x: number; y: number }) => {
    if (kbBus.open) return; const at = Date.now(); probe.current = { at };
    fetch(`/api/desk/editable?x=${p.x.toFixed(4)}&y=${p.y.toFixed(4)}`, { headers: H, cache: "no-store" }).then((r) => r.json()).then((j) => { if (probe.current.at === at) probe.current.text = !!j.text; }).catch(() => {});
  };
  const wantFocus = useRef(false);
  const clickAndKb = async (p: { x: number; y: number }, button = "left") => {
    setCur(p); curRef.current = p;
    // inside the gesture: the probe already says "text field" → raise the keyboard now (iOS only allows focus from a user gesture)
    if (button === "left" && !kbBus.open && probe.current.text) { wantFocus.current = true; openKb(true); }
    const j = await send({ t: "click", ...p, button });
    if (button !== "left") return;
    if (j?.text && !kbBus.open) kbBus.set({ hint: true }); // too late to focus outside the gesture: pulse the keyboard button instead
    else if (!j?.text && kbBus.open && kbBus.auto) closeKb(); // auto-opened for a field the user has left
    else if (!j?.text) kbBus.set({ hint: false });
  };
  // Cancel touchstart (non-passive) so a tap never moves focus: an open keyboard stays open, no blur/refocus flicker, no zoom/magnifier.
  // touchend is a trusted gesture on iOS, so a pending "focus for this text field" is applied there as well.
  useEffect(() => {
    const el = box.current; if (!el || !control) return;
    const ts = (e: TouchEvent) => { if (e.cancelable && !(e.target as Element).closest?.("button")) e.preventDefault(); };
    const te = () => { if (wantFocus.current) { wantFocus.current = false; if (!kbBus.open) openKb(true); } };
    el.addEventListener("touchstart", ts, { passive: false }); el.addEventListener("touchend", te);
    return () => { el.removeEventListener("touchstart", ts); el.removeEventListener("touchend", te); };
  });

  // gesture state
  const g = useRef<{ pts: Map<number, { x: number; y: number }>; sx: number; sy: number; moved: boolean; t0: number; long?: ReturnType<typeof setTimeout>; acc: number; lastMove: number; two: boolean; mouse: boolean }>({ pts: new Map(), sx: 0, sy: 0, moved: false, t0: 0, acc: 0, lastMove: 0, two: false, mouse: false });
  const flushScroll = (p?: { x: number; y: number }) => { const s = g.current; if (Math.abs(s.acc) >= 30) { send({ t: "scroll", dy: s.acc * 3, ...(p || {}) }); s.acc = 0; } };

  const onDown = (e: React.PointerEvent) => {
    if (!control) return; const s = g.current; try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic/stale pointer */ }
    s.mouse = e.pointerType === "mouse";
    if (s.mouse) { const p = at(e.clientX, e.clientY); setCur(p); return; }
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pts.size === 1) {
      s.sx = e.clientX; s.sy = e.clientY; s.moved = false; s.two = false; s.t0 = Date.now(); s.acc = 0; wantFocus.current = false;
      startProbe(mode === "mouse" ? curRef.current : at(e.clientX, e.clientY));
      clearTimeout(s.long);
      s.long = setTimeout(() => { if (!s.moved && s.pts.size === 1) { s.moved = true; const p = mode === "mouse" ? curRef.current : at(s.sx, s.sy); clickAndKb(p, "right"); navigator.vibrate?.(15); } }, 550);
    } else { s.two = true; s.moved = true; clearTimeout(s.long); }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!control) return; const s = g.current;
    if (s.mouse) { if (e.buttons === 0) return; const p = at(e.clientX, e.clientY); setCur(p); return; }
    const prev = s.pts.get(e.pointerId); if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y; s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!s.moved && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) > 8) { s.moved = true; clearTimeout(s.long); }
    if (!s.moved) return;
    if (s.two || mode === "touch") { s.acc += -dy / (s.two ? 2 : 1); flushScroll(mode === "touch" ? at(s.sx, s.sy) : undefined); return; }
    // mouse mode: trackpad — relative movement
    const r = box.current!.getBoundingClientRect(); const k = 1.6;
    const n = { x: Math.max(0, Math.min(1, curRef.current.x + (dx / r.width) * k)), y: Math.max(0, Math.min(1, curRef.current.y + (dy / r.height) * k)) };
    setCur(n); curRef.current = n;
    if (Date.now() - s.lastMove > (ws.current ? 25 : 60)) { s.lastMove = Date.now(); send({ t: "move", ...n }); }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!control) return; const s = g.current;
    if (s.mouse) { openKb(false); clickAndKb(at(e.clientX, e.clientY), e.button === 2 ? "right" : "left"); return; } // real mouse = real keyboard: no on-screen keyboard to flicker
    s.pts.delete(e.pointerId); if (s.pts.size) return; clearTimeout(s.long);
    if (s.moved) { if (mode === "mouse" && !s.two) send({ t: "move", ...curRef.current }); return; }
    if (Date.now() - s.t0 < 550) clickAndKb(mode === "mouse" ? curRef.current : at(e.clientX, e.clientY));
  };

  if (state === "asleep" || state === "loading") return <div className="absolute inset-0"><SleepScreen onWake={wake} /></div>;
  if (state === "starting") return <div className="absolute inset-0 grid place-items-center bg-black text-xs text-ink-400">Waking up Reel’s computer…</div>;
  if (state !== "awake") return <div className="absolute inset-0 grid place-items-center bg-black p-4 text-center text-xs text-ink-400">The desktop service isn’t running.<button className="btn-outline ml-2 h-7 px-2 text-xs" onClick={wake}>Retry</button></div>;
  return (
    <div ref={box} className={`absolute inset-0 select-none overflow-hidden bg-black ${control ? "ring-2 ring-inset ring-brand-400/60" : ""}`}
      style={{ touchAction: control ? "none" : "auto", cursor: control && mode === "mouse" ? "none" : "default" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { g.current.pts.clear(); clearTimeout(g.current.long); }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={control ? (e) => send({ t: "scroll", dy: e.deltaY, ...at(e.clientX, e.clientY) }) : undefined}>
      {src ? <img src={src} alt="Reel’s desktop" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
        : <p className="grid h-full place-items-center text-xs text-ink-400">Connecting…</p>}
      {(mode === "mouse" || control) && <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute h-5 w-5 drop-shadow" style={{ left: `${cur.x * 100}%`, top: `${cur.y * 100}%` }}><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" /></svg>}
      {control && <span className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${live ? "bg-emerald-500/80 text-black" : "bg-black/60 text-white/70"}`}>{live ? "LIVE" : "HTTP"}</span>}
      {control && kbs.hint && !kbs.open && <button {...tap(() => openKb(true))}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-ink-900/90 px-2.5 py-1 text-[11px] text-white ring-1 ring-brand-400/60"><Keyboard className="h-3.5 w-3.5" />Tap to type</button>}
      <input ref={kb} aria-label="Keyboard for Reel’s computer" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="go" tabIndex={-1}
        onFocus={() => kbBus.set({ open: true, hint: false })} onBlur={() => kbBus.set({ open: false, auto: false })}
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0" style={{ fontSize: 16 }}
        onKeyDown={(e) => { if (KEYS.includes(e.key)) { e.preventDefault(); send({ t: "key", key: e.key }); } else if ((e.ctrlKey || e.metaKey) && e.key.length === 1) { e.preventDefault(); send({ t: "key", key: "ctrl+" + e.key.toLowerCase() }); } }}
        onInput={(e) => { const t = e.currentTarget; const v = t.value; t.value = ""; if (v) send({ t: "type", text: v }); }} />
    </div>
  );
}
