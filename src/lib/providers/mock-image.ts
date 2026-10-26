import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg, FONT, wrap } from "../ffmpeg";
import { aspectSize, type Aspect } from "../types";

const PALETTES: Record<string, string[]> = {
  realistic: ["0x1b1f2a", "0x5a3d2b", "0xc28b5a"],
  pixar: ["0x1d3b6e", "0x3fa7d6", "0xf6c85f"],
  cartoon: ["0xff5e5b", "0xffed66", "0x00cecb"],
  anime: ["0x2d1b4e", "0xb83b8b", "0xffb4a2"],
  custom: ["0x101820", "0x3a506b", "0x5bc0be"],
};

/** Demo-mode image: a styled storyboard card rendered locally with ffmpeg (clearly watermarked DEMO). */
export async function mockImage(o: { prompt: string; aspect: string; outFile: string; label?: string; style?: string }) {
  const { w, h } = aspectSize((o.aspect || "16:9") as Aspect, 1024);
  const pal = PALETTES[o.style || "realistic"] || PALETTES.realistic;
  const seed = [...o.prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opie-"));
  const body = path.join(tmp, "b.txt");
  const head = path.join(tmp, "h.txt");
  fs.writeFileSync(body, wrap(o.prompt, Math.max(24, Math.floor(w / 26)), 9).join("\n"));
  fs.writeFileSync(head, (o.label || "OPIE STORYBOARD").toUpperCase());
  const fs1 = Math.round(Math.min(w, h) / 30);
  const font = FONT ? `fontfile=${FONT}:` : "";
  const vf = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.25:t=fill`,
    `drawtext=${font}textfile=${head}:fontcolor=white@0.95:fontsize=${fs1 + 6}:x=(w-tw)/2:y=h*0.12`,
    `drawtext=${font}textfile=${body}:fontcolor=white@0.92:fontsize=${fs1}:line_spacing=${Math.round(fs1 / 2)}:x=(w-tw)/2:y=(h-th)/2`,
    `drawtext=${font}text='DEMO FRAME · ReelForge Studio':fontcolor=white@0.6:fontsize=${Math.round(fs1 * 0.7)}:x=(w-tw)/2:y=h*0.9`,
  ].join(",");
  await ffmpeg(["-f", "lavfi", "-i", `gradients=s=${w}x${h}:c0=${pal[0]}:c1=${pal[1]}:c2=${pal[2]}:n=3:seed=${seed % 100000}:speed=0`, "-frames:v", "1", "-vf", vf, o.outFile]);
  fs.rmSync(tmp, { recursive: true, force: true });
}
