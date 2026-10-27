"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { PUBLIC_LINKS } from "@/lib/publicLinks";

/** Phone-only menu for the public nav: a solid sheet under the bar. */
export function PublicMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  return (
    <div className="md:hidden">
      <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-white/[0.06]">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t border-white/[0.06] bg-ink-950 px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
          <nav className="flex flex-col">
            {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-white/[0.06] py-4 text-lg text-white/90">{l.label}</Link>)}
          </nav>
          <div className="mt-6 grid gap-3">
            {signedIn ? <Link href="/dashboard" className="btn-brand h-12 text-base">Go to dashboard</Link> : <>
              <Link href="/signup" className="btn-brand h-12 text-base">Get started — free</Link>
              <Link href="/login" className="btn-outline h-12 text-base">Log in</Link></>}
          </div>
        </div>
      )}
    </div>
  );
}
