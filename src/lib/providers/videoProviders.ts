import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { decrypt, encrypt, mask } from "../crypto";
import { getConfig, metaOnly, META_ONLY_NOTE } from "../config";
import { aspectSize, type Aspect } from "../types";
import { mockVideo, veoVideo, type VideoRequest } from "./video";

/**
 * Pluggable multi-provider video generation (Admin → Video providers).
 * The provider list is stored as JSON (no secrets); each provider's API key is stored separately, AES-256-GCM encrypted,
 * and never sent to the browser. Array order = fallback order.
 */
export type VideoType = "openai" | "ltx" | "ltx-comfy" | "minimax" | "veo" | "fal" | "replicate" | "mock";
export interface VideoProviderCfg {
  id: string; name: string; type: VideoType; enabled: boolean;
  baseUrl: string; model: string; maxDuration: number; aspects: Aspect[];
  firstLast: boolean; i2v: boolean; costPerSec?: number;
  /** generic OpenAI-compatible: JSON mapping of paths + field names (see DEFAULT_MAPPING) */
  mapping?: string;
  /** ComfyUI workflow (API format) with {{PROMPT}} {{IMAGE}} {{END_IMAGE}} {{WIDTH}} {{HEIGHT}} {{FRAMES}} {{FPS}} {{SEED}} placeholders */
  workflow?: string;
  resolution?: string;
}
export const DEFAULT_MAPPING = {
  create: "/videos", status: "/videos/{id}", download: "/videos/{id}/content",
  encoding: "multipart", // multipart | json-dataurl | json-base64
  fields: { prompt: "prompt", model: "model", image: "input_reference", endImage: "", duration: "seconds", size: "size", aspect: "" },
  durationAsString: true, idPath: "id", statusPath: "status", progressPath: "progress",
  done: ["completed", "succeeded", "success"], failed: ["failed", "error", "cancelled"], urlPath: "", errorPath: "error.message",
};
export const PRESETS: Record<Exclude<VideoType, "mock">, Partial<VideoProviderCfg>> = {
  openai: { name: "OpenAI-compatible video", baseUrl: "https://api.openai.com/v1", model: "sora-2", maxDuration: 12, aspects: ["16:9", "9:16"], firstLast: false, i2v: true, mapping: JSON.stringify(DEFAULT_MAPPING, null, 2) },
  ltx: { name: "LTX-Video 2.x (API server)", baseUrl: "https://api.ltx.io", model: "ltx-2-3-fast", maxDuration: 10, aspects: ["16:9", "9:16"], firstLast: true, i2v: true, resolution: "1920x1080", costPerSec: 0.04 },
  "ltx-comfy": { name: "LTX-Video via ComfyUI (self-hosted GPU)", baseUrl: "http://YOUR-POD:8188", model: "ltx-2", maxDuration: 10, aspects: ["16:9", "9:16", "1:1", "4:5"], firstLast: true, i2v: true, costPerSec: 0 },
  minimax: { name: "MiniMax Hailuo", baseUrl: "https://api.minimax.io/v1", model: "MiniMax-Hailuo-02", maxDuration: 10, aspects: ["16:9", "9:16", "1:1"], firstLast: true, i2v: true, resolution: "768P", costPerSec: 0.045 },
  veo: { name: "Google Veo 3.1", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "veo-3.1-generate-preview", maxDuration: 8, aspects: ["16:9", "9:16"], firstLast: true, i2v: true, costPerSec: 0.4 },
  fal: { name: "fal.ai (queue API)", baseUrl: "https://queue.fal.run", model: "fal-ai/kling-video/v2.1/pro/image-to-video", maxDuration: 10, aspects: ["16:9", "9:16", "1:1"], firstLast: true, i2v: true },
  replicate: { name: "Replicate", baseUrl: "https://api.replicate.com/v1", model: "minimax/hailuo-02", maxDuration: 10, aspects: ["16:9", "9:16", "1:1"], firstLast: true, i2v: true },
};
const DEMO: VideoProviderCfg = { id: "demo", name: "Motion over Muse Image stills (local FFmpeg)", type: "mock", enabled: true, baseUrl: "", model: "ffmpeg", maxDuration: 10, aspects: ["16:9", "9:16", "1:1", "4:5"], firstLast: true, i2v: true, costPerSec: 0 };

export function listProviders(): VideoProviderCfg[] {
  const raw = db.getSetting("VIDEO_PROVIDERS");
  let list: VideoProviderCfg[] = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
  // migrate the legacy single Veo setting
  if (!raw && getConfig("GEMINI_API_KEY")) list.push({ ...(PRESETS.veo as VideoProviderCfg), id: "veo", type: "veo", enabled: getConfig("VIDEO_PROVIDER") === "veo", model: getConfig("VEO_MODEL") || "veo-3.1-generate-preview" });
  if (!list.some((p) => p.type === "mock")) list.push(DEMO);
  return list;
}
export const providerKey = (id: string) => { const r = db.getSetting("VIDEO_KEY_" + id); try { return r ? decrypt(r) : id === "veo" ? getConfig("GEMINI_API_KEY") : undefined; } catch { return undefined; } };
export async function saveProviders(list: VideoProviderCfg[], keys: Record<string, string | null>) {
  const clean = list.map((p) => ({ ...p, id: (p.id || p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "video", maxDuration: Number(p.maxDuration) || 5, costPerSec: p.costPerSec === undefined || (p.costPerSec as unknown) === "" ? undefined : Number(p.costPerSec) }));
  if (new Set(clean.map((p) => p.id)).size !== clean.length) throw new Error("Provider ids must be unique");
  for (const p of clean) if (p.type === "openai" && p.mapping) JSON.parse(p.mapping);
  for (const p of clean) if (p.type === "ltx-comfy" && p.workflow) JSON.parse(p.workflow);
  await db.setSetting("VIDEO_PROVIDERS", JSON.stringify(clean));
  for (const [id, v] of Object.entries(keys)) {
    if (v === null) await db.setSetting("VIDEO_KEY_" + id, undefined);
    else if (v && !v.includes("•")) await db.setSetting("VIDEO_KEY_" + id, encrypt(v));
  }
}
/** Admin view: keys masked. Public view (projects): no key info beyond "has key". */
export const adminView = () => listProviders().map((p) => ({ ...p, key: providerKey(p.id) ? mask(providerKey(p.id)!) : "", blocked: metaOnly() && p.type !== "mock" ? META_ONLY_NOTE : undefined }));
export const publicView = () => listProviders().filter((p) => p.enabled && (p.type === "mock" || !metaOnly())).map(({ id, name, type, model, maxDuration, aspects, firstLast, i2v, costPerSec }) => ({ id, name, type, model, maxDuration, aspects, firstLast, i2v, costPerSec, ready: type === "mock" || !!providerKey(id) || type === "ltx-comfy" }));

/** Ordered list to try for a project: its chosen provider first, then the rest in Admin order; demo motion last. */
export function chain(choice?: string) {
  // hackathon rules: no third-party video models — Ken Burns / parallax / crossfade motion over Muse Image stills only
  const all = listProviders().filter((p) => p.enabled && (p.type === "mock" || (!metaOnly() && (p.type === "ltx-comfy" || providerKey(p.id)))));
  const first = all.filter((p) => p.id === choice);
  const rest = all.filter((p) => p.id !== choice && p.type !== "mock");
  return [...first, ...rest, ...all.filter((p) => p.type === "mock" && p.id !== choice)];
}
export function estimate(p: VideoProviderCfg, seconds: number) { const d = Math.min(seconds, p.maxDuration); return { seconds: d, usd: p.costPerSec !== undefined ? +(d * p.costPerSec).toFixed(3) : undefined }; }

// ---------- adapters ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mime = (f: string) => (/\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg");
const dataUrl = (f: string) => `data:${mime(f)};base64,${fs.readFileSync(f).toString("base64")}`;
const get = (o: unknown, p: string): unknown => (p ? p.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o) : undefined);
const join = (b: string, p: string) => b.replace(/\/+$/, "") + (p.startsWith("/") ? p : "/" + p);
async function download(url: string, out: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  if (fs.statSync(out).size < 1000) throw new Error("downloaded file is empty");
}
async function json(r: Response, what: string) {
  const t = await r.text();
  if (!r.ok) throw new Error(`${what} HTTP ${r.status}: ${t.replace(/(sk|key)-[\w-]+/gi, "•••").slice(0, 240)}`);
  try { return JSON.parse(t); } catch { throw new Error(`${what}: not JSON`); }
}
const sizeFor = (a: Aspect, long = 1280) => { const { w, h } = aspectSize(a, long); return `${w}x${h}`; };
type Progress = (pct: number, msg?: string) => void;
const POLL_MAX = 90; // × interval

async function genericOpenAI(c: VideoProviderCfg, key: string, r: VideoRequest, on: Progress) {
  const m = { ...DEFAULT_MAPPING, ...(c.mapping ? JSON.parse(c.mapping) : {}) }; const f = { ...DEFAULT_MAPPING.fields, ...(m.fields || {}) };
  const H = { Authorization: `Bearer ${key}` };
  const dur = m.durationAsString ? String(r.durationSec) : r.durationSec;
  let res: Response;
  if (m.encoding === "multipart") {
    const fd = new FormData();
    if (f.prompt) fd.set(f.prompt, r.prompt); if (f.model) fd.set(f.model, c.model); if (f.duration) fd.set(f.duration, String(dur));
    if (f.size) fd.set(f.size, sizeFor(r.aspect)); if (f.aspect) fd.set(f.aspect, r.aspect);
    if (f.image && r.startFrame) fd.set(f.image, new Blob([fs.readFileSync(r.startFrame)], { type: mime(r.startFrame) }), path.basename(r.startFrame));
    if (f.endImage && r.endFrame) fd.set(f.endImage, new Blob([fs.readFileSync(r.endFrame)], { type: mime(r.endFrame) }), path.basename(r.endFrame));
    res = await fetch(join(c.baseUrl, m.create), { method: "POST", headers: H, body: fd });
  } else {
    const enc = (x: string) => (m.encoding === "json-base64" ? fs.readFileSync(x).toString("base64") : dataUrl(x));
    const body: Record<string, unknown> = {};
    if (f.prompt) body[f.prompt] = r.prompt; if (f.model) body[f.model] = c.model; if (f.duration) body[f.duration] = dur;
    if (f.size) body[f.size] = sizeFor(r.aspect); if (f.aspect) body[f.aspect] = r.aspect;
    if (f.image && r.startFrame) body[f.image] = enc(r.startFrame); if (f.endImage && r.endFrame) body[f.endImage] = enc(r.endFrame);
    res = await fetch(join(c.baseUrl, m.create), { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  const job = await json(res, "create");
  const id = String(get(job, m.idPath) ?? "");
  if (!id) throw new Error("create returned no job id");
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(i < 3 ? 3000 : 8000);
    const st = await json(await fetch(join(c.baseUrl, m.status.replace("{id}", id)), { headers: H }), "status");
    const s = String(get(st, m.statusPath) ?? "").toLowerCase();
    const pr = Number(get(st, m.progressPath)); if (pr) on(Math.min(95, pr));
    if (m.failed.includes(s)) throw new Error(String(get(st, m.errorPath) || "job failed"));
    if (m.done.includes(s)) {
      const u = m.urlPath ? String(get(st, m.urlPath) || "") : "";
      return download(u || join(c.baseUrl, m.download.replace("{id}", id)), r.outFile, u ? {} : H);
    }
  }
  throw new Error("timed out");
}

async function ltxApi(c: VideoProviderCfg, key: string, r: VideoRequest, on: Progress) {
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const body: Record<string, unknown> = { image_uri: dataUrl(r.startFrame), prompt: r.prompt, model: c.model, duration: Math.round(r.durationSec), resolution: c.resolution || (r.aspect === "9:16" ? "1080x1920" : "1920x1080"), generate_audio: false };
  if (r.endFrame && c.firstLast) body.last_frame_uri = dataUrl(r.endFrame);
  const base = c.baseUrl.replace(/\/+$/, "").replace(/\/v[12]$/, "");
  const res = await fetch(base + "/v2/image-to-video", { method: "POST", headers: H, body: JSON.stringify(body) });
  if ((res.headers.get("content-type") || "").startsWith("video/")) { fs.writeFileSync(r.outFile, Buffer.from(await res.arrayBuffer())); return; } // v1-style sync servers
  if (res.status === 404) { // self-hosted server exposing only the v1 synchronous route
    const v1 = await fetch(base + "/v1/image-to-video", { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) });
    if (!v1.ok) throw new Error(`LTX v1 HTTP ${v1.status}: ${(await v1.text()).slice(0, 200)}`);
    fs.writeFileSync(r.outFile, Buffer.from(await v1.arrayBuffer())); return;
  }
  const job = await json(res, "LTX submit");
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(5000); on(Math.min(90, 10 + i * 4));
    const st = await json(await fetch(`${base}/v2/image-to-video/${job.id}`, { headers: H }), "LTX status");
    if (st.status === "failed") throw new Error(st.error?.message || "LTX job failed");
    if (st.status === "completed") return download(st.result?.video_url, r.outFile);
  }
  throw new Error("LTX timed out");
}

/** Default ComfyUI graph for LTX-Video image→video (first + optional last frame). Override in Admin with your own exported API workflow. */
export const LTX_COMFY_WORKFLOW = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ltxv-2b-0.9.8-distilled.safetensors" } },
  "2": { class_type: "CLIPLoader", inputs: { clip_name: "t5xxl_fp16.safetensors", type: "ltxv" } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "{{PROMPT}}", clip: ["2", 0] } },
  "4": { class_type: "CLIPTextEncode", inputs: { text: "blurry, distorted face, warped text, flicker, low quality", clip: ["2", 0] } },
  "5": { class_type: "LoadImage", inputs: { image: "{{IMAGE}}" } },
  "6": { class_type: "LTXVImgToVideo", inputs: { positive: ["3", 0], negative: ["4", 0], vae: ["1", 2], image: ["5", 0], width: "{{WIDTH}}", height: "{{HEIGHT}}", length: "{{FRAMES}}", batch_size: 1, strength: 1 } },
  "7": { class_type: "LTXVConditioning", inputs: { positive: ["6", 0], negative: ["6", 1], frame_rate: "{{FPS}}" } },
  "8": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
  "9": { class_type: "LTXVScheduler", inputs: { steps: 20, max_shift: 2.05, base_shift: 0.95, stretch: true, terminal: 0.1, latent: ["6", 2] } },
  "10": { class_type: "SamplerCustom", inputs: { model: ["1", 0], add_noise: true, noise_seed: "{{SEED}}", cfg: 3, positive: ["7", 0], negative: ["7", 1], sampler: ["8", 0], sigmas: ["9", 0], latent_image: ["6", 2] } },
  "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["1", 2] } },
  "12": { class_type: "VHS_VideoCombine", inputs: { images: ["11", 0], frame_rate: "{{FPS}}", loop_count: 0, filename_prefix: "reelforge", format: "video/h264-mp4", pingpong: false, save_output: true } },
};
async function ltxComfy(c: VideoProviderCfg, key: string | undefined, r: VideoRequest, on: Progress) {
  const base = c.baseUrl.replace(/\/+$/, ""); const H: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
  const up = async (f: string) => { const fd = new FormData(); fd.set("image", new Blob([fs.readFileSync(f)], { type: mime(f) }), `rf-${Date.now()}-${path.basename(f)}`); fd.set("overwrite", "true"); const j = await json(await fetch(base + "/upload/image", { method: "POST", headers: H, body: fd }), "ComfyUI upload"); return j.name as string; };
  const img = await up(r.startFrame); const end = r.endFrame ? await up(r.endFrame) : "";
  const { w, h } = aspectSize(r.aspect, 768); const fps = 24; const frames = Math.round((Math.min(r.durationSec, c.maxDuration) * fps) / 8) * 8 + 1;
  const vars: Record<string, string | number> = { PROMPT: r.prompt.replace(/"/g, "'"), IMAGE: img, END_IMAGE: end || img, WIDTH: Math.round(w / 32) * 32, HEIGHT: Math.round(h / 32) * 32, FRAMES: frames, FPS: fps, SEED: Math.floor(Math.random() * 1e9) };
  let wf = c.workflow || JSON.stringify(LTX_COMFY_WORKFLOW);
  for (const [k, v] of Object.entries(vars)) wf = wf.replace(new RegExp(`"\\{\\{${k}\\}\\}"`, "g"), typeof v === "number" ? String(v) : JSON.stringify(v)).replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v).replace(/"/g, "'"));
  const job = await json(await fetch(base + "/prompt", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: JSON.parse(wf), client_id: "reelforge" }) }), "ComfyUI prompt");
  for (let i = 0; i < POLL_MAX * 2; i++) {
    await sleep(4000); on(Math.min(90, 5 + i * 2));
    const hist = await json(await fetch(`${base}/history/${job.prompt_id}`, { headers: H }), "ComfyUI history");
    const entry = hist[job.prompt_id]; if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error("ComfyUI workflow error");
    for (const o of Object.values(entry.outputs || {}) as Record<string, { filename: string; subfolder: string; type: string }[]>[]) {
      const file = (o.gifs || o.videos || o.images || []).find((x) => /\.(mp4|webm|mov)$/i.test(x.filename));
      if (file) return download(`${base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder || "")}&type=${file.type || "output"}`, r.outFile, H);
    }
  }
  throw new Error("ComfyUI timed out");
}

async function minimax(c: VideoProviderCfg, key: string, r: VideoRequest, on: Progress) {
  const base = c.baseUrl.replace(/\/+$/, ""); const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const body: Record<string, unknown> = { model: c.model, prompt: r.prompt, first_frame_image: dataUrl(r.startFrame), duration: r.durationSec > 6 && c.maxDuration >= 10 ? 10 : 6, resolution: c.resolution || "768P" };
  if (r.endFrame && c.firstLast) body.last_frame_image = dataUrl(r.endFrame);
  const job = await json(await fetch(base + "/video_generation", { method: "POST", headers: H, body: JSON.stringify(body) }), "MiniMax create");
  if (job.base_resp?.status_code) throw new Error(`MiniMax: ${job.base_resp.status_msg}`);
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(10000); on(Math.min(90, 10 + i * 5));
    const st = await json(await fetch(`${base}/query/video_generation?task_id=${job.task_id}`, { headers: H }), "MiniMax query");
    if (st.status === "Fail") throw new Error("MiniMax task failed");
    if (st.status === "Success") {
      const f = await json(await fetch(`${base}/files/retrieve?file_id=${st.file_id}`, { headers: H }), "MiniMax file");
      return download(f.file?.download_url, r.outFile);
    }
  }
  throw new Error("MiniMax timed out");
}

async function fal(c: VideoProviderCfg, key: string, r: VideoRequest, on: Progress) {
  const H = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const input: Record<string, unknown> = { prompt: r.prompt, image_url: dataUrl(r.startFrame), duration: String(r.durationSec > 5 ? Math.min(10, c.maxDuration) : 5), aspect_ratio: r.aspect };
  if (r.endFrame && c.firstLast) input.tail_image_url = input.end_image_url = dataUrl(r.endFrame);
  const job = await json(await fetch(join(c.baseUrl, c.model), { method: "POST", headers: H, body: JSON.stringify(input) }), "fal submit");
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(5000); on(Math.min(90, 10 + i * 4));
    const st = await json(await fetch(job.status_url, { headers: H }), "fal status");
    if (st.status === "COMPLETED") { const out = await json(await fetch(job.response_url, { headers: H }), "fal result"); return download(out.video?.url || out.videos?.[0]?.url, r.outFile); }
    if (st.status === "FAILED" || st.error) throw new Error("fal job failed");
  }
  throw new Error("fal timed out");
}

async function replicate(c: VideoProviderCfg, key: string, r: VideoRequest, on: Progress) {
  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const input: Record<string, unknown> = { prompt: r.prompt, first_frame_image: dataUrl(r.startFrame), image: dataUrl(r.startFrame), duration: r.durationSec > 6 ? 10 : 6 };
  if (r.endFrame && c.firstLast) input.last_frame_image = dataUrl(r.endFrame);
  const url = c.model.includes(":") ? join(c.baseUrl, "/predictions") : join(c.baseUrl, `/models/${c.model}/predictions`);
  let st = await json(await fetch(url, { method: "POST", headers: H, body: JSON.stringify(c.model.includes(":") ? { version: c.model.split(":")[1], input } : { input }) }), "Replicate create");
  for (let i = 0; i < POLL_MAX && !["succeeded", "failed", "canceled"].includes(st.status); i++) { await sleep(5000); on(Math.min(90, 10 + i * 3)); st = await json(await fetch(st.urls.get, { headers: H }), "Replicate status"); }
  if (st.status !== "succeeded") throw new Error(`Replicate ${st.status}: ${String(st.error || "").slice(0, 160)}`);
  return download(Array.isArray(st.output) ? st.output[0] : st.output, r.outFile);
}

export async function runProvider(c: VideoProviderCfg, r: VideoRequest, on: Progress = () => {}) {
  if (metaOnly() && c.type !== "mock") throw new Error(`${c.name}: ${META_ONLY_NOTE}`);
  const req = { ...r, durationSec: Math.max(1, Math.min(r.durationSec, c.maxDuration)), endFrame: c.firstLast ? r.endFrame : undefined };
  const key = providerKey(c.id);
  if (c.type !== "mock" && c.type !== "ltx-comfy" && !key) throw new Error(`${c.name}: no API key saved`);
  switch (c.type) {
    case "mock": {
      // HyperFrames first (local, cached by spec hash), FFmpeg motion as the fallback
      if (r.projectId && r.shotId) { try { const { animateShot } = await import("../motion"); const { db } = await import("../db"); const { findShot } = await import("../studio"); const p = db.getProject(r.projectId); if (p) { await animateShot(p, findShot(p, r.shotId), r.durationSec, r.outFile); return; } } catch { /* fall back */ } }
      return mockVideo.generate(req);
    }
    case "veo": return veoVideo.generate(req, { key: key!, model: c.model, base: c.baseUrl });
    case "openai": return genericOpenAI(c, key!, req, on);
    case "ltx": return ltxApi(c, key!, req, on);
    case "ltx-comfy": return ltxComfy(c, key, req, on);
    case "minimax": return minimax(c, key!, req, on);
    case "fal": return fal(c, key!, req, on);
    case "replicate": return replicate(c, key!, req, on);
  }
}
