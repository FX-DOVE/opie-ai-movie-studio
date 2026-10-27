import Link from "next/link";
import { Check } from "lucide-react";
import { PublicNav, PublicFooter, PageHero, CtaBand } from "@/components/PublicSite";
export const metadata = { title: "Pricing" };

const FREE = ["Unlimited projects during the beta", "Writers’ room, director and continuity checks", "Reel, the agent producer, with its own computer", "Voiceover, subtitles, music and MP4 export", "Bring your own video-engine keys in Settings"];
const PRO = ["Higher generation limits", "Priority rendering queue", "Team workspaces", "Commercial-use terms"];

export default function Page() {
  return (
    <main className="overflow-x-hidden">
      <PublicNav />
      <PageHero kicker="Pricing" title={<>Free while we’re <em className="text-brand-400">in beta.</em></>} sub="ReelForge is a hackathon preview. Everything is free during the beta — no card, no trial clock. Paid plans aren’t available yet; we’ll announce them before anything changes." />
      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-20 sm:px-8 md:grid-cols-2">
        <div className="relative rounded-3xl border border-brand-500/40 bg-ink-900 p-6 sm:p-8">
          <span className="absolute right-6 top-6 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-300">Available now</span>
          <h2 className="text-lg font-medium">Beta</h2>
          <p className="mt-4 font-display text-5xl">Free</p>
          <p className="mt-2 text-sm text-ink-400">During the beta / hackathon preview</p>
          <ul className="mt-8 space-y-3">{FREE.map((f) => <li key={f} className="flex gap-3 text-sm text-ink-200"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />{f}</li>)}</ul>
          <Link href="/signup" className="btn-brand mt-8 h-12 w-full text-base">Get started</Link>
        </div>
        <div className="relative rounded-3xl border border-white/[0.08] bg-ink-900/50 p-6 sm:p-8">
          <span className="absolute right-6 top-6 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-ink-300">Coming soon</span>
          <h2 className="text-lg font-medium">Pro</h2>
          <p className="mt-4 font-display text-5xl text-ink-300">Not yet</p>
          <p className="mt-2 text-sm text-ink-400">No price set — not available to buy</p>
          <ul className="mt-8 space-y-3">{PRO.map((f) => <li key={f} className="flex gap-3 text-sm text-ink-400"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />{f}</li>)}</ul>
          <p className="mt-8 rounded-xl border border-white/[0.06] px-4 py-3 text-center text-sm text-ink-400">Planned features — subject to change</p>
        </div>
      </section>
      <CtaBand title="Start making films today." />
      <PublicFooter />
    </main>
  );
}
