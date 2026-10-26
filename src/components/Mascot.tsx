"use client";
import { useEffect, useRef, useState } from "react";

const MOVES = ["bot-wave", "bot-nod", "bot-shake", "bot-jump"];
const POS = "rf-bot-pos";

/** Reel — the studio's rendered robot mascot. Breathes and blinks when idle; reacts with a random move on tap. */
export function Mascot({ size = 60, still, floating, onTap }: { size?: number; still?: boolean; floating?: boolean; onTap?: () => void }) {
  const [move, setMove] = useState("");
  const [pos, setPos] = useState<{ side: "l" | "r"; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!floating) return;
    try { const p = JSON.parse(localStorage.getItem(POS) || "null"); if (p) setPos(p); } catch { /* */ }
  }, [floating]);

  const react = () => {
    if (localStorage.getItem("rf-mute") !== "1") {
      audio.current ??= new Audio("/brand/blip.mp3");
      audio.current.currentTime = 0; audio.current.volume = 0.5; audio.current.play().catch(() => {});
    }
    const m = MOVES[Math.floor(Math.random() * MOVES.length)];
    setMove(""); requestAnimationFrame(() => setMove(m));
  };

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!floating) return;
    const el = e.currentTarget; const r = el.getBoundingClientRect(); const sy = e.clientY, sx = e.clientX, oy = sy - r.top;
    moved.current = false; el.setPointerCapture(e.pointerId);
    const mv = (m: PointerEvent) => {
      if (!moved.current && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
      moved.current = true; setDragging(true);
      const y = Math.max(12, Math.min(innerHeight - size - 12, m.clientY - oy));
      setPos({ side: m.clientX < innerWidth / 2 ? "l" : "r", y: y / innerHeight });
    };
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); setDragging(false);
      setPos((p) => { if (p && moved.current) localStorage.setItem(POS, JSON.stringify(p)); return p; });
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };
  const click = () => { if (moved.current) { moved.current = false; return; } react(); if (onTap) setTimeout(onTap, 520); };

  const face = (
    <span className={`relative block ${still || dragging ? "" : "bot-breathe"}`} style={{ width: size, height: size }}>
      <span key={move} className={`relative block h-full w-full ${move}`} onAnimationEnd={() => setMove("")}>
        <img src="/brand/reel.webp" alt="" draggable={false} className="h-full w-full select-none rounded-full object-cover shadow-[0_10px_30px_-6px_rgba(0,0,0,.8),0_0_0_1px_rgba(255,255,255,.08)]" />
        {/* eyelids for the blink */}
        {[34.8, 65].map((x) => <span key={x} className="bot-lid absolute rounded-[50%] bg-[#0d0d0e]" style={{ left: `${x - 5}%`, top: "52.5%", width: "10%", height: "14.5%" }} />)}
      </span>
    </span>
  );

  if (!floating) return <span onClick={react} className="cursor-pointer">{face}</span>;
  const style: React.CSSProperties = pos ? { top: `${pos.y * 100}%`, [pos.side === "l" ? "left" : "right"]: 16 } : { bottom: "calc(env(safe-area-inset-bottom) + 84px)", right: 16 };
  return (
    <button aria-label="Chat with Reel, your assistant (drag to move)" onPointerDown={down} onClick={click} style={{ ...style, touchAction: "none" }}
      className={`fixed z-[65] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:bottom-6 ${dragging ? "scale-110 cursor-grabbing" : "cursor-pointer transition-transform"}`}>
      {face}
      <span className="absolute -right-0.5 top-1 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-400" />
    </button>
  );
}
