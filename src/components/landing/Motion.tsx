"use client";
import Link from "next/link";
import { useRef, type ReactNode, type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from "motion/react";
import { ArrowRight, Play } from "lucide-react";

const spring = { type: "spring", stiffness: 120, damping: 20, mass: 0.8 } as const;

/** Full-bleed hero: muted looping film under a soft white wash, scroll-linked zoom and fade. */
export function Hero({ video, poster }: { video: string; poster: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const item: Variants = { hidden: { opacity: 0, y: reduce ? 0 : 24 }, show: { opacity: 1, y: 0, transition: spring } };
  return (
    <section ref={ref} className="relative isolate min-h-[92svh] overflow-hidden">
      <motion.div style={{ scale, y }} className="absolute inset-0 -z-10 will-change-transform">
        <video className="h-full w-full object-cover" src={video} poster={poster} autoPlay muted loop playsInline preload="metadata" aria-hidden />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#fff] via-[#fff]/75 to-[#fff]/10" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#fff]/85 via-[#fff]/30 to-transparent" />
      <motion.div style={{ opacity: fade }} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } }}
        className="mx-auto flex min-h-[92svh] max-w-7xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-24">
        <motion.h1 variants={item} className="max-w-4xl text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-[#1d1d1f] sm:text-7xl lg:text-[92px]">
          From a single idea<br /><span className="text-brand-500">to a finished film.</span>
        </motion.h1>
        <motion.p variants={item} className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-300 sm:text-xl">
          Write, cast, storyboard, voice and cut — with every face and costume kept consistent from the first frame to the last.
        </motion.p>
        <motion.div variants={item} className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn-brand h-12 rounded-full px-7 text-base">Start creating <ArrowRight className="h-4 w-4" /></Link>
          <a href="#film" className="btn h-12 rounded-full border border-black/10 bg-[#fff]/70 px-7 text-base text-[#1d1d1f] shadow-sm backdrop-blur hover:bg-[#fff]"><Play className="h-4 w-4 fill-current" />Watch the film</a>
        </motion.div>
      </motion.div>
    </section>
  );
}

/** Card that floats in from one side on scroll, drifts gently, and lifts and tilts toward the pointer. */
export function FloatCard({ children, from = "left", i = 0, className = "" }: { children: ReactNode; from?: "left" | "right"; i?: number; className?: string }) {
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 }); const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 10); rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  };
  return (
    <motion.div initial={{ opacity: 0, x: reduce ? 0 : from === "left" ? -80 : 80, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ ...spring, delay: i * 0.08 }} style={{ perspective: 900 }} className={className}>
      <motion.div animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}>
        <motion.div onPointerMove={move} onPointerLeave={() => { rx.set(0); ry.set(0); }} style={{ rotateX: rx, rotateY: ry }} whileHover={reduce ? undefined : { y: -8, scale: 1.015 }} transition={spring}
          className="h-full rounded-[24px] border border-black/[0.05] bg-[#fff] p-6 shadow-[0_2px_6px_rgba(0,0,0,.04),0_18px_40px_rgba(0,0,0,.07)] will-change-transform">
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** Reveal on scroll (opacity + translate only). */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ ...spring, delay }} className={className}>{children}</motion.div>;
}

/** Film-strip marquee of stills with sprocket holes. Transform-only, paused under reduced motion. */
export function FilmStrip({ stills }: { stills: { src: string; t: string }[] }) {
  const reduce = useReducedMotion();
  const row = [...stills, ...stills];
  const holes = <div className="flex justify-between gap-3 px-2 py-1.5">{Array.from({ length: 40 }).map((_, k) => <span key={k} className="h-2.5 w-4 shrink-0 rounded-[3px] bg-white/25" />)}</div>;
  return (
    <div className="dark-surface relative overflow-hidden bg-[#111] py-1 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <motion.div className="w-max" animate={reduce ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 40, ease: "linear", repeat: Infinity }}>
        <div className="flex">{[0, 1].map((k) => <div key={k} className="w-1/2">{holes}</div>)}</div>
        <div className="flex gap-2 px-1">
          {row.map((s, k) => (
            <figure key={k} className="relative h-40 w-64 shrink-0 overflow-hidden rounded-sm sm:h-52 sm:w-80">
              <img src={s.src} alt={k < stills.length ? s.t : ""} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              <figcaption className="absolute bottom-1.5 left-2 font-mono text-[10px] uppercase tracking-widest text-white/70">{s.t}</figcaption>
            </figure>
          ))}
        </div>
        <div className="flex">{[0, 1].map((k) => <div key={k} className="w-1/2">{holes}</div>)}</div>
      </motion.div>
    </div>
  );
}

/** Idea → film: a scroll-linked progress rail lighting up each step in turn. */
export function StepSequence({ steps }: { steps: [string, string, string][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const scaleX = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  return (
    <div ref={ref} className="relative mt-14">
      <div className="absolute left-0 right-0 top-[18px] hidden h-[2px] rounded bg-black/[0.06] lg:block" />
      <motion.div style={{ scaleX: reduce ? 1 : scaleX }} className="absolute left-0 right-0 top-[18px] hidden h-[2px] origin-left rounded bg-brand-500 lg:block" />
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
        {steps.map(([n, t, d], i) => (
          <motion.li key={n} initial={{ opacity: 0, y: reduce ? 0 : 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ ...spring, delay: i * 0.1 }} className="relative">
            <span className="relative z-10 grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-[#fff] text-xs font-semibold tabular-nums text-brand-500 shadow-sm">{n}</span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{d}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** The film itself on a dark stage that scales up as it enters. */
export function FilmStage({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.88, 1]);
  const radius = useTransform(scrollYProgress, [0, 1], [40, 28]);
  return (
    <motion.div ref={ref} style={{ scale, borderRadius: radius }} className="dark-surface mt-12 overflow-hidden bg-black shadow-[0_30px_80px_rgba(0,0,0,.25)] will-change-transform">
      <video src={src} poster={poster} controls playsInline preload="none" className="aspect-video w-full bg-black object-cover" />
    </motion.div>
  );
}
