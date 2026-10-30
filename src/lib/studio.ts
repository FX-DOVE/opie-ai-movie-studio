import { ttsProvider } from "./providers/tts";
import { assignVoices, clearLinesFor } from "./voices";
import { memoryBrief } from "./memory";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, mediaPath, mediaUrl, projectMediaDir } from "./db";
import { generateImage, llmLive, structured, visionCheck } from "./providers/meta";
import { cropBoxes, samBoxes, samOn } from "./providers/sam";
import { getConfig, llmLabel } from "./config";
import { withStep } from "./usage";
import { characterSheetPrompt, locationSheetPrompt, mockSpec, propSheetPrompt, specLine, specSchema, type CharacterSpec, type LocationSpec, type PropSpec } from "./refsheet";
import { parseScenes, NARRATOR_RE } from "./screenplay";
import { DEFAULT_GENRE, GENRES, GENRE_IDS, detectGenre, genreBrief, genreOf, isGenre, type GenrePurpose, type GenreSkill } from "./genres";
import { normalizeDialogue } from "./dialogue";
import { FORMATS, MODES, STYLES, isApproved, isDraft, type Asset, type ChatMsg, type ImageVersion, type Project, type Scene, type Shot } from "./types";

const now = () => new Date().toISOString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function styleText(p: Project) {
  return p.style === "custom" ? p.customStyle || "cinematic" : STYLES[p.style];
}
/** The film-style (genre) skill this project runs on: always for drama, and for documentary/ad only when the user picked one. */
export function genreFor(p: Project): GenreSkill | undefined {
  return p.mode === "drama" || p.filmStyleManual ? genreOf(p) : undefined;
}
/** Shared context for every agent: mode, format, look, the genre skill slice for this agent, then the user's learned taste on top. */
function ctx(p: Project, purpose: "director" | "script" = "director", skill?: GenrePurpose) {
  const g = skill && genreFor(p);
  return `Mode: ${MODES[p.mode]}. Format: ${FORMATS[p.format].label} (${p.aspect}, max ${FORMATS[p.format].maxSec}s). Visual style: ${styleText(p)}.${g ? `\n\n${genreBrief(g, skill!)}\n\n` : ""}${memoryBrief(p.ownerId, purpose)}${g ? "\n(The user's learned preferences above override the genre defaults where they conflict.)" : ""}`;
}

/** Muse Spark picks the film style from the idea + brainstorm (+ the user's learned taste) unless the user chose one. */
export async function pickGenre(p: Project, extra = ""): Promise<GenreSkill | undefined> {
  if (p.filmStyleManual || p.mode !== "drama") return genreFor(p);
  const text = [p.title, p.idea, extra, ...p.brainstorm.slice(-6).map((m) => m.content)].filter(Boolean).join("\n").slice(0, 4000);
  if (!text.trim()) return genreOf(p);
  const guess = detectGenre(text);
  const { data } = await structured<{ id: string; why?: string }>(
    `You classify a film idea into exactly one house film-style skill. Options:\n${GENRE_IDS.map((id) => `- ${id}: ${GENRES[id].label} — ${GENRES[id].short}`).join("\n")}\nIf nothing clearly fits, choose "${DEFAULT_GENRE}".${memoryBrief(p.ownerId, "script", 4)}\nReturn {"id": one of the ids, "why": short reason}.`,
    text, () => ({ id: guess || p.filmStyle || DEFAULT_GENRE }), undefined, "general",
  ).catch(() => ({ data: { id: guess || p.filmStyle || DEFAULT_GENRE } }));
  const id = isGenre(data.id) ? data.id : guess || DEFAULT_GENRE;
  if (id !== p.filmStyle) await db.update(p.id, (x) => { if (!x.filmStyleManual) { x.filmStyle = id; if (x.music !== "none") x.music = GENRES[id].music; } });
  return GENRES[id];
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

/** MMS (Meta's open TTS) reads plain words cleanly but stumbles on slang, rare names, numerals and long tongue-twisters. */
function voiceWritingNote() {
  return ttsProvider().id === "meta-mms" ? "Dialogue will be voiced by a synthetic voice: write lines of 4–14 words using clear, common, easily pronounced English words; spell numbers as words; avoid abbreviations, symbols, heavy slang, stacked consonant clusters and unusual invented names (if a culture-specific word is essential, use it at most once per line and keep the rest simple)." : "";
}
export async function writeScript(p: Project, instruction: string) {
  const hasScript = p.script.trim().length > 40;
  if (!hasScript) { await pickGenre(p, instruction); p = db.getProject(p.id) || p; }
  const g = genreFor(p);
  const { data, source } = await structured<{ title: string; script: string }>(
    `You are an award-winning screenwriter for an AI movie studio. ${ctx(p, "script", "script")} Write in standard screenplay format: a first line "TITLE: ...", scene headings (INT./EXT. LOCATION - TIME), action lines, CHARACTER names in caps on their own line, optional (parentheticals), dialogue, and transitions like CUT TO:. ${p.mode !== "drama" ? "Use NARRATOR for voiceover lines." : ""} ${voiceWritingNote()} Describe characters vividly on first appearance (age, face, hair, skin tone, wardrobe colours, makeup, accessories) so continuity can be tracked. Keep runtime within the format limit.${g ? ` Follow the FILM STYLE SKILL: its beat structure, archetypes, dialogue voice and pacing. Dialogue lines: one speaker each, 4–14 words, no parentheticals inside lines.` : ""} Never use existing film titles, franchise names, characters or real people. Return {"title": string, "script": string}.`,
    hasScript ? `Current script:\n${p.script}\n\nRevise it according to: ${instruction || "tighten and improve it"}` : `Idea: ${instruction || p.idea}${p.brainstorm.length ? `\n\nBrainstorm notes:\n${p.brainstorm.slice(-6).map((m) => m.content).join("\n")}` : ""}${(p.research || []).length ? `\n\nResearch notes:\n${(p.research || []).slice(-2).map((r) => r.notes.slice(0, 1500)).join("\n---\n")}` : ""}`,
    () => {
      if (hasScript) {
        const note = instruction ? `\n\n[Demo mode revision request noted: "${instruction}". Connect Muse Spark in Admin for real rewrites.]` : "";
        return { title: p.title, script: p.script + note };
      }
      const s = mockScript(p, instruction);
      return { title: parseScenes(s).title, script: s };
    },
    undefined, "director",
  );
  const sv = data as unknown as Record<string, unknown>;
  const script = [sv.script, sv.screenplay, sv.text, sv.content].find((v) => typeof v === "string" && v.trim().length > 40) as string | undefined;
  if (!script) throw new Error("The AI returned no script text — try again");
  data.script = script;
  await db.update(p.id, (x) => { x.script = script; if (data.title && (x.title === "Untitled project" || !x.title)) x.title = data.title; });
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
    `You are a film production designer and continuity supervisor. ${ctx(p)} Extract every recurring Character, Location and Prop from the screenplay. For characters, "description" starts with age and gender (e.g. "22-year-old woman") then covers face, skin tone, hair and build; "details" covers wardrobe colours, makeup/lipstick, watches, jewellery. For locations, "details" is the time of day and lighting. For props, "details" covers material and colour. Return {"assets":[{"kind":"character|location|prop","name","description","details"}]}.`,
    p.script,
    () => ({ assets: mockAssets(p) }),
    undefined, "director",
  );
  await db.update(p.id, (x) => {
    const keep = new Map(x.assets.map((a) => [a.kind + ":" + a.name.toLowerCase(), a]));
    x.assets = data.assets.map((a) => {
      const old = keep.get(a.kind + ":" + a.name.toLowerCase());
      // the model's voice suggestion is ignored: voices come from the bible's gender/age (or the user's own pick)
      return old ? { ...old, description: old.description || a.description, details: old.details || a.details } : { ...a, id: nanoid(8), images: [], voice: undefined, voiceManual: undefined };
    });
    clearLinesFor(x, assignVoices(x));
    x.bible = buildBible(x);
  });
  return { source };
}

export function buildBible(p: Project) {
  const sec = (k: Asset["kind"], t: string) => {
    const a = p.assets.filter((x) => x.kind === k);
    return a.length ? `${t}:\n${a.map((x) => x.spec ? `- ${specLine(x)}` : `- ${x.name}: ${x.description}${x.details ? ` | ${k === "location" ? "Time/light" : k === "character" ? "Wardrobe & accessories" : "Details"}: ${x.details}` : ""}`).join("\n")}` : "";
  };
  const g = genreFor(p);
  return [`STYLE: ${styleText(p)}; aspect ${p.aspect}${g ? `\nFILM STYLE: ${g.label} — ${genreBrief(g, "image")}` : ""}`, sec("character", "CHARACTERS (lock face, skin tone, hair, wardrobe colours, makeup, watches)"), sec("location", "LOCATIONS"), sec("prop", "PROPS (lock object, colours, materials, exact label text)")].filter(Boolean).join("\n\n");
}

function newVersion(url: string, prompt: string, source: ImageVersion["source"]): ImageVersion {
  return { id: nanoid(8), url, prompt, createdAt: now(), source };
}

/** Director expands an asset into a structured, locked-able spec (props first-class: scale, materials, hex colours, exact text). */
export async function expandSpec(p: Project, assetId: string) {
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new Error("asset not found");
  if (a.locked && a.spec) return a.spec;
  const first = a.name.toLowerCase().split(/\s+/)[0];
  const lines = p.script.split("\n").filter((l) => l.toLowerCase().includes(first)).slice(0, 25).join("\n");
  const loc = p.assets.filter((x) => x.kind === "location").map((x) => x.name).join(", ");
  const role = a.kind === "prop" ? `a film prop master${p.mode === "ad" ? " and packshot art director — this may be the hero product, so label text accuracy is critical" : ""}` : a.kind === "character" ? "a casting director and costume designer" : "a production designer";
  const { data } = await structured<Record<string, unknown>>(
    `You are ${role}. ${ctx(p)} Expand the ${a.kind} into a precise, camera-ready continuity spec that an image model can reproduce identically in every shot. Be concrete: real measurements, exact hex colours, materials, wear. Brand-neutral (no real brands). If the object carries text, give the exact spelling; otherwise return an empty text array. Infer era/region from the story (e.g. Lagos 2020s). Locations available: ${loc || "n/a"}. Return JSON exactly in this shape: ${specSchema(a.kind)}`,
    `Script lines mentioning it:\n${lines || p.script.slice(0, 2500)}\n\n${a.kind}: ${a.name}\nCurrent notes: ${a.description} | ${a.details}`,
    () => mockSpec(p, a) as unknown as Record<string, unknown>,
    undefined, "director",
  );
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; t.spec = data; x.bible = buildBible(x); });
  return data;
}

export function sheetPrompt(p: Project, a: Asset, extra = "") {
  const taste = memoryBrief(p.ownerId, "reference", 6).replace(/\n+/g, " ").trim();
  const g = genreFor(p);
  const notes = [extra, g ? `Film look: ${g.look}.` : "", taste].filter(Boolean).join(" ");
  const spec = (a.spec || mockSpec(p, a)) as unknown;
  if (a.kind === "prop") {
    const loc = p.assets.find((x) => x.kind === "location" && (String((spec as PropSpec).context || "").toLowerCase().includes(x.name.toLowerCase().split(/\s+/)[0]))) || p.assets.find((x) => x.kind === "location");
    return propSheetPrompt(p, a, spec as PropSpec, loc ? `${loc.name}${loc.details ? ` (${loc.details})` : ""}` : undefined, notes);
  }
  return a.kind === "character" ? characterSheetPrompt(p, a, spec as CharacterSpec, notes) : locationSheetPrompt(p, a, spec as LocationSpec, notes);
}

/** Generate (or regenerate with notes) an asset's reference sheet from its structured spec. */
export async function assetImage(p: Project, assetId: string, extra = "") {
  let a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new Error("asset not found");
  if (a.locked) throw new Error(`${a.name} is locked — unlock it to regenerate.`);
  if (!a.spec && llmLive()) { await expandSpec(p, assetId).catch(() => null); p = db.getProject(p.id)!; a = p.assets.find((x) => x.id === assetId)!; }
  const prompt = sheetPrompt(p, a, extra);
  const prev = a.activeImage ? a.images.find((i) => i.id === a.activeImage) : undefined;
  const refs: string[] = [];
  if (extra && prev) refs.push(mediaPath(prev.url)); // regenerate with notes = edit of the current sheet
  if (a.kind === "prop") { const loc = p.assets.find((x) => x.kind === "location" && x.activeImage); const li = loc?.images.find((i) => i.id === loc.activeImage); if (li) refs.push(mediaPath(li.url)); }
  const file = path.join(projectMediaDir(p.id), `asset-${a.id}-${Date.now()}.png`);
  const source = await generateImage({ prompt, aspect: p.aspect, outFile: file, refs, label: `${a.kind}: ${a.name}`, style: p.style });
  const v = newVersion(mediaUrl(file), prompt, source);
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; t.images.push(v); t.activeImage = v.id; t.approved = false; t.refState = undefined; t.refIssues = undefined; });
  return v;
}

/**
 * Review an AI reference sheet against its spec (Spark vision). Pass → auto-approved. Fail → regenerate with the
 * reviewer's notes (Muse Image edit of the sheet), up to CONTINUITY_RETRIES; still failing → "needs attention" (manual Approve).
 */
export async function reviewReference(pid: string, assetId: string) {
  const max = Math.max(0, Math.min(5, parseInt(getConfig("CONTINUITY_RETRIES") || "2")));
  const upd = (patch: Partial<Asset>) => db.update(pid, (x) => { const t = x.assets.find((y) => y.id === assetId); if (t) Object.assign(t, patch); });
  let tries = 0;
  for (;;) {
    const p = db.getProject(pid)!; const a = p.assets.find((x) => x.id === assetId);
    const img = a?.images.find((i) => i.id === a.activeImage);
    if (!a || !img) return;
    if (img.source === "upload") return upd({ approved: false, refState: undefined });
    if (!llmLive() || img.source === "mock") return upd({ approved: true, refState: tries ? "fixed" : "passed", refIssues: [] });
    await upd({ refState: "checking" });
    const v = await withStep(pid, "references", () => visionCheck(mediaPath(img.url), [], buildBible(p), `This image is the REFERENCE SHEET for the ${a.kind} "${a.name}". Check it against its locked spec: ${specLine(a)}. ${a.kind === "prop" ? "Required panels: front, three-quarter, side, back, detail close-up and an in-context still with a scale reference; label text spelled exactly; no extra objects, no warped text, no hands covering it, no watermark." : a.kind === "character" ? "The same person in every panel, exact wardrobe colours and accessories." : "Set pieces, palette and lighting as specified, no people."} Ignore panel label typography. Judge like a continuity supervisor, not a spec auditor: set ok=false ONLY for identity-breaking problems that would make it read as a different ${a.kind} in the shots — wrong main colours or materials, wrong object type or silhouette, a missing signature feature, a different person between panels, misspelled brand/label text, extra people or watermarks. Do NOT fail for exact measurements, centimetre positions, item counts (e.g. how many pieces of food), hole counts, minor construction details or layout of secondary set dressing; mention those only if serious.`)).catch(() => ({ ok: true, issues: [] as string[], fix_prompt: "" }));
    if (v.ok) return upd({ approved: true, refState: tries ? "fixed" : "passed", refIssues: [] });
    if (tries >= max) return upd({ approved: false, refState: "attention", refIssues: (v.issues || []).slice(0, 4) });
    tries++;
    await upd({ refState: "fixing", refIssues: (v.issues || []).slice(0, 4) });
    await withStep(pid, "references", () => assetImage(db.getProject(pid)!, assetId, v.fix_prompt || (v.issues || []).join("; ")));
  }
}

/** After references are made: review + auto-approve them, then move on to the storyboard when every reference is approved. */
export async function autocreateAndAdvance(pid: string) {
  for (const a of db.getProject(pid)!.assets.filter((a) => !a.activeImage && !isDraft(a))) await assetImage(db.getProject(pid)!, a.id);
  for (const a of db.getProject(pid)!.assets.filter((a) => a.activeImage && a.approved === false && a.refState !== "attention")) await reviewReference(pid, a.id);
  const p = db.getProject(pid)!;
  const ready = p.assets.filter((a) => !isDraft(a)).every(isApproved);
  let advanced = false;
  if (ready && !p.scenes.some((s) => s.shots.length)) { await withStep(pid, "shots", () => buildStoryboard(db.getProject(pid)!)); advanced = true; }
  return { ready, advanced, attention: p.assets.filter((a) => a.refState === "attention").map((a) => a.name) };
}

/** Lock = freeze spec + approved image as the bible entry used by every shot (and by the continuity review). */
export async function lockAsset(p: Project, assetId: string, locked: boolean) {
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) throw new Error("asset not found");
  if (locked && !a.activeImage) throw new Error("Approve an image before locking.");
  if (locked && !a.spec) await expandSpec(p, assetId);
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; t.locked = locked; x.bible = buildBible(x); });
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
    undefined, "director",
  );
  await db.update(p.id, (x) => { const t = x.assets.find((y) => y.id === assetId)!; if (t.locked) return; t.description = data.description; t.details = data.details; t.spec = undefined; x.bible = buildBible(x); });
}

// ───────────────────────── Storyboard ─────────────────────────
interface PlanShot { description: string; camera: string; speaker?: string; dialogue?: string; narration?: string; durationSec: number; assets: string[]; end?: string; beat?: string; screen?: string }

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
  const maxSec = FORMATS[p.format].maxSec;
  const hasNarrator = p.mode !== "drama" || /^\s*NARRATOR\b/m.test(p.script);
  const budget = ` RUNTIME BUDGET: the sum of all durationSec must be ≤ ${maxSec}s (aim for ${Math.round(maxSec * 0.9)}s) — merge or drop shots to fit; never exceed it. ${hasNarrator ? "narration is only for NARRATOR/voice-over lines from the script." : "This is a drama with no narrator: leave narration empty on every shot."} Never put sound effects, music cues or notes like "No dialogue" into dialogue or narration — silent shots simply have no dialogue.`;
  const plan = await structured<{ scenes: { heading: string; summary: string; shots: PlanShot[] }[] }>(
    `You are ReelForge's AI director (Muse Wonder). ${ctx(p, "director", "director")} Break the screenplay into a shot list for an AI video pipeline that uses a START frame and an END frame per shot (the end frame of one shot should flow into the next). For each shot give: description (what we see at the start), end (what we see at the end), camera (shot size + movement), speaker+dialogue OR narration, durationSec (3-8), assets (names from the asset list that must appear), beat (the genre beat type for this shot), screen (screen direction: who is frame-left/right, facing and movement direction — keep it consistent across the scene unless a shot deliberately crosses the line). One speaker per shot; dialogue ≤ 14 words — split longer speeches across shots with reaction coverage. Respect the production bible and the FILM STYLE SKILL's shot grammar.${budget}\n\nASSETS:\n${p.assets.map((a) => `${a.kind}: ${a.name}`).join("\n")}\n\nReturn {"scenes":[{"heading","summary","shots":[...]}]}.`,
    `${p.script}${p.bible ? `\n\nPRODUCTION BIBLE:\n${p.bible.slice(0, 3000)}` : ""}`,
    () => mockStoryboard(p),
    undefined, "director",
  );
  let data = plan.data; const source = plan.source;
  const total = (d: typeof data) => d.scenes.reduce((n, s) => n + (s.shots || []).reduce((m, sh) => m + (Number(sh.durationSec) || 4), 0), 0);
  if (source !== "mock" && total(data) > maxSec * 1.15) {
    // over the platform limit: one compression pass keeps the strongest beats and drops the rest
    const r = await structured<typeof data>(
      `You are a film editor. This shot list runs ${Math.round(total(data))}s but the platform limit is ${maxSec}s. Return the same JSON shape with the cut compressed to ≤ ${Math.round(maxSec * 0.95)}s: keep every story beat that matters (setup, turn, climax, button), merge redundant coverage, drop filler, shorten silent shots to 2–3s. Keep the fields (description, end, camera, speaker, dialogue, narration, durationSec, assets, beat, screen) and the dialogue wording of the lines you keep.${budget}`,
      JSON.stringify(data), () => data, undefined, "director",
    ).catch(() => null);
    if (r && r.data.scenes?.length && total(r.data) < total(data)) data = r.data;
  }
  const SOUND_NOTE = /^\s*(\(|\[)?\s*(no dialogue|silence|silent|sfx|sound|music|ambien|beat\b|pause\b|none\b|—|-)/i;
  for (const s of data.scenes) for (const sh of s.shots || []) {
    if (sh.narration && (!hasNarrator || SOUND_NOTE.test(sh.narration))) sh.narration = undefined;
    if (sh.dialogue && SOUND_NOTE.test(sh.dialogue)) { sh.dialogue = undefined; sh.speaker = undefined; }
  }
  const byName = (n: string) => p.assets.find((a) => a.name.toLowerCase() === n.toLowerCase())?.id;
  let idx = 0;
  const scenes: Scene[] = data.scenes.map((s) => ({
    id: nanoid(8), heading: s.heading, summary: s.summary,
    shots: normalizeDialogue((s.shots || []).map((sh) => ({ ...sh, description: sh.description + (sh.end ? ` → ends: ${sh.end}` : ""), end: undefined }))).map((sh) => ({
      id: nanoid(8), index: idx++, description: sh.description, camera: sh.camera, speaker: sh.speaker, dialogue: sh.dialogue, narration: sh.narration, beat: sh.beat ? String(sh.beat).slice(0, 30) : undefined, screen: sh.screen ? String(sh.screen).slice(0, 200) : undefined,
      durationSec: sh.durationSec || 4, assetIds: (sh.assets || []).map(byName).filter(Boolean) as string[], startFrame: [], endFrame: [],
    })),
  }));
  const g = genreFor(p);
  await db.update(p.id, (x) => { x.scenes = scenes; x.bible = buildBible(x); x.genreSkill = g ? `${g.id}@${g.version}` : undefined; });
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
  const g = genreFor(p);
  const people = assets.filter((a) => a.kind === "character").length;
  return [
    `${sh.camera}. ${what}.`,
    sh.screen ? `Screen direction: ${sh.screen}.` : "",
    sh.dialogue ? `${sh.speaker} is mid-line, mouth slightly open, natural expression.` : "",
    people ? `Exactly ${people} named character${people > 1 ? "s" : ""} in focus; correct anatomy, five fingers per hand, no merged bodies.` : "",
    assets.length ? `Keep continuity (locked bible — must match the attached reference sheets exactly): ${assets.map(specLine).join(" || ")}.` : "",
    assets.some((a) => a.kind === "prop") ? "Props must keep their exact colours, materials, markings and label spelling; no duplicate props, no warped text." : "",
    `${styleText(p)}, ${p.aspect} composition.`,
    g ? genreBrief(g, "image") : "",
    "No on-screen text, captions, logos or watermarks.",
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
  let result: { ok: boolean; issues: string[]; fix?: string }; let source: string = "mock";
  if (llmLive() && frame) {
    const refs = assets.map((a) => ({ name: a.name, img: a.images.find((i) => i.id === a.activeImage) })).filter((r) => r.img).map((r) => ({ name: r.name, file: mediaPath(r.img!.url) }));
    // optional SAM 3.1 person segmentation: isolate each person in this frame so the Spark vision reviewer can compare a crop per person against the bible + approved references (identity consistency itself comes from bible + refs + review)
    const chars = assets.filter((a) => a.kind === "character"); let samNote = ""; const crops: string[] = []; const samIssues: string[] = [];
    if (samOn() && chars.length) {
      try {
        const boxes = (await samBoxes(mediaPath(frame.url), "person")).filter((b) => b.c === undefined || b.c >= 0.4);
        crops.push(...await cropBoxes(mediaPath(frame.url), boxes, Math.min(3, chars.length + 1)));
        samNote = ` SAM 3.1 segmented ${boxes.length} person(s) in this frame; the extra images after the reference sheets are crops isolating each person — compare each one's face/wardrobe to the matching character.`;
        if (boxes.length < chars.length) samIssues.push(`Only ${boxes.length} of ${chars.length} expected characters (${chars.map((c) => c.name).join(", ")}) are visible in the frame.`);
      } catch { /* SAM optional */ }
    }
    const shots = allShots(p); const pi = shots.findIndex((s) => s.id === shotId); const prev = pi > 0 ? shots[pi - 1] : undefined;
    const pf = prev ? (prev.endFrame.find((v) => v.id === prev.activeEnd) || prev.startFrame.find((v) => v.id === prev.activeStart)) : undefined;
    const prevRef = pf ? [{ name: "Previous shot (state to carry over)", file: mediaPath(pf.url) }] : [];
    const v = await visionCheck(mediaPath(frame.url), [...refs.map((r) => ({ ...r, name: `${r.name} reference sheet` })), ...prevRef, ...crops.map((f, i) => ({ name: `Person crop ${i + 1}`, file: f }))], buildBible(p) + (genreFor(p) ? `\n\n${genreBrief(genreFor(p)!, "continuity")}` : "") + memoryBrief(p.ownerId, "continuity", 8), `${sh.screen ? `Screen direction: ${sh.screen}. ` : ""}${sh.description}${sh.speaker ? ` — ${sh.speaker}: "${sh.dialogue}"` : ""}. Assets that must appear: ${assets.map((a) => a.name).join(", ") || "none listed"}.${prev ? ` Previous shot: ${prev.description}.` : ""}${samNote}`);
    for (const f of crops) fs.promises.unlink(f).catch(() => {});
    const issues = [...samIssues, ...(v.issues || [])].slice(0, 6);
    result = { ok: !!v.ok && !issues.length, issues, fix: v.fix_prompt ? String(v.fix_prompt).slice(0, 600) : undefined };
    source = llmLabel("review") + (samOn() ? " + SAM 3.1" : "");
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
  await db.update(p.id, (x) => { const t = findShot(x, shotId); t.continuity = { ...result, checkedAt: now(), source, state: t.continuity?.state, attempts: t.continuity?.attempts }; });
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
  // one targeted revise: the reviewer's fix prompt (or the flagged issues), anchored on the current frame + approved references
  const issues = sh.continuity?.fix || sh.continuity?.issues?.join("; ");
  await generateFrame(fresh, shotId, "start", issues ? `targeted continuity revise — ${issues}. Keep every approved detail exactly as is: same face, skin tone, hair, wardrobe, props, location, framing, camera and lighting; change only what is listed` : undefined);
  return checkContinuity(db.getProject(p.id)!, shotId);
}

// ───────────────────────── Automatic continuity (review → fix → re-check) ─────────────────────────
const g = globalThis as unknown as { __rfAuto?: Map<string, Set<string>> };
const queue = (g.__rfAuto ||= new Map());
const setState = (pid: string, shotId: string, patch: Partial<NonNullable<Shot["continuity"]>>) => db.update(pid, (x) => { try { const t = findShot(x, shotId); t.continuity = { ok: false, issues: [], checkedAt: now(), source: "", ...(t.continuity || {}), ...patch }; } catch { /* shot deleted */ } });

/**
 * Review shots against the locked bibles; auto-fix failures with a Muse Image edit (approved refs + corrected prompt),
 * re-check, up to CONTINUITY_RETRIES. Then Passed / Fixed / Needs attention. One runner per project; extra shots queue.
 */
export async function autoContinuity(pid: string, shotIds?: string[]) {
  if (getConfig("AUTO_CONTINUITY") === "off") return;
  const p0 = db.getProject(pid); if (!p0) return;
  const ids = shotIds || allShots(p0).filter((s) => s.activeStart).map((s) => s.id);
  const running = queue.get(pid);
  // mark first (awaited) so the response the UI gets already shows "Checking"; the review itself runs in the background
  for (const id of ids) await setState(pid, id, { state: "checking", attempts: 0 }).catch(() => {});
  if (running) { ids.forEach((i) => running.add(i)); return; }
  const q = new Set(ids); queue.set(pid, q);
  void (async () => {
    try {
      while (q.size) {
        const shotId = q.values().next().value as string; q.delete(shotId);
        await reviewOne(pid, shotId).catch(async (e) => setState(pid, shotId, { state: "attention", ok: false, issues: [`Review failed: ${(e as Error).message.slice(0, 160)}`] }));
      }
    } finally { queue.delete(pid); }
  })();
}
async function reviewOne(pid: string, shotId: string) {
  const max = Math.max(0, Math.min(5, parseInt(getConfig("CONTINUITY_RETRIES") || "2")));
  let p = db.getProject(pid); if (!p) return;
  if (!findShot(p, shotId).activeStart) return;
  await setState(pid, shotId, { state: "checking", attempts: 0 });
  let r = await withStep(pid, "continuity", () => checkContinuity(p!, shotId));
  let tries = 0;
  while (!r.ok && tries < max) {
    tries++;
    await setState(pid, shotId, { state: "fixing", attempts: tries });
    p = db.getProject(pid)!;
    const sh = findShot(p, shotId);
    const fix = sh.continuity?.fix || r.fix || r.issues.join("; ");
    await withStep(pid, "fix", () => generateFrame(p!, shotId, "start", `continuity fix (attempt ${tries}) — ${fix}. Keep every approved detail exactly as in the reference sheets: same faces, skin tones, hair, wardrobe colours, props (colours, markings, exact label text), location and lighting; change only what is listed`));
    await setState(pid, shotId, { state: "checking", attempts: tries });
    r = await withStep(pid, "continuity", () => checkContinuity(db.getProject(pid)!, shotId));
  }
  await setState(pid, shotId, { state: r.ok ? (tries ? "fixed" : "passed") : "attention", attempts: tries });
}
export const continuityRunning = (pid: string) => queue.has(pid);
