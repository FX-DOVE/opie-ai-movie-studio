"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, LogOut, Save, ShieldCheck } from "lucide-react";
import { Spinner, useToast } from "./ui";
import { VideoProvidersAdmin } from "./VideoProvidersAdmin";

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
      {data && <VideoProvidersAdmin toast={toast} />}
      {data && <UsagePanel />}
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
      {title.startsWith("Storage") && <R2Help />}
      {TESTS[title] && <div className="mb-4 flex flex-wrap gap-2">{TESTS[title].map((t) => <TestBtn key={t.kind} {...t} />)}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="label flex items-center gap-2">{f.secret && <KeyRound className="h-3 w-3" />}{f.label}<span className={`ml-auto normal-case tracking-normal ${f.source === "unset" ? "text-ink-600" : "text-emerald-300/80"}`}>{f.source}</span></span>
            {f.options ? (
              <select className="input h-10" value={vals[f.key] ?? f.value} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value, ...(f.key === "R2_ACCOUNT_ID" ? {} : {}) })}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            ) : (
              <div className="relative">
                <input className="input h-10 pr-10" type={f.secret && !show[f.key] ? "password" : "text"} autoComplete="off" placeholder={f.secret ? (f.value || "Not set") : f.default || ""} value={vals[f.key] ?? (f.secret ? "" : f.value)} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value, ...(f.key === "R2_ACCOUNT_ID" && /^[a-f0-9]{32}$/.test(e.target.value) ? { R2_ENDPOINT: `https://${e.target.value}.r2.cloudflarestorage.com` } : {}) })} />
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

const TESTS: Record<string, { kind: string; label: string }[]> = {
  "Meta Model API": [{ kind: "meta", label: "Test Meta key" }, { kind: "contributor", label: "Check contributor access" }, { kind: "computer", label: "Test computer use" }, { kind: "compare", label: "Compare Spark vs Wonder" }],
  "Baseten (Director model)": [{ kind: "baseten", label: "Test Baseten key" }],
  "AI brain (provider chain)": [{ kind: "fallback", label: "Test fallback (OmniRoute)" }],
  "Research agent": [{ kind: "computer", label: "Test computer use" }],
};
function TestBtn({ kind, label }: { kind: string; label: string }) {
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const run = async () => { setBusy(true); setRes(null); try { setRes(await (await fetch("/api/admin/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) })).json()); } catch (e) { setRes({ ok: false, message: String(e) }); } setBusy(false); };
  return <div className="flex min-w-0 flex-col gap-1"><button type="button" className="btn-outline h-8 w-fit text-xs" disabled={busy} onClick={run}>{busy ? <Spinner /> : null}{label}</button>
    {res && <span className={`max-w-md whitespace-pre-line text-[11px] ${res.ok ? "text-emerald-300" : "text-amber-300"}`}>{res.ok ? "✓ " : "⚠ "}{res.message}</span>}</div>;
}

type Agg = { key: string; calls: number; in: number; cached: number; out: number; images: number; usd: number };
function UsagePanel() {
  const [days, setDays] = useState(7);
  type Esc = { at: string; label: string; from: string; to: string; reason: string; outcome: string; steps: number; spark: { in: number; out: number; usd: number }; wonder: { in: number; out: number; usd: number } };
  const [u, setU] = useState<{ total: number; byTask: Agg[]; byModel: Agg[]; escalations?: Esc[]; unpriced?: string[] } | null>(null);
  useEffect(() => { fetch(`/api/admin/test?days=${days}`).then((r) => r.json()).then(setU).catch(() => {}); }, [days]);
  const k = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));
  const T = ({ rows, head }: { rows: Agg[]; head: string }) => (
    <table className="w-full text-left text-xs"><thead className="text-ink-400"><tr><th className="py-1">{head}</th><th>Calls</th><th>In (cached)</th><th>Out</th><th className="text-right">USD</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-white/[0.05]"><td className="py-1 pr-2">{r.key}</td><td>{r.calls}</td><td>{k(r.in)} ({k(r.cached)})</td><td>{k(r.out)}{r.images ? ` · ${r.images} img` : ""}</td><td className="text-right">${r.usd.toFixed(4)}</td></tr>)}</tbody></table>
  );
  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3"><h2 className="font-semibold">Usage & cost</h2>
        <select className="input h-8 w-auto text-xs" value={days} onChange={(e) => setDays(+e.target.value)}>{[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}</select>
        <span className="ml-auto text-sm text-white">${u?.total.toFixed(4) ?? "…"}</span></div>
      <p className="mb-3 text-[11px] text-ink-400">Tokens and <b>estimated</b> cost per task and model, using the prices in Admin → Pricing (edit them to match your Meta billing page; cached input uses the cached rate). No prompts are stored.{u?.unpriced?.length ? ` Not priced (tokens only): ${u.unpriced.join(", ")}.` : ""}</p>
      {u && (u.byTask.length ? <div className="grid gap-5 md:grid-cols-2"><T rows={u.byTask} head="Task" /><T rows={u.byModel} head="Model" /></div> : <p className="text-sm text-ink-400">No AI calls logged yet.</p>)}
      <h3 className="mb-1 mt-5 text-sm font-semibold">Escalations (Spark → Wonder)</h3>
      <p className="mb-2 text-[11px] text-ink-400">Each time a computer-use task was handed to the escalation model: why, how it ended, and tokens/cost spent on each model — so you can judge whether escalating actually helps.</p>
      {u?.escalations?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-ink-400"><tr><th className="py-1">When (WAT)</th><th>Task</th><th>Reason</th><th>Outcome</th><th>Steps</th><th>{"Spark in/out · $"}</th><th>{"Wonder in/out · $"}</th></tr></thead>
        <tbody>{u.escalations.map((e, i) => <tr key={i} className="border-t border-white/[0.05] align-top"><td className="py-1 pr-2 whitespace-nowrap">{new Date(e.at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "short", timeStyle: "short" })}</td><td className="pr-2">{e.label}</td><td className="pr-2">{e.reason}</td><td className="pr-2">{e.outcome}</td><td>{e.steps}</td><td className="pr-2">{k(e.spark.in)}/{k(e.spark.out)} · ${e.spark.usd.toFixed(4)}</td><td>{k(e.wonder.in)}/{k(e.wonder.out)} · ${e.wonder.usd.toFixed(4)}</td></tr>)}</tbody></table></div> : <p className="text-xs text-ink-400">No escalations yet.</p>}
    </section>
  );
}

function R2Help() {
  const [res, setRes] = useState<{ ok: boolean; message: string; mode?: string } | null>(null); const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  useEffect(() => { fetch("/api/admin/storage").then((r) => r.json()).then((j) => setMode(j.mode)).catch(() => {}); }, []);
  const test = async () => { setBusy(true); setRes(null); try { const j = await (await fetch("/api/admin/storage", { method: "POST" })).json(); setRes(j); setMode(j.mode); } catch (e) { setRes({ ok: false, message: String(e) }); } setBusy(false); };
  return <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-ink-300">
    <div className="flex flex-wrap items-center gap-2"><span>Storage in use: <b className="text-white">{mode === "r2" ? "Cloudflare R2" : "Local disk"}</b></span>
      <button className="btn-outline ml-auto h-8 px-3 text-xs" disabled={busy} onClick={test}>{busy ? <Spinner /> : null}Test connection</button></div>
    {res && <p role="status" className={`mt-2 ${res.ok ? "text-emerald-300" : "text-red-300"}`}>{res.ok ? "✓ " : "✗ "}{res.message}</p>}
    <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-ink-400">
      <li>Cloudflare dashboard → R2 → <b>Manage R2 API Tokens</b> → Create API token.</li>
      <li>Permission <b>Object Read &amp; Write</b>, limited to the <b>cineforge</b> bucket → Create.</li>
      <li>Paste the Access Key ID and Secret Access Key here, Save, Test connection, then set Enable R2 = on.</li>
    </ol>
  </div>;
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
