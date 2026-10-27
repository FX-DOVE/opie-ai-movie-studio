import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { PublicNav, PublicFooter, CtaBand } from "@/components/PublicSite";

export const metadata = { title: "ReelForge Studio — an AI film studio" };

const STEPS = [
  ["01", "Develop", "Brainstorm loglines, hooks and beat sheets with the writers’ room agent — or paste your own screenplay."],
  ["02", "Cast & build", "Characters, locations and props are pulled from the script. Lock each one with a reference sheet."],
  ["03", "Board", "A director agent breaks scenes into shots with start and end frames, chained for continuity."],
  ["04", "Supervise", "A vision pass checks every frame against the production bible — faces, wardrobe, props — and fixes drift."],
  ["05", "Shoot & voice", "Frames become clips through a pluggable video engine; neural voices read every line."],
  ["06", "Cut", "Timeline, music and subtitles. Describe the change you want and the editor re-cuts and exports MP4."],
];
const FEATURES = [
  ["Consistent cast", "Reference sheets for every character, location and prop follow each shot, so faces and wardrobe don’t drift."],
  ["Any format", "Live action, 3D animation or anime — 9:16 Shorts and Reels, 16:9 episodes or 2.39:1 drama."],
  ["Voices & music", "Neural voices read every line, with subtitles and a score laid on the timeline."],
  ["An agent producer", "Reel runs each department for you, researches references on its own computer and hands you the wheel anytime."],
];
const MODELS = [
  ["Writers’ room", "Loglines, hooks, beat sheets and full screenplays from a one-line idea."],
  ["Director", "Breaks scenes into shots with start and end frames, chained for continuity."],
  ["Continuity supervisor", "Vision checks each frame against the production bible and flags drift."],
  ["Reel, the producer", "The chat agent that plans the work and operates its own browser and desktop."],
];
const STILLS = [
  { src: "/brand/still-desert.webp", t: "Live action", f: "2.39:1 · Drama" },
  { src: "/brand/still-fox.webp", t: "3D animation", f: "9:16 · Short" },
  { src: "/brand/still-anime.webp", t: "Anime", f: "16:9 · Episode" },
];

export default function Landing() {
  return (
    <main className="relative overflow-x-hidden">
      <PublicNav overlay />

      {/* hero: a full-bleed film still */}
      <section className="grain relative isolate min-h-[88svh] overflow-hidden">
        <img src="/brand/still-lagos.webp" alt="Film still: a woman in a red ankara dress in a rain-soaked night market" className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_30%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/55 to-ink-950/30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/80 via-transparent to-transparent" />
        <div className="mx-auto flex min-h-[88svh] max-w-7xl flex-col justify-end px-5 pb-14 pt-28 sm:px-8 sm:pb-20">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand-400">An AI film studio</p>
          <h1 className="font-display mt-4 max-w-3xl text-[44px] leading-[0.98] text-white sm:text-7xl lg:text-[88px]">
            From a single idea <em className="text-brand-400">to a finished film.</em>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/75 sm:text-lg">
            ReelForge writes, casts, storyboards, keeps every face and costume consistent, voices and cuts — drama, animation, anime or ads, for Shorts, Reels or long-form.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn-brand h-12 px-6 text-base">Get started — free <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/login" className="btn-outline h-12 bg-black/20 px-6 text-base backdrop-blur">Log in</Link>
          </div>
          <p className="mt-10 text-[11px] uppercase tracking-[0.18em] text-white/40">Still generated in ReelForge · “Market Rain”, scene 4</p>
        </div>
      </section>

      {/* formats */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <h2 className="font-display max-w-xl text-4xl leading-[1.05] sm:text-5xl">Any look. One consistent cast.</h2>
          <p className="max-w-sm text-sm leading-relaxed text-ink-300">Reference sheets travel with every shot, so your lead looks like your lead from the first frame to the last.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STILLS.map((s) => (
            <figure key={s.t} className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink-850">
              <img src={s.src} alt={s.t} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 to-transparent p-4 pt-16">
                <span className="text-sm font-medium text-white">{s.t}</span>
                <span className="font-mono text-[11px] text-white/60">{s.f}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* pipeline */}
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-white/[0.07] bg-ink-900/60 p-5">
              <h3 className="font-medium text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-16 border-y border-white/[0.06] bg-ink-900">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand-400">How it works</p>
          <h2 className="font-display mt-3 text-4xl sm:text-5xl">The whole crew, in order.</h2>
          <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="border-t border-white/10 pt-5">
                <span className="font-mono text-xs text-brand-400">{n}</span>
                <h3 className="mt-2 text-lg font-medium">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* agent */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl leading-[1.05] sm:text-5xl">Meet Reel, your producer.</h2>
          <p className="mt-5 max-w-lg text-ink-300">Ask in plain words. Reel creates projects, runs each department, researches references on its own computer — Files, Terminal and a real browser — and hands you the wheel whenever you want it.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-400 hover:text-brand-500">Create a free account to meet Reel <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-900 p-6">
          <div className="flex items-center gap-3"><img src="/brand/reel.webp" alt="" className="h-11 w-11 rounded-full" /><div><p className="text-sm font-medium">Reel</p><p className="text-xs text-emerald-400">online</p></div></div>
          <div className="mt-6 space-y-3 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2 text-ink-950">Make a 60-second drama about a market girl in the rain.</p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-ink-800 px-3.5 py-2 text-ink-200">On it. I’ve created “Market Rain”, pitched three loglines and started the script. Want me to cast Ada next?</p>
          </div>
        </div>
      </section>

      <section id="models" className="scroll-mt-16 border-y border-white/[0.06] bg-ink-900">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand-400">Built on Meta models</p>
              <h2 className="font-display mt-3 max-w-xl text-4xl leading-[1.05] sm:text-5xl">Muse Spark runs the crew.</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-300">Meta’s Muse Spark is the reasoning and vision model behind the studio’s departments — one model family, tuned per task.</p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODELS.map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-white/[0.07] bg-ink-950/60 p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-brand-400">Muse Spark</p>
                <h3 className="mt-2 font-medium text-white">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="pt-20 sm:pt-28"><CtaBand /></div>
      <PublicFooter />
    </main>
  );
}
