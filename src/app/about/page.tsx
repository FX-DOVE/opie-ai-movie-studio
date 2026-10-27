import { PublicNav, PublicFooter, PageHero, CtaBand } from "@/components/PublicSite";
export const metadata = { title: "About" };

const POINTS = [
  ["Why we built it", "Generating a beautiful clip is easy. Making a film — where the same person, wearing the same clothes, walks through scene after scene — is not. ReelForge treats AI filmmaking as a production, not a prompt."],
  ["How it’s organised", "Like a real studio: a writers’ room, casting, a director who boards shots, a continuity supervisor, a shoot, a voice booth and an edit suite. Reel, the producer agent, runs them for you."],
  ["What powers it", "Meta’s Muse Spark handles writing, directing and the vision-based continuity checks. Video and voice engines are pluggable, so you can bring the providers you prefer."],
  ["Where we are", "ReelForge started as an entry to the Meta Global AI Developer Hackathon 2026 and is in public beta. Expect rough edges — and fast improvements."],
];

export default function Page() {
  return (
    <main className="overflow-x-hidden">
      <PublicNav />
      <PageHero kicker="About" title={<>A film studio that <em className="text-brand-400">keeps its cast.</em></>} sub="ReelForge takes one idea through script, casting, boards, shooting, voice and edit — keeping every face, costume and prop consistent from the first frame to the last." />
      <section className="mx-auto grid max-w-7xl gap-x-10 gap-y-10 px-5 pb-20 sm:px-8 md:grid-cols-2">
        {POINTS.map(([t, d]) => (
          <div key={t} className="border-t border-white/10 pt-5">
            <h2 className="text-lg font-medium">{t}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-300 sm:text-base">{d}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <img src="/brand/still-desert.webp" alt="Film still generated in ReelForge" loading="lazy" className="aspect-[21/9] w-full rounded-3xl object-cover" />
      </section>
      <CtaBand />
      <PublicFooter />
    </main>
  );
}
