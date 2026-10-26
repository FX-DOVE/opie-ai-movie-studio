import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, mediaPath, mediaUrl, projectMediaDir } from "./db";
import { generateImage, llmLive, structured, visionCheck } from "./providers/meta";
import { llmLabel } from "./config";
import { parseScenes, NARRATOR_RE } from "./screenplay";
import { getConfig } from "./config";
import { EDGE_VOICES } from "./providers/tts";
import { FORMATS, MODES, STYLES, type Asset, type ChatMsg, type ImageVersion, type Project, type Scene, type Shot } from "./types";

const now = () => new Date().toISOString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function styleText(p: Project) {
  return p.style === "custom" ? p.customStyle || "cinematic" : STYLES[p.style];
}
function ctx(p: Project) {
  return `Mode: ${MODES[p.mode]}. Format: ${FORMATS[p.format].label} (${p.aspect}, max ${FORMATS[p.format].maxSec}s). Visual style: ${styleText(p)}.`;
}

// ───────────────────────── Script ─────────────────────────
function mockScript(p: Project, instruction: string) {
  const idea = (instruction || p.idea || "an unexpected second chance").trim();
  const title = p.title && p.title !== "Untitled project" ? p.title : cap(idea.split(/\s+/).slice(0, 5).join(" "));
  if (p.mode === "documentary") return `TITLE: ${title}

EXT. CITY SKYLINE - DAWN
Aerial drift over rooftops as the first light breaks. Market traders set up stalls below.

NARRATOR
Every story begins with a question. Ours is simple: ${idea}.

INT. ARCHIVE ROOM - DAY
Dust floats in a beam of light. Old photographs and handwritten notes are spread across a wooden table.

NARRATOR
To understand where we are going, we have to look at where it all started.

EXT. BUSY STREET - DAY
Slow-motion crowds, close details of hands, faces and street signs.

NARRATOR
Today, millions of people live with the answer, often without noticing it.

EXT. HILLTOP - SUNSET
A lone figure watches the city lights come on.

NARRATOR
And the next chapter is still being written. By us.

FADE OUT.`;
  if (p.mode === "ad") return `TITLE: ${title}

INT. MODERN APARTMENT - MORNING
TOBI (28, sharp, always running late) rushes through the kitchen, juggling a phone and keys.

TOBI
Not today. Please, not today.

INT. MODERN APARTMENT - MORNING
Close on the PRODUCT on the counter, catching a perfect beam of morning light.

NARRATOR
${cap(idea)}. Made for the days that don't wait.

EXT. CITY STREET - DAY
Tobi walks out confident, product in hand, the city in focus behind.

TOBI
(smiling to camera)
Sorted.

NARRATOR
Try it today.

FADE OUT.`;
  return `TITLE: ${title}

INT. FAMILY LIVING ROOM - NIGHT
A warm, cluttered living room. ADA (24, braided hair, red lipstick, gold wristwatch, red ankara dress) paces near the window, phone in hand.

ADA
He said he would be here by eight.

MAMA NKEM (55, wrapper and blouse, coral beads, reading glasses) sets a tray of tea on the table without looking up.

MAMA NKEM
Men who say eight mean nine. Sit down, my daughter.

Headlights sweep across the curtains. Ada freezes.

CUT TO:

EXT. COMPOUND GATE - NIGHT
Rain on the iron gate. CHIDI (27, navy suit, silver watch, holding a small velvet box) stands under a security light, rehearsing.

CHIDI
(whispering)
Ada, I know I've made mistakes about ${idea}...

The gate creaks open. Ada stands there, arms folded.

ADA
Say it to my face, Chidi.

INT. FAMILY LIVING ROOM - NIGHT
Mama Nkem watches through the window, a slow smile spreading.

MAMA NKEM
(to herself)
Finally.

FADE OUT.`;
}

export async function writeScript(p: Project, instruction: string) {
  const hasScript = p.script.trim().length > 40;
  const { data, source } = await structured<{ title: string; script: string }>(
    `You are an award-winning screenwriter for an AI movie studio. ${ctx(p)} Write in standard screenplay format: a first line "TITLE: ...", scene headings (INT./EXT. LOCATION - TIME), action lines, CHARACTER names in caps on their own line, optional (parentheticals), dialogue, and transitions like CUT TO:. ${p.mode !== "drama" ? "Use NARRATOR for voiceover lines." : ""} Describe characters vividly on first appearance (age, face, hair, skin tone, wardrobe colours, makeup, accessories) so continuity can be tracked. Keep runtime within the format limit. Return {"title": string, "script": string}.`,
    hasScript ? `Current script:\n${p.script}\n\nRevise it according to: ${instruction || "tighten and improve it"}` : `Idea: ${instruction || p.idea}${p.brainstorm.length ? `\n\nBrainstorm notes:\n${p.brainstorm.slice(-6).map((m) => m.content).join("\n")}` : ""}${(p.research || []).length ? `\n\nResearch notes:\n${(p.research || []).slice(-2).map((r) => r.notes.slice(0, 1500)).join("\n---\n")}` : ""}`,
    () => {
      if (hasScript) {
        const note = instruction ? `\n\n[Demo mode revision request noted: "${instruction}". Connect Muse Spark in Admin for real rewrites.]` : "";
        return { title: p.title, script: p.script + note };
      }
      const s = mockScript(p, instruction);
      return { title: parseScenes(s).title, script: s };
    },
  );
  await db.update(p.id, (x) => { x.script = data.script; if (data.title && (x.title === "Untitled project" || !x.title)) x.title = data.title; });
  return { source };
}

// ───────────────────────── Assets ─────────────────────────
const PROP_WORDS = ["phone", "wristwatch", "watch", "velvet box", "ring", "keys", "tray", "tea", "letter", "bag", "car", "knife", "gun", "product", "bottle", "laptop", "umbrella", "photograph", "book", "camera", "gate"];

function mockAssets(p: Project): Omit<Asset, "id" | "images">[] {
  const { scenes } = parseScenes(p.script);
  const all = scenes.flatMap((s) => s.items);
  const text = all.map((i) => i.text).join(" ");
  const chars = new Map<string, string>();
  for (const it of all) if (it.kind === "dialog" && it.speaker && !NARRATOR_RE.test(it.speaker)) {
    const name = it.speaker;
    if (!chars.has(name)) {
      const m = text.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(([^)]+)\\)", "i"));
      chars.set(name, m ? m[1] : "");
    }
  }
  const out: Omit<Asset, "id" | "images">[] = [];
  let vi = 0;
  const voices = ["en-NG-EzinneNeural", "en-NG-AbeoNeural", "en-US-AriaNeural", "en-GB-RyanNeural", "en-US-JennyNeural"];
  for (const [name, desc] of chars) {
    const parts = desc.split(",").map((s) => s.trim()).filter(Boolean);
    const age = parts.find((x) => /\d/.test(x));
    const wardrobe = parts.filter((x) => x !== age).join(", ");
    out.push({ kind: "character", name: name.split(" ").map((w) => cap(w.toLowerCase())).join(" "), description: `${age ? age + " years old, " : ""}consistent face and skin tone across every shot`, details: wardrobe || "signature outfit to be defined", voice: voices[vi++ % voices.length] });
  }
  const locs = new Map<string, string>();
  for (const s of scenes) {
    const m = s.heading.match(/^(?:INT\.|EXT\.|INT\/EXT\.?|I\/E\.?)\s*(.+?)(?:\s+-\s+(.+))?$/);
    const name = m ? m[1].trim() : s.heading;
    if (!locs.has(name)) locs.set(name, m?.[2] || "DAY");
  }
  for (const [name, tod] of locs) out.push({ kind: "location", name: name.split(" ").map((w) => cap(w.toLowerCase())).join(" "), description: `${name.toLowerCase()} — establish layout, colour palette and set dressing`, details: cap(tod.toLowerCase()) });
  const lower = text.toLowerCase();
  const props = PROP_WORDS.filter((w) => lower.includes(w)).filter((w, i, a) => !(w === "watch" && a.includes("wristwatch")));
  for (const w of props.slice(0, 6)) out.push({ kind: "prop", name: w.split(" ").map(cap).join(" "), description: `hero ${w}, consistent design in every appearance`, details: "" });
  return out;
}

export async function extractAssets(p: Project) {
  const { data, source } = await structured<{ assets: Omit<Asset, "id" | "images">[] }>(
    `You are a film production designer and continuity supervisor. ${ctx(p)} Extract every recurring Character, Location and Prop from the screenplay. For characters, "description" covers face, age, skin tone, hair and build; "details" covers wardrobe colours, makeup/lipstick, watches, jewellery. For locations, "details" is the time of day and lighting. For props, "details" covers material and colour. Return {"assets":[{"kind":"character|location|prop","name","description","details"}]}.`,
    p.script,
    () => ({ assets: mockAssets(p) }),
  );
  await db.update(p.id, (x) => {
    const keep = new Map(x.assets.map((a) => [a.kind + ":" + a.name.toLowerCase(), a]));
    x.assets = data.assets.map((a) => {
      const old = keep.get(a.kind + ":" + a.name.toLowerCase());
      return old ? { ...old, description: old.description || a.description, details: old.details || a.details } : { ...a, id: nanoid(8), images: [], voice: a.voice || (a.kind === "character" ? EDGE_VOICES[0].id : undefined) };
    });
    x.bible = buildBible(x);
  });
  return { source };
}

export function buildBible(p: Project) {
  const sec = (k: Asset["kind"], t: string) => {
    const a = p.assets.filter((x) => x.kind === k);
    return a.length ? `${t}:\n${a.map((x) => `- ${x.name}: ${x.description}${x.details ? ` | ${k === "location" ? "Time/light" : k === "character" ? "Wardrobe & accessories" : "Details"}: ${x.details}` : ""}`).join("\n")}` : "";
  };
  return [`STYLE: ${styleText(p)}; aspect ${p.aspect}`, sec("character", "CHARACTERS (lock face, skin tone, hair, wardrobe colours, makeup, watches)"), sec("location", "LOCATIONS"), sec("prop", "PROPS")].filter(Boolean).join("\n\n");
}

function newVersion(url: string, prompt: string, source: ImageVersion["source"]): ImageVersion {
  return { id: nanoid(8), url, prompt, createdAt: now(), source };
}

export async function assetImage(p: Project, assetId: string, extra = "") {
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new Error("asset not found");
  const prompt = a.kind === "character"
    ? `Character reference sheet of ${a.name}: front view, three-quarter view and profile on a neutral background, full body and face close-up. ${a.description}. Wardrobe: ${a.details}. ${styleText(p)}. ${extra}`
    : a.kind === "location"
    ? `Establishing reference of ${a.name}, ${a.details}. ${a.description}. No people. ${styleText(p)}. ${extra}`
    : `Product/prop reference of ${a.name} on a clean backdrop, multiple angles. ${a.description} ${a.details}. ${styleText(p)}. ${extra}`;
  const prev = a.activeImage ? a.images.find((i) => i.id === a.activeImage) : undefined;
  const file = path.join(projectMediaDir(p.id), `asset-${a.id}-${Date.now()}.png`);
  const source = await generateImage({ prompt, aspect: a.kind === "location" ? p.aspect : "1:1", outFile: file, refs: extra && prev ? [mediaPath(prev.url)] : [], label: `${a.kind}: ${a.name}`, style: p.style });
  const v = newVersion(mediaUrl(file), prompt, source);
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; t.images.push(v); t.activeImage = v.id; });
  return v;
}

export async function autofillAsset(p: Project, assetId: string) {
  const a = p.assets.find((x) => x.id === assetId)!;
  const { data } = await structured<{ description: string; details: string }>(
    `You are a costume and production designer. ${ctx(p)} Expand the asset into a precise, camera-ready continuity description. Return {"description","details"}.`,
    `Script excerpt:\n${p.script.slice(0, 4000)}\n\nAsset (${a.kind}): ${a.name}\nCurrent: ${a.description} | ${a.details}`,
    () => ({
      description: a.kind === "character" ? `${a.description.replace(/\.$/, "")}; expressive eyes, natural skin texture, the same hairstyle in every shot` : a.kind === "location" ? `${a.description}; practical lamps, layered depth, lived-in textures` : `${a.description}; distinctive silhouette and finish`,
      details: a.details || (a.kind === "location" ? "Golden hour" : "Signature colours locked for continuity"),
    }),
  );
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; t.description = data.description; t.details = data.details; x.bible = buildBible(x); });
}

// ───────────────────────── Storyboard ─────────────────────────
interface PlanShot { description: string; camera: string; speaker?: string; dialogue?: string; narration?: string; durationSec: number; assets: string[]; end?: string }

function mockStoryboard(p: Project): { scenes: { heading: string; summary: string; shots: PlanShot[] }[] } {
  const { scenes } = parseScenes(p.script);
  const cams = ["Wide establishing shot", "Medium shot", "Close-up", "Over-the-shoulder", "Low-angle shot", "Tracking shot", "Extreme close-up"];
  const maxShots = FORMATS[p.format].maxSec <= 90 ? 6 : 12;
  let ci = 0;
  return {
    scenes: scenes.map((s) => {
      const shots: PlanShot[] = [];
      let pendingAction = "";
      for (const it of s.items) {
        const names = p.assets.filter((a) => (pendingAction + " " + it.text + " " + (it.speaker || "")).toLowerCase().includes(a.name.toLowerCase().split(" ")[0]) || s.heading.toLowerCase().includes(a.name.toLowerCase())).map((a) => a.name);
        if (it.kind === "action") {
          if (pendingAction) shots.push({ description: pendingAction, camera: cams[ci++ % cams.length], durationSec: 4, assets: names });
          pendingAction = it.text;
        } else {
          const narr = NARRATOR_RE.test(it.speaker || "");
          const words = it.text.split(/\s+/).length;
          shots.push({
            description: pendingAction || (narr ? `Visual for: ${it.text}` : `${it.speaker} speaks`),
            camera: narr ? cams[ci++ % cams.length] : "Close-up",
            ...(narr ? { narration: it.text } : { speaker: it.speaker, dialogue: it.text }),
            durationSec: Math.max(3, Math.min(10, Math.round(words / 2.6 + 1.5))),
            assets: names,
          });
          pendingAction = "";
        }
      }
      if (pendingAction) shots.push({ description: pendingAction, camera: cams[ci++ % cams.length], durationSec: 4, assets: [] });
      return { heading: s.heading, summary: s.items.find((i) => i.kind === "action")?.text.slice(0, 140) || "", shots: shots.slice(0, maxShots) };
    }),
  };
}

export async function buildStoryboard(p: Project) {
  const { data, source } = await structured<{ scenes: { heading: string; summary: string; shots: PlanShot[] }[] }>(
    `You are Opie's AI director (Muse Wonder). ${ctx(p)} Break the screenplay into a shot list for an AI video pipeline that uses a START frame and an END frame per shot (the end frame of one shot should flow into the next). For each shot give: description (what we see at the start), end (what we see at the end), camera (shot size + movement), speaker+dialogue OR narration, durationSec (3-8), assets (names from the asset list that must appear). Respect the production bible.\n\nASSETS:\n${p.assets.map((a) => `${a.kind}: ${a.name}`).join("\n")}\n\nReturn {"scenes":[{"heading","summary","shots":[...]}]}.`,
    p.script,
    () => mockStoryboard(p),
    getConfig("META_AGENT_MODEL"),
  );
  const byName = (n: string) => p.assets.find((a) => a.name.toLowerCase() === n.toLowerCase())?.id;
  let idx = 0;
  const scenes: Scene[] = data.scenes.map((s) => ({
    id: nanoid(8), heading: s.heading, summary: s.summary,
    shots: s.shots.map((sh) => ({
      id: nanoid(8), index: idx++, description: sh.description + (sh.end ? ` → ends: ${sh.end}` : ""), camera: sh.camera, speaker: sh.speaker, dialogue: sh.dialogue, narration: sh.narration,
      durationSec: sh.durationSec || 4, assetIds: (sh.assets || []).map(byName).filter(Boolean) as string[], startFrame: [], endFrame: [],
    })),
  }));
  await db.update(p.id, (x) => { x.scenes = scenes; x.bible = buildBible(x); });
  return { source };
}

export function findShot(p: Project, shotId: string): Shot {
  for (const s of p.scenes) for (const sh of s.shots) if (sh.id === shotId) return sh;
  throw new Error("shot not found");
}
function allShots(p: Project) { return p.scenes.flatMap((s) => s.shots); }

function shotPrompt(p: Project, sh: Shot, which: "start" | "end", change?: string) {
  const assets = p.assets.filter((a) => sh.assetIds.includes(a.id));
  const [startDesc, endDesc] = sh.description.split(" → ends: ");
  const what = which === "start" ? startDesc : endDesc || `the closing moment of: ${startDesc}`;
  return [
    `${sh.camera}. ${what}.`,
    sh.dialogue ? `${sh.speaker} is speaking: "${sh.dialogue}".` : "",
    assets.length ? `Keep continuity: ${assets.map((a) => `${a.name} (${a.description}; ${a.details})`).join("; ")}.` : "",
    `${styleText(p)}, ${p.aspect} composition.`,
    change ? `Change: ${change}. Keep everything else identical.` : "",
  ].filter(Boolean).join(" ");
}

export async function generateFrame(p: Project, shotId: string, which: "start" | "end", change?: string) {
  const sh = findShot(p, shotId);
  const list = which === "start" ? sh.startFrame : sh.endFrame;
  const active = list.find((v) => v.id === (which === "start" ? sh.activeStart : sh.activeEnd));
  const refs: string[] = [];
  if (change && active) refs.push(mediaPath(active.url));
  for (const a of p.assets.filter((a) => sh.assetIds.includes(a.id))) {
    const img = a.images.find((i) => i.id === a.activeImage);
    if (img) refs.push(mediaPath(img.url));
  }
  // chained continuity: the start of shot N leans on the end frame of shot N-1
  if (which === "start" && !change) {
    const shots = allShots(p); const i = shots.findIndex((s) => s.id === shotId);
    const prev = i > 0 ? shots[i - 1] : undefined;
    const pe = prev?.endFrame.find((v) => v.id === prev.activeEnd);
    if (pe) refs.push(mediaPath(pe.url));
  }
  const prompt = shotPrompt(p, sh, which, change);
  const file = path.join(projectMediaDir(p.id), `shot-${sh.id}-${which}-${Date.now()}.png`);
  const source = await generateImage({ prompt, aspect: p.aspect, outFile: file, refs, label: `Shot ${sh.index + 1} · ${which} frame`, style: p.style });
  const v = newVersion(mediaUrl(file), change ? `EDIT: ${change}` : prompt, source);
  await db.update(p.id, (x) => {
    const t = findShot(x, shotId);
    if (which === "start") { t.startFrame.push(v); t.activeStart = v.id; } else { t.endFrame.push(v); t.activeEnd = v.id; }
    t.continuity = undefined;
    if (!x.cover && which === "start") x.cover = v.url;
  });
  return v;
}

// ───────────────────────── Continuity ─────────────────────────
export async function checkContinuity(p: Project, shotId: string) {
  const sh = findShot(p, shotId);
  const frame = sh.startFrame.find((v) => v.id === sh.activeStart);
  const assets = p.assets.filter((a) => sh.assetIds.includes(a.id));
  let result: { ok: boolean; issues: string[] }; let source: string = "mock";
  if (llmLive() && frame) {
    const refs = assets.map((a) => ({ name: a.name, img: a.images.find((i) => i.id === a.activeImage) })).filter((r) => r.img).map((r) => ({ name: r.name, file: mediaPath(r.img!.url) }));
    result = await visionCheck(mediaPath(frame.url), refs, p.bible, sh.description);
    source = llmLabel();
  } else {
    const issues: string[] = [];
    if (!frame) issues.push("No start frame generated yet.");
    const text = `${sh.description} ${sh.dialogue || ""} ${sh.speaker || ""}`.toLowerCase();
    for (const c of p.assets.filter((a) => a.kind === "character")) {
      const first = c.name.toLowerCase().split(" ")[0];
      if (text.includes(first) && !sh.assetIds.includes(c.id)) issues.push(`${c.name} appears in this shot but is not linked as a reference — face/wardrobe may drift.`);
    }
    for (const a of assets) if (!a.activeImage) issues.push(`${a.name} has no approved reference image yet.`);
    if (sh.endFrame.length && !sh.activeEnd) issues.push("End frame not selected.");
    result = { ok: issues.length === 0, issues };
  }
  await db.update(p.id, (x) => { findShot(x, shotId).continuity = { ...result, checkedAt: now(), source }; });
  return result;
}

export async function fixContinuity(p: Project, shotId: string) {
  const sh = findShot(p, shotId);
  const text = `${sh.description} ${sh.dialogue || ""} ${sh.speaker || ""}`.toLowerCase();
  const missing = p.assets.filter((a) => a.kind === "character" && text.includes(a.name.toLowerCase().split(" ")[0]) && !sh.assetIds.includes(a.id));
  await db.update(p.id, (x) => { const t = findShot(x, shotId); t.assetIds.push(...missing.map((m) => m.id)); });
  let fresh = db.getProject(p.id)!;
  for (const a of fresh.assets.filter((a) => findShot(fresh, shotId).assetIds.includes(a.id) && !a.activeImage)) await assetImage(fresh, a.id);
  fresh = db.getProject(p.id)!;
  const issues = sh.continuity?.issues?.join("; ");
  await generateFrame(fresh, shotId, "start", issues ? `fix continuity: ${issues}` : undefined);
  return checkContinuity(db.getProject(p.id)!, shotId);
}
