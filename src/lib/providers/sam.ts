/** SAM 3.1 (Meta Model API, Responses): segment every instance of a concept (e.g. "person") in a frame → boxes/masks. Used to isolate a character within a shot for the vision review; it does not by itself guarantee identity across separately generated scenes. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "../config";
import { record } from "../usage";
import { imageToDataUrl } from "./meta";

export const samOn = () => !!getConfig("META_API_KEY") && getConfig("SAM_ENABLED") === "on";
export interface Box { id: number; x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number }

export async function samBoxes(file: string, concept: string): Promise<Box[]> {
  const base = (getConfig("META_BASE_URL") || "https://api.meta.ai/v1").replace(/\/$/, "");
  const r = await fetch(base + "/responses", {
    method: "POST", headers: { Authorization: `Bearer ${getConfig("META_API_KEY")}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model: "sam-3.1", stream: true, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: concept }, { type: "input_image", image_url: imageToDataUrl(file) }] }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok || !r.body) throw new Error(`SAM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let text = "", buf = ""; const dec = new TextDecoder(); const rd = r.body.getReader();
  for (;;) {
    const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l.startsWith("data:")) continue; try { const j = JSON.parse(l.slice(5)); if (j.type === "response.output_text.delta") text += j.delta || ""; } catch { /* keep-alive */ } }
  }
  record("continuity-sam", "Meta Muse", "sam-3.1", undefined, 1);
  const out: Box[] = [];
  for (const m of text.matchAll(/(?:^|[>,])(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g))
    out.push({ id: +m[1], x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], w: +m[6], h: +m[7], c: m[8] ? +m[8] : undefined });
  return out;
}

/** Crop the largest N boxes (with a little padding) to temp PNGs for the reviewer. */
export async function cropBoxes(file: string, boxes: Box[], n = 3): Promise<string[]> {
  const run = promisify(execFile); const outs: string[] = [];
  const big = [...boxes].sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1)).slice(0, n);
  for (const [i, b] of big.entries()) {
    const px = Math.round((b.x2 - b.x1) * 0.08), py = Math.round((b.y2 - b.y1) * 0.05);
    const x = Math.max(0, b.x1 - px), y = Math.max(0, b.y1 - py), w = Math.min(b.w - x, b.x2 - b.x1 + 2 * px), h = Math.min(b.h - y, b.y2 - b.y1 + 2 * py);
    const o = path.join(os.tmpdir(), `sam-${Date.now()}-${i}.png`);
    try { await run("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-vf", `crop=${w}:${h}:${x}:${y},scale='min(512,iw)':-2`, o]); if (fs.existsSync(o)) outs.push(o); } catch { /* skip */ }
  }
  return outs;
}
