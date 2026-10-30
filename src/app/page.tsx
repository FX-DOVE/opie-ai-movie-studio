import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PublicNav, PublicFooter, CtaBand } from "@/components/PublicSite";
import { FilmStage, FilmStrip, FloatCard, Hero, Reveal, StepSequence } from "@/components/landing/Motion";

export const metadata = { title: "ReelForge Studio — from an idea to a finished film" };

const STEPS: [string, string, string][] = [
  ["01", "Idea", "One sentence, or a full screenplay. The writers’ room pitches loglines and beats."],
  ["02", "Script", "Screenplay format, written to your film style — blockbuster, K-drama, Nollywood and more."],
  ["03", "Cast", "Characters, locations and props get locked reference sheets."],
  ["04", "Board", "Every shot gets start and end frames, chained for continuity and checked against the bible."],
  ["05", "Voice", "Each character gets a voice; every line is checked for clarity."],
  ["06", "Cut", "Camera moves, music, subtitles and loudness — exported as MP4."],
];
const FEATURES = [
  ["Consistent cast", "Reference sheets travel with every shot, so faces and wardrobe never drift."],
  ["Eight film styles", "American blockbuster, martial-arts action, K-drama romcom, war epic, Nollywood and more — each with its own grammar."],
  ["Continuity, automatically", "Each frame is reviewed against the production bible and fixed before you see it."],
  ["Clear voices", "Every line is played back and checked by speech recognition, then re-voiced if it’s unclear."],
  ["Any screen", "9:16 Shorts and Reels, 16:9 episodes, 1:1 and 4:5 feeds."],
  ["A producer on call", "Reel plans the work, runs each department and hands you the wheel anytime."],
];
const MODELS = [
  ["Muse Spark", "Writes, directs and reviews every frame for continuity."],
  ["Muse Wonder", "Takes over the hardest calls — long scripts and tricky fixes."],
  ["Muse Image", "Paints reference sheets and every storyboard frame."],
  ["MMS & wav2vec2", "Meta’s open speech models voice each line and check it’s clear."],
];
const STILLS = [
  { src: "/brand/still-lagos.webp", t: "Market Rain · Sc 4" },
  { src: "/brand/still-desert.webp", t: "Dune Road · Sc 1" },
  { src: "/brand/still-fox.webp", t: "Fox & Lantern · Sc 2" },
  { src: "/brand/still-anime.webp", t: "Skyline · Ep 1" },
];

export default function Landing() {
  return (
    <main className="relative overflow-x-hidden bg-[#fff]">
      <PublicNav overlay />
      <Hero video="/brand/hero-loop.mp4" poster="/brand/hero-poster.webp" />

      <section className="py-6"><FilmStrip stills={STILLS} /></section>

      <section id="film" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-20 sm:px-8 sm:pt-28">
        <Reveal><h2 className="text-center text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Made here. Start to finish.</h2></Reveal>
        <Reveal delay={0.08}><p className="mx-auto mt-4 max-w-xl text-center text-lg text-ink-400">Written, cast, boarded, voiced and cut in ReelForge.</p></Reveal>
        <FilmStage src="/brand/film.mp4" poster="/brand/hero-poster.webp" />
      </section>

      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Reveal><h2 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">A whole film crew.<br /><span className="text-ink-400">In one window.</span></h2></Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d], i) => (
            <FloatCard key={t} from={i % 2 ? "right" : "left"} i={i}>
              <h3 className="text-lg font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-400">{d}</p>
            </FloatCard>
          ))}
        </div>
      </section>

      <section id="how" className="scroll-mt-16 bg-ink-900">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal><h2 className="text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Idea to film, in six moves.</h2></Reveal>
          <StepSequence steps={STEPS} />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Meet Reel, your producer.</h2>
          <p className="mt-5 max-w-lg text-lg text-ink-400">Ask in plain words. Reel creates projects, runs each department, researches references on its own computer and hands you the wheel whenever you want it.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-1.5 text-base font-medium text-brand-500 hover:underline">Start creating with Reel <ArrowUpRight className="h-4 w-4" /></Link>
        </Reveal>
        <FloatCard from="right" className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3"><img src="/brand/reel.webp" alt="" className="h-11 w-11 rounded-full" /><div><p className="text-sm font-semibold">Reel</p><p className="text-xs text-emerald-400">online</p></div></div>
          <div className="mt-6 space-y-3 text-[15px]">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2 text-ink-950">Make a 60-second K-drama about a barista and a grumpy regular.</p>
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-ink-800 px-3.5 py-2 text-ink-300">On it. I’ve written “Misspelled”, cast Ji-woo and Min-jun and started the storyboard. Want to see the first frames?</p>
          </div>
        </FloatCard>
      </section>

      <section id="models" className="scroll-mt-16 bg-ink-900">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <h2 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">Built on Meta models.</h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-ink-400">Every model the studio calls is a Meta model. Camera moves, mixing and subtitles are plain FFmpeg.</p>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODELS.map(([t, d], i) => (
              <FloatCard key={t} from={i % 2 ? "right" : "left"} i={i}>
                <span className="text-sm tabular-nums text-ink-500">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-400">{d}</p>
              </FloatCard>
            ))}
          </div>
        </div>
      </section>

      <div className="pt-24 sm:pt-32"><CtaBand /></div>
      <PublicFooter />
    </main>
  );
}
