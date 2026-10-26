import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config";
import { mockImage } from "./mock-image";

/** Meta Model API adapter (OpenAI-compatible). Live when META_API_KEY is configured, otherwise demo/mock mode. */
export const metaLive = () => !!getConfig("META_API_KEY");
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

export async function chat(messages: Msg[], opts: { model?: string; json?: boolean; temperature?: number } = {}) {
  const r = await metaFetch("/chat/completions", {
    model: opts.model || getConfig("META_TEXT_MODEL") || "muse-spark-1.3",
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  return String(r.choices?.[0]?.message?.content ?? "");
}

export function parseJson<T>(s: string): T {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (m ? m[1] : s).trim();
  const start = body.search(/[[{]/);
  return JSON.parse(start > 0 ? body.slice(start) : body);
}

/** Ask Muse for structured JSON; fall back to a deterministic local planner in demo mode. */
export async function structured<T>(system: string, user: string, mock: () => T, model?: string): Promise<{ data: T; source: "meta" | "mock" }> {
  if (!metaLive()) return { data: mock(), source: "mock" };
  const out = await chat([{ role: "system", content: system + "\nRespond with valid JSON only." }, { role: "user", content: user }], { json: true, model });
  return { data: parseJson<T>(out), source: "meta" };
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
  const out = await chat([{ role: "user", content }], { json: true, temperature: 0.1 });
  return parseJson<{ ok: boolean; issues: string[]; fix_prompt?: string }>(out);
}
