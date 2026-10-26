import { spawn } from "node:child_process";
import fs from "node:fs";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FONT = process.env.FONT_FILE || ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f)) || "";

export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error("ffmpeg failed: " + err.slice(-800)))));
  });
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(parseFloat(out) || 0));
    p.on("error", () => resolve(0));
  });
}

/** Escape text for drawtext inside a filtergraph. */
export function dt(s: string) {
  return s.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/,/g, "\\,");
}
export function wrap(s: string, n: number, maxLines = 6) {
  const words = s.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
  return lines;
}
