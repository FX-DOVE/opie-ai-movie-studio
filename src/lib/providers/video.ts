import fs from "node:fs";
import { getConfig, metaOnly } from "../config";
import { ffmpeg } from "../ffmpeg";
import { aspectSize, type Aspect } from "../types";

/** First-frame → last-frame video generation. Providers are plug-ins selected in Admin. */
export interface VideoRequest { startFrame: string; endFrame?: string; prompt: string; aspect: Aspect; durationSec: number; outFile: string; projectId?: string; shotId?: string }
export interface VideoProvider { id: string; label: string; generate(r: VideoRequest, o?: { key: string; model?: string; base?: string }): Promise<void> }

/** Demo provider: a local motion clip (push-in on the start frame, crossfade into the end frame). */
export const mockVideo: VideoProvider = {
  id: "mock",
  label: "Demo motion (local FFmpeg)",
  async generate(r) {
    const { w, h } = aspectSize(r.aspect, 1280);
    const d = Math.max(2, Math.min(10, r.durationSec));
    const fps = 25, n = Math.round(d * fps);
    const zp = (i: string) => `[${i}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='min(1+0.0015*on,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${w}x${h}:fps=${fps},setsar=1`;
    if (r.endFrame && fs.existsSync(r.endFrame)) {
      const fade = Math.min(1.2, d / 3);
      await ffmpeg(["-i", r.startFrame, "-i", r.endFrame, "-filter_complex", `${zp("0")}[a];${zp("1")}[b];[a][b]xfade=transition=fade:duration=${fade}:offset=${(d - fade).toFixed(2)},trim=duration=${d},format=yuv420p[v]`, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", r.outFile]);
    } else {
      await ffmpeg(["-i", r.startFrame, "-filter_complex", `${zp("0")},format=yuv420p[v]`, "-map", "[v]", "-t", String(d), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", r.outFile]);
    }
  },
};

/** Google Veo 3.1 via the Gemini API (image + lastFrame interpolation). Unconfigured until a key is added. */
export const veoVideo: VideoProvider = {
  id: "veo",
  label: "Google Veo 3.1 (first + last frame)",
  async generate(r, o) {
    const key = o?.key || getConfig("GEMINI_API_KEY");
    if (!key) throw new Error("Veo is not configured");
    const model = o?.model || getConfig("VEO_MODEL") || "veo-3.1-generate-preview";
    const b64 = (f: string) => fs.readFileSync(f).toString("base64");
    const instance: Record<string, unknown> = { prompt: r.prompt, image: { bytesBase64Encoded: b64(r.startFrame), mimeType: "image/png" } };
    if (r.endFrame) instance.lastFrame = { bytesBase64Encoded: b64(r.endFrame), mimeType: "image/png" };
    const base = (o?.base || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const start = await fetch(`${base}/models/${model}:predictLongRunning`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [instance], parameters: { aspectRatio: r.aspect === "9:16" ? "9:16" : "16:9", durationSeconds: r.durationSec >= 7 ? 8 : r.durationSec >= 5 ? 6 : 4 } }),
    });
    if (!start.ok) throw new Error("Veo start " + start.status + " " + (await start.text()).slice(0, 300));
    const op = await start.json();
    for (let i = 0; i < 60; i++) {
      await new Promise((s) => setTimeout(s, 10000));
      const st = await (await fetch(`${base}/${op.name}`, { headers: { "x-goog-api-key": key } })).json();
      if (st.done) {
        const uri = st.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) throw new Error("Veo returned no video");
        const v = await fetch(uri, { headers: { "x-goog-api-key": key } });
        fs.writeFileSync(r.outFile, Buffer.from(await v.arrayBuffer()));
        return;
      }
    }
    throw new Error("Veo timed out");
  },
};

export const VIDEO_PROVIDERS = [mockVideo, veoVideo];
export function videoProvider(): VideoProvider {
  return !metaOnly() && getConfig("VIDEO_PROVIDER") === "veo" && getConfig("GEMINI_API_KEY") ? veoVideo : mockVideo;
}
