"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Shield, Home, Settings } from "lucide-react";
import { Logo } from "./ui";
import { useEffect, useState } from "react";

const BASE_NAV = [
  { href: "/studio", label: "Projects", icon: Clapperboard },
  { href: "/settings", label: "Settings", icon: Settings },
];
const ADMIN_NAV = { href: "/admin", label: "Admin", icon: Shield };
function useNav() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((j) => setAdmin(j.user?.role === "admin")).catch(() => {}); }, []);
  return admin ? [...BASE_NAV, ADMIN_NAV] : BASE_NAV;
}

export function StatusPill() {
  const [s, setS] = useState<{ meta: boolean; llm: string } | null>(null);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const live = s.llm && s.llm !== "demo";
  return (
    <span className={`badge ${live ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`} title={live ? "AI is online" : "No AI key — demo mode"}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-300" : "bg-amber-300"}`} />{live ? "AI online" : "Demo mode"}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const NAV = useNav();
  return (
    <div className="min-h-dvh md:pl-[76px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col items-center border-r border-white/[0.06] bg-ink-900/80 backdrop-blur py-4 md:flex">
        <Link href="/" aria-label="Home"><Logo small /></Link>
        <nav className="mt-8 flex flex-col gap-2">
          {NAV.map((n) => {
            const on = path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`group flex w-[60px] flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition-colors ${on ? "bg-white/[0.08] text-white" : "text-ink-400 hover:text-white hover:bg-white/[0.04]"}`}>
                <n.icon className="h-5 w-5" />{n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-flow-col auto-cols-fr border-t border-white/[0.07] bg-ink-900/95 backdrop-blur md:hidden pb-safe">
        {[{ href: "/", label: "Home", icon: Home }, ...NAV].map((n) => {
          const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${on ? "text-white" : "text-ink-400"}`}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="pb-20 md:pb-0">{children}</div>
    </div>
  );
}
