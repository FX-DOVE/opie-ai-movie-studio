/**
 * Shot animator. Primary: HyperFrames (Apache-2.0, local headless Chrome + GSAP, in the `hf` sidecar) rendering a
 * template from a fixed library; Muse Spark only fills a schema-validated JSON spec (never code). Fallback: FFmpeg motion.
 * Never uses HyperFrames transcribe/init --video (non-Meta Whisper) or any HeyGen cloud/voice/publish feature.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, mediaPath, projectMediaDir } from "./db";
import { getConfig } from "./config";
import { structured } from "./providers/meta";
import { findShot } from "./studio";
import { aspectSize, type Project, type Shot } from "./types";

export const TEMPLATES = {
  push_in: "slow push-in with a gentle drift (calm, establishing, dialogue)",
  parallax: "2.5D parallax: blurred background layer + sharp centre foreground moving at different speeds (depth, reveals)",
  action_shake: "fast punch-in with camera shake and an impact flash (hits, explosions, chases)",
  whip_pan: "quick lateral whip into a settle (comedy beats, surprise, transitions)",
  dreamy: "floating drift with soft bloom and a warm light leak (romance, memory, wonder)",
  title_card: "title text reveal over a slow drift (openings, chapter cards)",
} as const;
export type Template = keyof typeof TEMPLATES;
const PARTICLES = ["none", "dust", "embers", "rain", "snow", "sparks", "petals"] as const;
const GRADES = ["neutral", "warm", "cool", "teal_orange", "neon", "golden", "bleach"] as const;
export interface MotionSpec { template: Template; zoom: number; panX: number; panY: number; intensity: number; particles: (typeof PARTICLES)[number]; grade: (typeof GRADES)[number]; leak: boolean; letterbox: boolean; title?: string }

/** Per-genre slots: which templates are allowed and the default look. */
export const GENRE_SLOTS: Record<string, { templates: Template[]; grade: MotionSpec["grade"]; particles: MotionSpec["particles"]; letterbox: boolean }> = {
  blockbuster: { templates: ["push_in", "parallax", "action_shake", "title_card"], grade: "teal_orange", particles: "sparks", letterbox: true },
  martial_comedy: { templates: ["whip_pan", "action_shake", "push_in", "title_card"], grade: "warm", particles: "dust", letterbox: false },
  commando: { templates: ["action_shake", "push_in", "parallax"], grade: "bleach", particles: "embers", letterbox: true },
  war_epic: { templates: ["parallax", "push_in", "action_shake", "title_card"], grade: "bleach", particles: "embers", letterbox: true },
  kdrama_romcom: { templates: ["dreamy", "push_in", "whip_pan", "title_card"], grade: "golden", particles: "petals", letterbox: false },
  epic_fantasy: { templates: ["parallax", "dreamy", "push_in", "title_card"], grade: "teal_orange", particles: "dust", letterbox: true },
  prison_break: { templates: ["push_in", "action_shake", "parallax"], grade: "cool", particles: "none", letterbox: true },
  nollywood: { templates: ["push_in", "parallax", "dreamy", "title_card"], grade: "warm", particles: "dust", letterbox: false },
  default: { templates: Object.keys(TEMPLATES) as Template[], grade: "neutral", particles: "none", letterbox: false },
};
const slots = (p: Project) => GENRE_SLOTS[p.filmStyle || ""] || GENRE_SLOTS.default;
const clamp = (v: unknown, a: number, b: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

/** Strict validation: unknown keys dropped, enums enforced, numbers clamped. */
export function validateSpec(raw: unknown, p: Project): MotionSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>; const s = slots(p);
  const template = s.templates.includes(r.template as Template) ? (r.template as Template) : s.templates[0];
  return {
    template, zoom: clamp(r.zoom, 1, 1.35, 1.12), panX: clamp(r.panX, -1, 1, 0), panY: clamp(r.panY, -1, 1, 0), intensity: clamp(r.intensity, 0, 1, 0.5),
    particles: PARTICLES.includes(r.particles as never) ? (r.particles as MotionSpec["particles"]) : s.particles,
    grade: GRADES.includes(r.grade as never) ? (r.grade as MotionSpec["grade"]) : s.grade,
    leak: typeof r.leak === "boolean" ? r.leak : template === "dreamy", letterbox: typeof r.letterbox === "boolean" ? r.letterbox : s.letterbox,
    title: template === "title_card" && typeof r.title === "string" ? r.title.replace(/[<>&"]/g, "").slice(0, 40) : undefined,
  };
}
function defaultSpec(p: Project, sh: Shot, i: number): MotionSpec {
  const s = slots(p); const b = (sh.beat || "").toLowerCase();
  const t: Template = i === 0 && s.templates.includes("title_card") ? "title_card" : /action|impact|fight|chase|climax/.test(b) && s.templates.includes("action_shake") ? "action_shake" : /comedy|gag|reveal/.test(b) && s.templates.includes("whip_pan") ? "whip_pan" : s.templates[i % 2 ? 1 : 0] || "push_in";
  return validateSpec({ template: t, panX: i % 2 ? 0.5 : -0.5, title: p.title }, p);
}

/** compose_scene: Muse Spark picks a template + slot values for each shot as JSON only. One LLM call per project (credit-efficient). */
export async function composeScenes(p: Project, shotIds?: string[], note = "") {
  const all = p.scenes.flatMap((s) => s.shots); const list = all.filter((s) => !shotIds?.length || shotIds.includes(s.id));
  const s = slots(p);
  const { data, source } = await structured<{ shots: Record<string, unknown>[] }>(
    `You are a motion designer. For each shot choose ONE template from this fixed library and fill its slots. Output JSON only: {"shots":[{"n":1,"template":"...","zoom":1.0-1.35,"panX":-1..1,"panY":-1..1,"intensity":0..1,"particles":"${PARTICLES.join("|")}","grade":"${GRADES.join("|")}","leak":bool,"letterbox":bool,"title":"only for title_card"}]}. Allowed templates for this film style: ${s.templates.map((t) => `${t} = ${TEMPLATES[t]}`).join("; ")}. Never write code, HTML or CSS.${note ? ` Director note: ${note}` : ""}`,
    `Film: ${p.title} (${p.filmStyle || "general"})\n` + list.map((sh) => `${all.indexOf(sh) + 1}. [${sh.beat || ""}] ${sh.camera}. ${sh.description}`).join("\n"),
    () => ({ shots: list.map((sh) => ({ ...defaultSpec(p, sh, all.indexOf(sh)), n: all.indexOf(sh) + 1 })) }), undefined, "director",
  ).catch(() => ({ data: { shots: [] as Record<string, unknown>[] }, source: "default" }));
  const byN = new Map((data.shots || []).map((x) => [Number(x.n), x]));
  await db.update(p.id, (x) => { for (const sh of list) { const t = findShot(x, sh.id); const i = all.indexOf(sh); t.motionSpec = byN.has(i + 1) ? validateSpec(byN.get(i + 1), p) : defaultSpec(p, sh, i); } });
  return { source, count: list.length };
}

const GRADE_CSS: Record<MotionSpec["grade"], string> = { neutral: "contrast(1.04)", warm: "sepia(.18) saturate(1.15) contrast(1.05)", cool: "hue-rotate(-8deg) saturate(.9) contrast(1.08)", teal_orange: "saturate(1.2) contrast(1.1)", neon: "saturate(1.45) contrast(1.12)", golden: "sepia(.25) saturate(1.2) brightness(1.04)", bleach: "saturate(.55) contrast(1.18)" };
const PCOLOR: Record<string, string> = { dust: "#ffe7c2", embers: "#ff8a3d", rain: "#cfe6ff", snow: "#ffffff", sparks: "#ffd36b", petals: "#ffb7d0" };

/** Builds the composition HTML from a validated spec (all values are numbers/enums; no model text reaches the markup except a sanitised title). */
export function buildHtml(spec: MotionSpec, o: { w: number; h: number; dur: number; img: string; end?: string }) {
  const { w, h, dur } = o; const z = spec.zoom, px = Math.round(spec.panX * w * 0.06), py = Math.round(spec.panY * h * 0.05), k = spec.intensity;
  const parts = spec.particles === "none" ? "" : Array.from({ length: 28 }, (_, i) => `<i class="p" style="left:${(i * 97) % w}px;top:${(i * 53 + (i % 3) * 211) % h}px;${spec.particles === "rain" ? "width:2px;height:18px;border-radius:1px" : ""}"></i>`).join("");
  const tl: string[] = [`tl.fromTo("#root",{opacity:0},{opacity:1,duration:.35},0).to("#root",{opacity:0,duration:.3},${Math.max(0, dur - 0.3)})`];
  switch (spec.template) {
    case "parallax": tl.push(`.fromTo("#bg",{scale:1.02,x:0,y:0},{scale:${(1 + (z - 1) * 0.5).toFixed(3)},x:${-px / 2},y:${-py / 2},duration:${dur},ease:"none"},0).fromTo("#fg",{scale:1.04,x:0,y:0},{scale:${z.toFixed(3)},x:${-px * 1.6},y:${-py * 1.6},duration:${dur},ease:"none"},0)`); break;
    case "action_shake": tl.push(`.fromTo("#fg",{scale:1.0},{scale:${(z + 0.05).toFixed(3)},duration:${Math.min(0.6, dur / 3)},ease:"power4.out"},0).to("#fg",{x:"random(-${Math.round(6 + 14 * k)},${Math.round(6 + 14 * k)})",y:"random(-${Math.round(4 + 10 * k)},${Math.round(4 + 10 * k)})",duration:.06,repeat:${Math.round(dur * 6)},yoyo:true,ease:"none"},.1).fromTo("#flash",{opacity:${(0.5 * k + 0.2).toFixed(2)}},{opacity:0,duration:.35},0.05)`); break;
    case "whip_pan": tl.push(`.fromTo("#fg",{x:${Math.round(w * 0.35) * (px >= 0 ? 1 : -1)},filter:"blur(14px)"},{x:0,filter:"blur(0px)",duration:.45,ease:"power3.out"},0).to("#fg",{scale:${z.toFixed(3)},duration:${Math.max(0.5, dur - 0.45)},ease:"sine.out"},.45)`); break;
    case "dreamy": tl.push(`.fromTo("#fg",{scale:1.03,y:0},{scale:${z.toFixed(3)},y:${-Math.abs(py) - 12},duration:${dur},ease:"sine.inOut"},0)`); break;
    case "title_card": tl.push(`.fromTo("#fg",{scale:1.02},{scale:${z.toFixed(3)},x:${-px},duration:${dur},ease:"none"},0).fromTo("#title",{opacity:0,letterSpacing:"0.7em",filter:"blur(10px)"},{opacity:1,letterSpacing:"0.25em",filter:"blur(0px)",duration:1.4,ease:"power3.out"},0.3).to("#title",{opacity:0,y:-30,duration:.6},${Math.max(1.8, dur - 1)})`); break;
    default: tl.push(`.fromTo("#fg",{scale:1.0,x:0,y:0},{scale:${z.toFixed(3)},x:${-px},y:${-py},duration:${dur},ease:"none"},0)`);
  }
  if (spec.leak) tl.push(`.fromTo("#leak",{opacity:0,x:${-Math.round(w * 0.15)}},{opacity:.9,x:${Math.round(w * 0.2)},duration:${dur},ease:"sine.inOut"},0)`);
  if (parts) tl.push(spec.particles === "rain" ? `.fromTo(".p",{y:-40},{y:${h},duration:.7,repeat:${Math.ceil(dur / 0.7)},ease:"none",stagger:.02},0)` : `.fromTo(".p",{y:0,opacity:0},{y:${spec.particles === "snow" || spec.particles === "petals" ? h * 0.35 : -h * 0.25},x:"random(-40,40)",opacity:.8,duration:${dur},ease:"none"},0)`);
  if (o.end) tl.push(`.fromTo("#end",{opacity:0},{opacity:1,duration:${Math.min(1, dur / 3).toFixed(2)}},${Math.max(0, dur - Math.min(1, dur / 3) - 0.3).toFixed(2)})`);
  const bar = Math.round(h * 0.1);
  return `<!doctype html><html><head><meta charset="UTF-8"><script src="gsap.min.js"></script><style>*{margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#000}
#root{position:relative;width:${w}px;height:${h}px;overflow:hidden;filter:${GRADE_CSS[spec.grade]}}.L{position:absolute;inset:-8%;background:url(${o.img}) center/cover;will-change:transform}
#bg{filter:blur(6px) brightness(.75)}${spec.template === "parallax" ? "#fg{-webkit-mask:radial-gradient(ellipse 48% 58% at 50% 55%,#000 62%,transparent 100%)}" : ""}#end{position:absolute;inset:0;background:url(${o.end || o.img}) center/cover;opacity:0}
#leak{position:absolute;inset:0;opacity:0;background:radial-gradient(circle at 20% 25%,rgba(255,170,90,.5),transparent 55%);mix-blend-mode:screen}#flash{position:absolute;inset:0;background:#fff;opacity:0}
.p{position:absolute;width:4px;height:4px;border-radius:50%;background:${PCOLOR[spec.particles] || "#fff"};opacity:0}#vig{position:absolute;inset:0;box-shadow:inset 0 0 ${Math.round(w * 0.16)}px #000}
.bar{position:absolute;left:0;right:0;height:${bar}px;background:#000}#title{position:absolute;width:100%;top:42%;text-align:center;color:#fff;font:700 ${Math.round(w / 18)}px Georgia,serif;letter-spacing:.25em;opacity:0}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${w}" data-height="${h}">
${spec.template === "parallax" ? '<div id="bg" class="L"></div>' : ""}<div id="fg" class="L"></div>${o.end ? '<div id="end"></div>' : ""}<div id="leak"></div>${parts}<div id="flash"></div><div id="vig"></div>
${spec.letterbox ? '<div class="bar" style="top:0"></div><div class="bar" style="bottom:0"></div>' : ""}${spec.title ? `<h1 id="title">${spec.title}</h1>` : ""}</div>
<script>const tl=gsap.timeline({paused:true});${tl.join("")};window.__timelines["main"]=tl;tl.seek(0);</script></body></html>`;
}

export const hfUrl = () => getConfig("HYPERFRAMES_URL") || "http://hf:8100";
export const motionEngine = () => (getConfig("MOTION_ENGINE") || "hyperframes").toLowerCase();
let health = { t: 0, ok: false };
export async function hfAvailable() {
  if (motionEngine() !== "hyperframes") return false;
  if (Date.now() - health.t < 60_000) return health.ok;
  const ok = await fetch(hfUrl() + "/health", { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
  health = { t: Date.now(), ok }; return ok;
}

/** animate_shot: render one shot with HyperFrames at an exact duration; cached by spec hash. Throws on failure (caller falls back to FFmpeg). */
export async function animateShot(p: Project, sh: Shot, dur: number, outFile?: string): Promise<string> {
  if (!(await hfAvailable())) throw new Error("HyperFrames renderer unavailable");
  const all = p.scenes.flatMap((s) => s.shots);
  const spec = sh.motionSpec ? validateSpec(sh.motionSpec, p) : defaultSpec(p, sh, all.indexOf(sh));
  const start = sh.startFrame.find((v) => v.id === sh.activeStart); if (!start) throw new Error("no start frame");
  const end = sh.endFrame.find((v) => v.id === sh.activeEnd);
  const img = mediaPath(start.url), endImg = end ? mediaPath(end.url) : undefined;
  const { w, h } = aspectSize(p.aspect);
  const hash = crypto.createHash("sha1").update(JSON.stringify({ spec, img, endImg, dur: +dur.toFixed(2), w, h, v: 1, s: fs.statSync(img).size })).digest("hex").slice(0, 16);
  const cacheDir = path.join(projectMediaDir(p.id), "motion"); fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, `${hash}.mp4`);
  if (!fs.existsSync(cached)) {
    const dir = path.join(cacheDir, `job-${hash}`); fs.mkdirSync(dir, { recursive: true });
    const ext = (f: string) => path.extname(f) || ".png";
    fs.copyFileSync(img, path.join(dir, "start" + ext(img))); if (endImg) fs.copyFileSync(endImg, path.join(dir, "end" + ext(endImg)));
    fs.writeFileSync(path.join(dir, "index.html"), buildHtml(spec, { w, h, dur: +dur.toFixed(2), img: "start" + ext(img), end: endImg ? "end" + ext(endImg) : undefined }));
    fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" }, media: { autoProxy: true } }));
    const tmp = path.join(dir, "out.mp4");
    const r = await fetch(hfUrl() + "/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir, out: tmp, timeoutSec: Math.round(120 + dur * 30) }), signal: AbortSignal.timeout(1000 * (300 + dur * 40)) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !fs.existsSync(tmp)) { fs.rmSync(dir, { recursive: true, force: true }); health = { t: 0, ok: false }; throw new Error("HyperFrames: " + (j.error || r.status)); }
    fs.renameSync(tmp, cached); fs.rmSync(dir, { recursive: true, force: true });
  }
  if (outFile) fs.copyFileSync(cached, outFile);
  return cached;
}
