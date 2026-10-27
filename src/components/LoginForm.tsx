"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo, Spinner } from "./ui";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/studio";
  const [mode, setMode] = useState<"in" | "up">(params.get("signup") ? "up" : "in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch(mode === "in" ? "/api/auth/login" : "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/studio";
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6 sm:p-8">
        <Link href="/" aria-label="Home"><Logo /></Link>
        <div><h1 className="text-xl font-semibold">{mode === "in" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-ink-400">{mode === "in" ? "Your projects, renders and background jobs are private to your account." : "Free to start — your projects stay private to you."}</p></div>
        {mode === "up" && <div><span className="label">Name</span><input className="input h-11" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
        <div><span className="label">Email</span><input className="input h-11" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><span className="label">Password</span><input className="input h-11" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={mode === "up" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn-brand h-11 w-full" disabled={busy}>{busy ? <Spinner /> : mode === "in" ? "Sign in" : "Create account"}</button>
        <p className="text-center text-sm text-ink-400">{mode === "in" ? <>New here? <button type="button" className="text-brand-300 underline" onClick={() => { setMode("up"); setErr(""); }}>Create an account</button></> : <>Have an account? <button type="button" className="text-brand-300 underline" onClick={() => { setMode("in"); setErr(""); }}>Sign in</button></>}</p>
      </form>
    </div>
  );
}
