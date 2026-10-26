import fs from "node:fs";
import path from "node:path";
import { fallbackKey, fallbackName, getConfig, llmChain } from "../config";
import { mockImage } from "./mock-image";

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

export interface LlmOpts { model?: string; json?: boolean; temperature?: number; vision?: boolean; agent?: boolean }
export interface LlmResult { text: string; provider: string; model: string }

function endpoint(which: "meta" | "fallback", o: LlmOpts) {
  if (which === "meta") return { url: base(), key: getConfig("META_API_KEY")!, name: "Meta Muse", model: o.model || (o.agent ? getConfig("META_AGENT_MODEL") : getConfig("META_TEXT_MODEL")) || "muse-spark-1.3" };
  return { url: (getConfig("FALLBACK_BASE_URL") || "https://api.x.ai/v1").replace(/\/$/, ""), key: fallbackKey()!, name: fallbackName(), model: (o.vision ? getConfig("FALLBACK_VISION_MODEL") : getConfig("FALLBACK_MODEL")) || "grok-4-fast-non-reasoning" };
}
function body(model: string, messages: Msg[], o: LlmOpts, stream = false) {
  return JSON.stringify({ model, messages, temperature: o.temperature ?? 0.7, stream, ...(o.json ? { response_format: { type: "json_object" } } : {}) });
}

/** Provider chain: Meta Muse first (when keyed), then the OpenAI-compatible fallback. Reports who answered. */
export async function chatP(messages: Msg[], o: LlmOpts = {}): Promise<LlmResult> {
  const errs: string[] = [];
  for (const w of llmChain()) {
    const e = endpoint(w, o);
    try {
      const go = (oo: LlmOpts) => fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: body(e.model, messages, oo), signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 240000) });
      let r = await go(o).catch(async (err) => { if (!/fetch failed|ECONNRE/i.test(String(err?.message) + String(err?.cause))) throw err; await new Promise((z) => setTimeout(z, 4000)); return go(o); });
      // Some OpenAI-compatible servers reject response_format/json grammars — retry once as plain text.
      if (r.status === 400 && o.json) r = await go({ ...o, json: false });
      if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return { text: String(j.choices?.[0]?.message?.content ?? ""), provider: e.name, model: e.model };
    } catch (err) { errs.push(`${e.name}: ${(err as Error).message}`); }
  }
  throw new Error(errs.length ? "All AI providers failed — " + errs.join(" | ") : "No AI provider configured");
}
export async function chat(messages: Msg[], o: LlmOpts = {}) { return (await chatP(messages, o)).text; }

/** Streaming chat through the chain. Yields text deltas; `meta` is filled with the provider that answered. */
export async function* chatStream(messages: Msg[], o: LlmOpts, meta: { provider?: string; model?: string }) {
  const errs: string[] = [];
  for (const w of llmChain()) {
    const e = endpoint(w, o);
    let started = false;
    try {
      const r = await fetch(e.url + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: body(e.model, messages, o, true), signal: AbortSignal.timeout(180000) });
      if (!r.ok || !r.body) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
      meta.provider = e.name; meta.model = e.model;
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim(); if (d === "[DONE]") return;
          try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) { started = true; yield t as string; } } catch { /* partial */ }
        }
      }
      return;
    } catch (err) { if (started) throw err; errs.push(`${e.name}: ${(err as Error).message}`); }
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
export async function structured<T>(system: string, user: string, mock: () => T, model?: string): Promise<{ data: T; source: string }> {
  if (!llmLive()) return { data: mock(), source: "mock" };
  const out = await chatP([{ role: "system", content: system + "\nRespond with valid JSON only." }, { role: "user", content: user }], { json: true, model: llmChain()[0] === "meta" ? model : undefined });
  return { data: parseJson<T>(out.text), source: out.provider };
}

const SIZES: Record<string, string> = { "9:16": "1024x1792", "16:9": "1792x1024", "1:1": "1024x1024", "4:5": "1024x1280" };

/** Muse Image: text→image, or image edit/reference-conditioned generation when refs are given. */
export async function generateImage(opts: { prompt: string; aspect: string; outFile: string; refs?: string[]; label?: string; style?: string }): Promise<"meta" | "mock"> {
  if (!metaLive()) {
    await mockImage({ ...opts });
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
    for (const f of refs) fd.append("image[]", new Blob([fs.readFileSync(f)], { type: "image/png" }), path.basename(f));
    r = await metaFetch("/images/edits", fd, true);
  } else {
    r = await metaFetch("/images/generations", { model, prompt: opts.prompt, n: 1, size: SIZES[opts.aspect] || "1024x1024", output_format: "png" });
  }
  const d = r.data?.[0];
  if (d?.b64_json) fs.writeFileSync(opts.outFile, Buffer.from(d.b64_json, "base64"));
  else if (d?.url) fs.writeFileSync(opts.outFile, Buffer.from(await (await fetch(d.url)).arrayBuffer()));
  else throw new Error("Muse Image returned no image");
  return "meta";
}

/** Muse Spark vision: compare a frame against reference sheets + production bible. */
export async function visionCheck(frame: string, refs: { name: string; file: string }[], bible: string, shotText: string) {
  const content: Part[] = [
    { type: "text", text: `You are a film continuity supervisor. Production bible:\n${bible}\n\nShot: ${shotText}\nThe FIRST image is the frame under review; the following images are reference sheets (${refs.map((r) => r.name).join(", ")}). Check face, skin tone, hair, wardrobe colours, makeup/lipstick, watches/jewellery, props and location. Return JSON {"ok":boolean,"issues":[string],"fix_prompt":string}.` },
    { type: "image_url", image_url: { url: imageToDataUrl(frame) } },
    ...refs.slice(0, 4).map((r) => ({ type: "image_url" as const, image_url: { url: imageToDataUrl(r.file) } })),
  ];
  const out = await chat([{ role: "user", content }], { json: true, temperature: 0.1, vision: true });
  return parseJson<{ ok: boolean; issues: string[]; fix_prompt?: string }>(out);
}
