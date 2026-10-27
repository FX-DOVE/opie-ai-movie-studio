import fs from "node:fs";
import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { MEDIA_DIR, mediaUrl } from "@/lib/db";
import { ffmpeg, probeDuration } from "@/lib/ffmpeg";
import { listProviders, runProvider } from "@/lib/providers/videoProviders";
import { getConfig, providerLive, setConfig, type Provider } from "@/lib/config";
import { usageReport } from "@/lib/usage";
import { endpoint, generateImage } from "@/lib/providers/meta";
import { deskShot, runComputerUse, type CuResult } from "@/lib/computer";
import { deskContext } from "@/lib/desk";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Admin-only connectivity tests. {kind:"meta"|"baseten"|"fallback"|"computer"} — never returns key material. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const { kind } = body;
  const t0 = Date.now(); const ms = () => Date.now() - t0;
  try {
    if (kind === "meta" || kind === "baseten" || kind === "fallback") {
      const w = kind as Provider;
      if (!providerLive(w)) return Response.json({ ok: false, message: "No key saved for this provider yet." });
      const e = endpoint(w, {});
      const r = await fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: e.model, messages: [{ role: "user", content: "Reply with exactly: OK" }], temperature: 0, max_tokens: 400 }), signal: AbortSignal.timeout(45000) });
      const txt = await r.text();
      if (!r.ok) return Response.json({ ok: false, message: `${e.name} · ${e.model}: HTTP ${r.status} — ${txt.replace(/sk-[\w-]+/g, "•••").slice(0, 220)}`, ms: ms() });
      const out = (() => { try { const m = JSON.parse(txt).choices?.[0]?.message || {}; return m.content || (m.reasoning_content || m.reasoning ? "(reasoning only — raise max tokens)" : ""); } catch { return ""; } })();
      return Response.json({ ok: true, message: `${e.name} · ${e.model} answered “${String(out).trim().slice(0, 40)}” in ${ms()} ms`, ms: ms() });
    }
    if (kind === "video") {
      // 2-second test clip from a generated test frame; the clip is saved under media/_admin so it can be previewed
      const { id } = body as { id?: string };
      const prov = listProviders().find((p) => p.id === id);
      if (!prov) return Response.json({ ok: false, message: "Save the provider first." });
      const dir = path.join(MEDIA_DIR, "_admin"); fs.mkdirSync(dir, { recursive: true });
      const frame = path.join(dir, "test-frame.png");
      if (!fs.existsSync(frame)) await ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=1280x720:d=1", "-frames:v", "1", frame]);
      const outFile = path.join(dir, `test-${prov.id}-${Date.now()}.mp4`);
      await runProvider(prov, { startFrame: frame, prompt: "Slow camera push-in on a colourful test pattern, smooth motion.", aspect: (prov.aspects[0] || "16:9"), durationSec: 2, outFile });
      const dur = await probeDuration(outFile).catch(() => 0);
      return Response.json({ ok: true, message: `${prov.name} · ${prov.model}: ${dur ? dur.toFixed(1) + " s" : "clip"} generated in ${(ms() / 1000).toFixed(1)} s (${Math.round(fs.statSync(outFile).size / 1024)} KB).`, url: mediaUrl(outFile), ms: ms() });
    }
    if (kind === "image") {
      // raw-prompt image test (used for prompt before/after comparisons)
      const { prompt, aspect = "16:9" } = body as { prompt?: string; aspect?: string };
      if (!prompt) return Response.json({ ok: false, message: "prompt required" });
      const dir = path.join(MEDIA_DIR, "_admin"); fs.mkdirSync(dir, { recursive: true });
      const outFile = path.join(dir, `img-${Date.now()}.png`);
      const via = await generateImage({ prompt: String(prompt).slice(0, 4000), aspect, outFile, label: "admin test" });
      return Response.json({ ok: via === "meta", message: `${via === "meta" ? "Muse Image" : "mock"} in ${(ms() / 1000).toFixed(1)} s`, url: mediaUrl(outFile), ms: ms() });
    }
    if (kind === "contributor") {
      if (!providerLive("meta")) return Response.json({ ok: false, message: "Save a Meta key first." });
      const e = endpoint("meta", {}); const model = "muse-spark-1.3-contributor";
      const r = await fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], temperature: 0, max_tokens: 400 }), signal: AbortSignal.timeout(45000) });
      const txt = await r.text();
      if (r.ok) { await setConfig("META_CONTRIBUTOR_OK", "yes"); return Response.json({ ok: true, message: `Your key can call ${model} (${ms()} ms). Contributor mode is ${getConfig("META_CONTRIBUTOR_MODE") === "on" ? "ON — Director/general text use it; Meta may train on those inputs" : "still OFF — switch “Contributor mode (opt-in)” on to use it; Meta may train on those inputs"}.`, ms: ms() }); }
      if (r.status === 401) return Response.json({ ok: false, message: "Meta key rejected (401)." });
      await setConfig("META_CONTRIBUTOR_OK", "no");
      return Response.json({ ok: false, message: `No contributor access for this key (HTTP ${r.status}) — Muse Spark 1.3 stays in use. ${txt.slice(0, 160)}`, ms: ms() });
    }
    if (kind === "computer") {
      const shot = await deskShot(200).catch((e) => { throw new Error("Reel’s computer is unreachable: " + (e as Error).message); });
      if (!providerLive("meta")) return Response.json({ ok: false, message: `Desktop OK (screenshot ${Math.round(shot.length * 0.75 / 1024)} KB in ${ms()} ms) — but no Meta key, so research uses the OmniRoute/fallback vision loop. Add a Meta key to enable Meta computer use (Muse Spark 1.3 → Muse Wonder escalation).`, ms: ms() });
      const r = await runComputerUse({ task: "Look at the screen. If a browser is open, click its address bar. Then reply in one short sentence describing what is on screen. Do not type anything.", maxSteps: 3, label: "admin-test" });
      return Response.json({ ok: !!r.text, message: `${r.model}${r.escalated ? ` (escalated: ${r.reason})` : ""}: ${r.steps} action(s) in ${(ms() / 1000).toFixed(1)} s, ~$${r.usd.toFixed(4)} — “${r.text.slice(0, 200)}”${r.stopped ? ` (stopped: ${r.stopped})` : ""}`, ms: ms() });
    }
    if (kind === "compare") {
      // Same small task on Muse Spark 1.3 and Muse Wonder 1.0, one after the other (one shared desktop), no escalation.
      if (!providerLive("meta")) return Response.json({ ok: false, message: "Save a Meta key first — Compare runs the same computer-use task on muse-spark-1.3 and muse-wonder-1.0." });
      await deskShot(0).catch((e) => { throw new Error("Reel’s computer is unreachable: " + (e as Error).message); });
      const task = "In the open browser, go to example.com and reply with the exact title shown on that browser tab. Do not type anything else.";
      const reset = async () => { const c = await deskContext().catch(() => null); const pg = c ? c.pages()[0] || (await c.newPage()) : null; await pg?.goto("about:blank").catch(() => {}); await pg?.bringToFront().catch(() => {}); };
      const one = async (model: string) => { await reset(); const t = Date.now(); try { const r: CuResult = await runComputerUse({ task, model, noEscalate: true, maxSteps: 6, label: `compare-${model}` }); const tk = r.tokens[model] || { in: 0, out: 0, usd: 0 }; return { model, ok: /example domain/i.test(r.text), text: r.text.slice(0, 160), steps: r.steps, seconds: +((Date.now() - t) / 1000).toFixed(1), in: tk.in, out: tk.out, usd: +r.usd.toFixed(5), stopped: r.stopped }; } catch (e) { return { model, ok: false, text: (e as Error).message.slice(0, 160), steps: 0, seconds: +((Date.now() - t) / 1000).toFixed(1), in: 0, out: 0, usd: 0 }; } };
      const a = await one("muse-spark-1.3"); const b = await one("muse-wonder-1.0");
      const fmt = (x: typeof a) => `${x.model}: ${x.ok ? "✓ correct" : "✗"} · ${x.steps} steps · ${x.seconds}s · ${x.in}/${x.out} tok · ~$${x.usd} — “${x.text.slice(0, 80)}”${x.stopped ? ` (stopped: ${x.stopped})` : ""}`;
      return Response.json({ ok: a.ok || b.ok, message: `${fmt(a)}\n${fmt(b)}`, compare: [a, b], ms: ms() });
    }
    return Response.json({ ok: false, message: "unknown test" }, { status: 400 });
  } catch (e) { return Response.json({ ok: false, message: (e as Error).message.slice(0, 300), ms: ms() }); }
}

/** Token & cost ledger (admin only). */
export async function GET(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  return Response.json({ ...usageReport(days), routing: { director: getConfig("ROUTE_DIRECTOR"), review: getConfig("ROUTE_REVIEW"), agent: getConfig("ROUTE_AGENT") } });
}
