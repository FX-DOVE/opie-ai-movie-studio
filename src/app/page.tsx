import Link from "next/link";
import { ArrowRight, Brain, Clapperboard, Eye, Film, Globe2, Mic, ScrollText, Sparkles, Users, Wand2 } from "lucide-react";
import { Logo } from "@/components/ui";

const STEPS = [
  { icon: ScrollText, t: "Script", d: "Brainstorm with Muse Spark, turn an idea into a screenplay, or paste your own." },
  { icon: Users, t: "Cast & assets", d: "Characters, locations and props auto-extracted. Generate reference sheets or upload yours." },
  { icon: Clapperboard, t: "Storyboard", d: "Muse Wonder directs a shot list with start and end frames, chained for continuity." },
  { icon: Eye, t: "Continuity check", d: "Muse vision compares every frame to the production bible and fixes drift in one click." },
  { icon: Film, t: "Video & voice", d: "Frames become clips through a pluggable video engine. Free Edge neural voices by default." },
  { icon: Wand2, t: "Edit by prompt", d: "Timeline, music, subtitles. Tell the AI editor what to change, then export an MP4." },
];

export default function Landing() {
  return (
    <main className="relative overflow-hidden">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-8 h-16">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/research" className="btn-ghost hidden sm:inline-flex">Research agent</Link>
          <Link href="/admin" className="btn-ghost hidden sm:inline-flex">Admin</Link>
          <Link href="/studio" className="btn-primary">Open studio</Link>
        </nav>
      </header>

      <section className="relative mx-auto max-w-5xl px-5 sm:px-8 pt-14 sm:pt-24 pb-16 text-center">
        <span className="chip mx-auto"><Sparkles className="h-3.5 w-3.5 text-sky-glow" /> Directed by Meta Muse · Wonder · Spark · Image</span>
        <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          Your whole film crew,<br className="hidden sm:block" /> <span className="bg-gradient-to-r from-brand-400 via-white to-sky-glow bg-clip-text text-transparent">in one AI studio.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-ink-300 sm:text-lg">
          Drama, anime, Pixar-style, cartoon, documentary and product ads — for Shorts, TikTok, Reels or long-form YouTube. Opie writes, casts, storyboards, keeps every face and costume consistent, voices it and cuts it together.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/studio?new=1" className="btn-brand h-12 px-6 text-base w-full sm:w-auto">Start a project <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/research" className="btn-outline h-12 px-6 text-base w-full sm:w-auto"><Globe2 className="h-4 w-4" /> Watch the research agent</Link>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 sm:px-8 pb-10">
        <div className="panel overflow-hidden p-2 sm:p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Realistic", "Pixar / 3D", "Cartoon", "Anime"].map((s, i) => (
              <div key={s} className="relative aspect-[4/5] overflow-hidden rounded-xl" style={{ background: ["linear-gradient(160deg,#1b1f2a,#5a3d2b 60%,#c28b5a)", "linear-gradient(160deg,#1d3b6e,#3fa7d6 60%,#f6c85f)", "linear-gradient(160deg,#ff5e5b,#ffed66 60%,#00cecb)", "linear-gradient(160deg,#2d1b4e,#b83b8b 60%,#ffb4a2)"][i] }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                  <span className="text-sm font-semibold">{s}</span>
                  <span className="badge bg-black/40 text-white/80">{["16:9", "9:16", "1:1", "9:16"][i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 sm:px-8 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Idea → finished film, in six steps</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="panel p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05]"><s.icon className="h-5 w-5 text-brand-400" /></span>
                <span className="text-xs font-semibold text-ink-400">STEP {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 sm:px-8 pb-20">
        <div className="panel grid gap-6 p-6 sm:p-10 lg:grid-cols-3">
          {[
            { icon: Brain, t: "Muse Wonder", d: "Agentic director: shot lists, edit plans and the computer-use research desktop." },
            { icon: Eye, t: "Muse Spark", d: "Writer, brainstorm partner and multimodal continuity supervisor." },
            { icon: Sparkles, t: "Muse Image", d: "Reference sheets, start/end frames and prompt-based edits." },
          ].map((m) => (
            <div key={m.t} className="flex gap-4">
              <m.icon className="mt-0.5 h-6 w-6 shrink-0 text-sky-glow" />
              <div><h3 className="font-semibold">{m.t}</h3><p className="mt-1 text-sm text-ink-300">{m.d}</p></div>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-ink-400"><Mic className="h-3.5 w-3.5" /> Voice by pluggable TTS (Edge neural voices by default). Video by pluggable first→last-frame engines. Built for the Meta Global AI Developer Hackathon 2026.</p>
      </section>
    </main>
  );
}
