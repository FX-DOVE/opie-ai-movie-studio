import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { PublicNav, PublicFooter, PageHero, CtaBand } from "@/components/PublicSite";
export const metadata = { title: "FAQ" };

const QA: [string, React.ReactNode][] = [
  ["What is ReelForge Studio?", "An AI film studio. Describe an idea and ReelForge develops the script, casts characters with reference sheets, boards shots, checks continuity, generates clips, adds voices and music, and cuts an MP4."],
  ["How much does it cost?", <>It’s free during the beta / hackathon preview. A Pro plan is coming soon, but there’s no price yet and nothing to buy. See <Link href="/pricing" className="text-brand-300 underline">Pricing</Link>.</>],
  ["Which AI models does it use?", "Meta’s Muse Spark powers the writers’ room, the director, the vision-based continuity supervisor and Reel, the producer agent. Video and voice come from pluggable engines you can configure."],
  ["How does it keep characters consistent?", "Every character, location and prop gets a locked reference sheet that travels with each shot. A vision pass compares frames against the production bible and flags or fixes drift."],
  ["Who is Reel?", "Reel is the producer agent you chat with after signing in. It creates projects, runs each department and can research references on its own computer — and you can take over at any time."],
  ["Are my projects private?", "Yes. Projects, renders and background jobs belong to your account and aren’t visible to other users. API keys you add are stored encrypted on the server."],
  ["What formats can I make?", "Live action, 3D animation, anime and ads — in 9:16 for Shorts and Reels, 16:9 for episodes, or 2.39:1 for a cinematic look."],
  ["Do I need an account?", "Yes — the studio, projects and Reel are available only after you sign up. It takes a few seconds and needs just an email and password."],
];

export default function Page() {
  return (
    <main className="overflow-x-hidden">
      <PublicNav />
      <PageHero kicker="FAQ" title="Questions, answered." />
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {QA.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-white [&::-webkit-details-marker]:hidden">
                {q}<ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-ink-300 sm:text-base">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <CtaBand />
      <PublicFooter />
    </main>
  );
}
