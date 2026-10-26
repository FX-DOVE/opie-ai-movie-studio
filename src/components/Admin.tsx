"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, LogOut, Save, ShieldCheck } from "lucide-react";
import { Spinner, useToast } from "./ui";

type Field = { key: string; label: string; secret: boolean; group: string; help?: string; options?: string[]; default?: string; value: string; source: string };
type Data = { fields: Field[]; status: Record<string, boolean | string> };

export function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { toast, node } = useToast();
  const load = async () => { const r = await fetch("/api/admin/settings"); if (r.status === 401) return setAuthed(false); setAuthed(true); setData(await r.json()); };
  useEffect(() => { load(); }, []);
  if (authed === null) return <div className="grid min-h-[60dvh] place-items-center"><Spinner className="h-6 w-6" /></div>;
  if (!authed) return <Login onDone={load} />;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-brand-400" /><h1 className="text-2xl font-semibold tracking-tight">Admin · Providers & keys</h1>
        <button className="btn-ghost ml-auto" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); setAuthed(false); }}><LogOut className="h-4 w-4" />Sign out</button>
      </div>
      <p className="mt-1 text-sm text-ink-400">Keys are encrypted at rest (AES-256-GCM) on the server and never sent to the browser — you only see a masked hint.</p>
      {data && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[["Meta models", data.status.meta], ["Video engine", data.status.video], ["YouTube API", data.status.youtube]].map(([l, v]) => <span key={String(l)} className={`badge ${v ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{String(l)}: {v ? "live" : "demo"}</span>)}
          <span className="badge bg-sky-500/15 text-sky-300">TTS: {String(data.status.tts)}</span>
        </div>
      )}
      {data && [...new Set(data.fields.map((f) => f.group))].map((g) => <Group key={g} title={g} fields={data.fields.filter((f) => f.group === g)} onSaved={(d) => { setData(d); toast("Saved securely"); }} />)}
      {node}
    </div>
  );
}

function Group({ title, fields, onSaved }: { title: string; fields: Field[]; onSaved: (d: Data) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Record<string, boolean>>({});
  const dirty = Object.keys(vals).length > 0;
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vals) });
    setBusy(false); if (r.ok) { setVals({}); onSaved(await r.json()); }
  };
  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2>
        <button className="btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? <Spinner /> : <Save className="h-4 w-4" />}Save</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="label flex items-center gap-2">{f.secret && <KeyRound className="h-3 w-3" />}{f.label}<span className={`ml-auto normal-case tracking-normal ${f.source === "unset" ? "text-ink-600" : "text-emerald-300/80"}`}>{f.source}</span></span>
            {f.options ? (
              <select className="input h-10" value={vals[f.key] ?? f.value} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            ) : (
              <div className="relative">
                <input className="input h-10 pr-10" type={f.secret && !show[f.key] ? "password" : "text"} autoComplete="off" placeholder={f.secret ? (f.value || "Not set") : f.default || ""} value={vals[f.key] ?? (f.secret ? "" : f.value)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                {f.secret && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" onClick={() => setShow({ ...show, [f.key]: !show[f.key] })}>{show[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
              </div>
            )}
            {f.help && <span className="mt-1 block text-[11px] text-ink-400">{f.help}</span>}
            {f.secret && f.source === "admin" && <button type="button" className="mt-1 text-[11px] text-red-300/80 hover:text-red-300" onClick={() => setVals({ ...vals, [f.key]: "" })}>Remove key on save</button>}
          </label>
        ))}
      </div>
    </section>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    setBusy(false); if (r.ok) onDone(); else setErr((await r.json()).error);
  };
  return (
    <div className="grid min-h-[80dvh] place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-6 sm:p-8">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/15"><Lock className="h-5 w-5 text-brand-400" /></div>
        <div><h1 className="text-xl font-semibold">Admin sign in</h1><p className="mt-1 text-sm text-ink-400">Manage API keys and providers.</p></div>
        <div><span className="label">Email</span><input className="input h-11" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><span className="label">Password</span><input className="input h-11" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn-brand h-11 w-full" disabled={busy}>{busy ? <Spinner /> : "Sign in"}</button>
      </form>
    </div>
  );
}
