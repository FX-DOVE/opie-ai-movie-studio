import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "./ui";
import { PublicMenu } from "./PublicMenu";
import { PUBLIC_LINKS } from "@/lib/publicLinks";
import { currentUser } from "@/lib/auth";

/** Shared chrome for the public (signed-out) marketing site. No app code (agent, desktop, sockets) is loaded here. */
export async function PublicNav({ overlay = false }: { overlay?: boolean }) {
  const signedIn = !!(await currentUser());
  return (
    <header className={`${overlay ? "absolute" : "sticky border-b border-white/[0.06] bg-ink-950/85 backdrop-blur-xl"} inset-x-0 top-0 z-40 pt-safe`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href={signedIn ? "/?site" : "/"} aria-label="ReelForge Studio home"><Logo /></Link>
        <nav className="hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:text-white">{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? <Link href="/dashboard" className="btn-primary hidden h-10 md:inline-flex">Dashboard</Link> : <>
            <Link href="/login" className="btn-ghost hidden h-10 md:inline-flex">Log in</Link>
            <Link href="/signup" className="btn-brand h-10 px-4">Get started</Link></>}
          <PublicMenu signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const cols: [string, { href: string; label: string }[]][] = [
    ["Product", [{ href: "/#features", label: "Features" }, { href: "/#how", label: "How it works" }, { href: "/#models", label: "Meta models" }, { href: "/pricing", label: "Pricing" }]],
    ["Company", [{ href: "/about", label: "About" }, { href: "/faq", label: "FAQ" }]],
    ["Account", [{ href: "/signup", label: "Sign up" }, { href: "/login", label: "Log in" }]],
  ];
  return (
    <footer className="border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">An AI film studio: from a single idea to a finished, consistent film.</p>
        </div>
        {cols.map(([h, ls]) => (
          <div key={h}>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{h}</p>
            <ul className="mt-4 space-y-2.5">{ls.map((l) => <li key={l.href}><Link href={l.href} className="text-sm text-ink-300 hover:text-white">{l.label}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 pb-[max(24px,env(safe-area-inset-bottom))] text-xs text-ink-500 sm:flex-row sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} ReelForge Studio</p>
          <p>Hackathon preview · free during beta</p>
        </div>
      </div>
    </footer>
  );
}

export function CtaBand({ title = "Your first film is one sentence away.", sub = "Free during the beta. No card needed." }: { title?: string; sub?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="grain relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-ink-850 via-ink-900 to-ink-950 px-6 py-12 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <h2 className="font-display max-w-2xl text-4xl leading-[1.05] sm:text-5xl">{title}</h2>
        <p className="mt-4 max-w-md text-ink-300">{sub}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn-brand h-12 px-6 text-base">Get started <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/login" className="btn-outline h-12 px-6 text-base">Log in</Link>
        </div>
      </div>
    </section>
  );
}

export function PageHero({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-10 pt-14 sm:px-8 sm:pb-14 sm:pt-20">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-brand-400">{kicker}</p>
      <h1 className="font-display mt-4 max-w-3xl text-[40px] leading-[1.02] sm:text-6xl">{title}</h1>
      {sub && <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-ink-300 sm:text-lg">{sub}</p>}
    </section>
  );
}
