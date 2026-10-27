import fs from "node:fs";
import path from "node:path";
import { contributorOn, fallbackKey, fallbackName, getConfig, llmChain, type LlmTask, type Provider } from "../config";
import { mockImage } from "./mock-image";
import { record } from "../usage";

/** Meta Model API adapter (OpenAI-compatible). Live when META_API_KEY is configured, otherwise demo/mock mode. */
export const metaLive = () => !!getConfig("META_API_KEY");
/** Any real LLM (Meta or the OpenAI-compatible fallback) available for text/vision. */
export const llmLive = () => llmChain().length > 0;
const base = () => (getConfig("META_BASE_URL") || "https://api.meta.ai/v1").replace(/\/$/, "");

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface Msg { role: "system" | "user" | "assistant"; content: string | Part[] }

async function metaFetch(p: string, body: unknown, isForm = false) {
  const res = await fetch(base() + p, {
    method: "POST",
    headers: { Authorization: `Bearer ${getConfig("META_API_KEY")}`, ...(isForm ? {} : { "Content-Type": "application/json" }) },
    body: isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Meta API ${p} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

export function imageToDataUrl(file: string) {
  const ext = path.extname(file).slice(1).replace("jpg", "jpeg") || "png";
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

export interface LlmOpts { model?: string; json?: boolean; temperature?: number; vision?: boolean; agent?: boolean; task?: LlmTask }
const taskOf = (o: LlmOpts): LlmTask => o.task || (o.agent ? "agent" : "general");
export interface LlmResult { text: string; provider: string; model: string }

/** Per-task Meta model (cheap by default; everything switchable in Admin). */
export function metaModel(task: LlmTask, o: LlmOpts = {}) {
  if (task === "agent") return getConfig("META_AGENT_MODEL") || "muse-spark-1.3";
  if (task === "review" || o.vision) return getConfig("META_REVIEW_MODEL") || "muse-spark-1.3";
  // contributor only when explicitly opted in (Admin) and the access check passed
  if (task === "director" || task === "general") { if (contributorOn()) return "muse-spark-1.3-contributor"; const m = task === "director" ? getConfig("META_DIRECTOR_MODEL") : getConfig("META_TEXT_MODEL"); return !m || m === "auto" || m.includes("contributor") ? "muse-spark-1.3" : m; }
  return "muse-spark-1.3";
}
export function endpoint(which: Provider, o: LlmOpts) {
  if (which === "meta") return { url: base(), key: getConfig("META_API_KEY")!, name: "Meta Muse", model: o.model || metaModel(taskOf(o), o) };
  if (which === "baseten") return { url: (getConfig("BASETEN_BASE_URL") || "https://inference.baseten.co/v1").replace(/\/$/, ""), key: getConfig("BASETEN_API_KEY")!, name: "Baseten", model: getConfig("BASETEN_MODEL") || "meta-models/muse-spark-open-1026" };
  return { url: (getConfig("FALLBACK_BASE_URL") || "https://api.x.ai/v1").replace(/\/$/, ""), key: fallbackKey()!, name: fallbackName(), model: (o.vision ? getConfig("FALLBACK_VISION_MODEL") : getConfig("FALLBACK_MODEL")) || "grok-4-fast-non-reasoning" };
}
function body(model: string, messages: Msg[], o: LlmOpts, stream = false, meta = false) {
  return JSON.stringify({ model, messages, temperature: o.temperature ?? 0.7, stream, ...(stream ? { stream_options: { include_usage: true } } : {}), ...(meta ? { prompt_cache_key: `reelforge-${taskOf(o)}` } : {}), ...(o.json ? { response_format: { type: "json_object" } } : {}) });
}

/** Provider chain: Meta Muse first (when keyed), then the OpenAI-compatible fallback. Reports who answered. */
export async function chatP(messages: Msg[], o: LlmOpts = {}): Promise<LlmResult> {
  const errs: string[] = [];
  for (const w of llmChain(taskOf(o))) {
    const e = endpoint(w, o);
    try {
      const go = (oo: LlmOpts) => fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: body(e.model, messages, oo, false, w === "meta"), signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 240000) });
      let r = await go(o).catch(async (err) => { if (!/fetch failed|ECONNRE/i.test(String(err?.message) + String(err?.cause))) throw err; await new Promise((z) => setTimeout(z, 4000)); return go(o); });
      // Some OpenAI-compatible servers reject response_format/json grammars — retry once as plain text.
      if (r.status === 400 && o.json) r = await go({ ...o, json: false });
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      record(taskOf(o), e.name, e.model, j.usage);
      return { text: String(j.choices?.[0]?.message?.content ?? ""), provider: e.name, model: e.model };
    } catch (err) { errs.push(`${e.name}: ${(err as Error).message}`); console.warn(`[llm] ${taskOf(o)} → ${e.name} ${e.model} failed, trying next: ${String((err as Error).message).slice(0, 200)}`); }
  }
  throw new Error(errs.length ? "All AI providers failed — " + errs.join(" | ") : "No AI provider configured");
}
export async function chat(messages: Msg[], o: LlmOpts = {}) { return (await chatP(messages, o)).text; }

/** Streaming chat through the chain. Yields text deltas; `meta` is filled with the provider that answered. */
export async function* chatStream(messages: Msg[], o: LlmOpts, meta: { provider?: string; model?: string }) {
  const errs: string[] = [];
  for (const w of llmChain(taskOf(o))) {
    const e = endpoint(w, o);
    let started = false;
    try {
      const r = await fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: body(e.model, messages, o, true, w === "meta"), signal: AbortSignal.timeout(180000) }).then(async (x) => x.status === 400 ? fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body(e.model, messages, o, true)), stream_options: undefined }), signal: AbortSignal.timeout(180000) }) : x);
      if (!r.ok || !r.body) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
      meta.provider = e.name; meta.model = e.model;
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      // some servers (Baseten/vLLM) send cumulative usage on every chunk — keep the last one and record a single call
      let usage: unknown; let opened = true;
      try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim(); if (d === "[DONE]") return;
          try { const jd = JSON.parse(d); if (jd.usage) usage = jd.usage; const t = jd.choices?.[0]?.delta?.content; if (t) { started = true; yield t as string; } } catch { /* partial */ }
        }
      }
      return;
      } finally { if (opened) { opened = false; record(taskOf(o), e.name, e.model, usage as Parameters<typeof record>[3]); } }
    } catch (err) { if (started) throw err; errs.push(`${e.name}: ${(err as Error).message}`); console.warn(`[llm-stream] ${taskOf(o)} → ${e.name} ${e.model} failed, trying next: ${String((err as Error).message).slice(0, 200)}`); }
  }
  throw new Error(errs.length ? "All AI providers failed — " + errs.join(" | ") : "No AI provider configured");
}

export function parseJson<T>(s: string): T {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : s).trim();
  const start = body.search(/[[{]/);
  return JSON.parse(start > 0 ? body.slice(start) : body);
}

/** Ask Muse for structured JSON; fall back to a deterministic local planner in demo mode. */
export async function structured<T>(system: string, user: string, mock: () => T, model?: string, task: LlmTask = "general"): Promise<{ data: T; source: string }> {
  if (!llmLive()) return { data: mock(), source: "mock" };
  const out = await chatP([{ role: "system", content: system + "\nRespond with valid JSON only." }, { role: "user", content: user }], { json: true, task, model: llmChain(task)[0] === "meta" ? model : undefined });
  return { data: parseJson<T>(out.text), source: out.provider };
}

const SIZES: Record<string, string> = { "9:16": "1024x1792", "16:9": "1792x1024", "1:1": "1024x1024", "4:5": "1024x1280" };

/** Muse Image: text→image, or image edit/reference-conditioned generation when refs are given. */
export async function generateImage(opts: { prompt: string; aspect: string; outFile: string; refs?: string[]; label?: string; style?: string }): Promise<"meta" | "mock"> {
  if (!metaLive()) {
    await mockImage({ ...opts });
    record("image", "Demo", "placeholder (no Meta key)", undefined, 1);
    return "mock";
  }
  const model = getConfig("META_IMAGE_MODEL") || "muse-image-1.0";
  let r;
  const refs = (opts.refs || []).filter((f) => fs.existsSync(f)).slice(0, 4);
  if (refs.length) {
    const fd = new FormData();
    fd.set("model", model);
    fd.set("prompt", opts.prompt);
    fd.set("size", SIZES[opts.aspect] || "1024x1024");
    fd.set("output_format", "png");
    // Meta wants image[0], image[1], … (consecutive indices), not image[]
    refs.forEach((f, i) => fd.append(`image[${i}]`, new Blob([fs.readFileSync(f)], { type: /\.jpe?g$/i.test(f) ? "image/jpeg" : "image/png" }), path.basename(f)));
    r = await metaFetch("/images/edits", fd, true);
  } else {
    r = await metaFetch("/images/generations", { model, prompt: opts.prompt, n: 1, size: SIZES[opts.aspect] || "1024x1024", output_format: "png" });
  }
  const d = r.data?.[0];
  if (d?.b64_json) fs.writeFileSync(opts.outFile, Buffer.from(d.b64_json, "base64"));
  else if (d?.url) fs.writeFileSync(opts.outFile, Buffer.from(await (await fetch(d.url)).arrayBuffer()));
  else throw new Error("Muse Image returned no image");
  record("image", "Meta Muse", model, undefined, 1);
  return "meta";
}

/** Muse Spark vision: compare a frame against reference sheets + production bible. */
export async function visionCheck(frame: string, refs: { name: string; file: string }[], bible: string, shotText: string) {
  const content: Part[] = [
    { type: "text", text: `You are a strict film continuity supervisor. Production bible (locked specs):\n${bible}\n\nShot: ${shotText}\nThe FIRST image is the frame under review; the following images are, in order: ${refs.map((r) => r.name).join(", ")}. Compare the frame against the bible and the references, item by item: each character's face, skin tone, hair, makeup/lipstick, wardrobe colours, watches/jewellery/accessories; each PROP's object type, colours (hex), materials, markings, exact label text spelling and distinctive features; the location's set pieces and lighting; and the state carried over from the previous shot (positions, props in hand, time of day). Ignore differences in camera angle/framing that the shot description asks for. Only report real mismatches. fix_prompt must be one concise edit instruction that corrects ONLY the mismatches. Return JSON {"ok":boolean,"issues":[string],"fix_prompt":string}.` },
    { type: "image_url", image_url: { url: imageToDataUrl(frame) } },
    ...refs.slice(0, 7).map((r) => ({ type: "image_url" as const, image_url: { url: imageToDataUrl(r.file) } })),
  ];
  const out = await chat([{ role: "user", content }], { json: true, temperature: 0.1, vision: true, task: "review" });
  return parseJson<{ ok: boolean; issues: string[]; fix_prompt?: string }>(out);
}
