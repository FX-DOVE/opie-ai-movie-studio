/**
 * Structured reference-sheet builder for props (priority), characters and locations.
 * 1) The Director model expands an asset into a locked spec (exact type, scale, materials, hex colours, exact label text…).
 * 2) The spec is turned into a product-style reference-sheet prompt (multi-view + in-context scale still), style- and aspect-aware.
 * 3) The same spec feeds every shot prompt and the continuity review (the "bible").
 */
import type { Asset, Project } from "./types";

export interface Colour { name: string; hex: string; where?: string }
export interface PropSpec {
  role: string; objectType: string; design: string; eraRegion: string; scale: string;
  materials: string; finish: string; condition: string; colours: Colour[]; markings: string;
  text: { text: string; placement: string }[]; features: string[]; context: string;
}
export interface CharacterSpec {
  role: string; age: string; skinTone: Colour; face: string; hair: string; build: string;
  wardrobe: { item: string; colour: Colour; material?: string }[]; accessories: string[]; makeup: string; features: string[];
}
export interface LocationSpec {
  role: string; place: string; eraRegion: string; timeOfDay: string; lighting: string;
  palette: Colour[]; setPieces: string[]; textures: string; atmosphere: string; features: string[];
}
export type AssetSpec = PropSpec | CharacterSpec | LocationSpec;

/** JSON schema text the Director fills in (per kind). */
export function specSchema(kind: Asset["kind"]) {
  if (kind === "prop") return `{"role":"what the prop does in the story","objectType":"exact object type (brand-neutral)","design":"shape/silhouette/construction, brand-neutral","eraRegion":"e.g. Lagos 2020s","scale":"size in cm AND relative to a hand or person","materials":"materials + surface textures","finish":"matte/satin/gloss","condition":"new/used, wear, age, stains, dents","colours":[{"name":"","hex":"#RRGGBB","where":"which part"}],"markings":"scratches, stickers, stitching, patterns","text":[{"text":"EXACT spelling, or empty array if no text","placement":""}],"features":["distinctive features that must stay identical in every shot"],"context":"where/how it appears in the scene"}`;
  if (kind === "character") return `{"role":"","age":"","skinTone":{"name":"","hex":"#RRGGBB"},"face":"face shape, eyes, nose, lips, marks","hair":"style, length, colour","build":"height + build","wardrobe":[{"item":"","colour":{"name":"","hex":"#RRGGBB"},"material":""}],"accessories":["watch, jewellery, glasses…"],"makeup":"","features":["identity features that must never change"]}`;
  return `{"role":"","place":"","eraRegion":"","timeOfDay":"","lighting":"key light direction, colour temperature","palette":[{"name":"","hex":"#RRGGBB","where":""}],"setPieces":["fixed objects and their positions"],"textures":"","atmosphere":"","features":["details that must stay identical"]}`;
}

const STYLE_PRESET: Record<string, { look: string; camera: string }> = {
  realistic: { look: "photorealistic studio product photography, true-to-life colour, physically accurate materials", camera: "consistent 50mm lens at f/8, sharp focus front to back, eye-level, no distortion" },
  pixar: { look: "3D animated feature-film render (stylised CG), sculpted forms, subsurface and soft global illumination, clean shading", camera: "consistent 50mm virtual camera, sharp focus, orthographic-feeling views" },
  cartoon: { look: "clean 2D cartoon model sheet, flat colour fills with simple cel shadows, bold consistent outlines", camera: "flat front/side/back turnaround, consistent scale between views" },
  anime: { look: "anime model sheet, crisp line art, cel shading with one shadow tone, accurate colour swatches", camera: "flat turnaround views, consistent proportions between views" },
};
export function stylePreset(p: Project) { return STYLE_PRESET[p.style] || { look: p.customStyle || "cinematic, true-to-life colour", camera: "consistent 50mm lens, sharp focus" }; }

const GRID: Record<string, string> = { "16:9": "a 3×2 grid", "9:16": "a 2×3 grid (portrait)", "1:1": "a 3×2 grid", "4:5": "a 2×3 grid (portrait)" };
const cols = (c: Colour[] = []) => c.filter((x) => x?.hex || x?.name).map((x) => `${x.name}${x.hex ? ` ${x.hex}` : ""}${x.where ? ` (${x.where})` : ""}`).join(", ");
const NEG_PROP = "Avoid: extra or unrelated objects, duplicate copies beyond the labelled views, warped/misspelled/invented text, real brand logos, hands or fingers covering the object, cropped edges, motion blur, watermarks, signatures, captions other than small view labels.";

/** Product-style prop reference sheet prompt. `ad` = hero packshot preset for Product Ad mode. */
export function propSheetPrompt(p: Project, a: Asset, s: PropSpec, location?: string, notes = "") {
  const st = stylePreset(p); const ad = p.mode === "ad";
  const text = (s.text || []).filter((t) => t.text?.trim());
  return [
    `${ad ? "HERO PRODUCT REFERENCE SHEET" : "PROP REFERENCE SHEET"} of "${a.name}" — ${s.objectType}. Role: ${s.role}.`,
    `Layout: ${GRID[p.aspect] || "a 3×2 grid"} of panels on one sheet, each with a small view label: FRONT, THREE-QUARTER, SIDE, BACK, DETAIL CLOSE-UP (${(s.features || [])[0] || "key detail"}), and IN CONTEXT — the same object in ${location || s.context || "its scene location"} with a human hand or person beside it for scale.`,
    `Object: ${s.design}. Era/region: ${s.eraRegion}. Scale: ${s.scale}.`,
    `Materials & texture: ${s.materials}. Finish: ${s.finish}. Condition: ${s.condition}.`,
    cols(s.colours) && `Exact colours: ${cols(s.colours)}.`,
    s.markings && `Markings: ${s.markings}.`,
    text.length ? `Printed text, spelled EXACTLY (letter for letter, crisp and legible): ${text.map((t) => `"${t.text}" on ${t.placement}`).join("; ")}.` : "No text or logos anywhere on the object.",
    (s.features || []).length && `Identity features that must be identical in every panel: ${s.features.join("; ")}.`,
    ad
      ? "Lighting: packshot preset — large softbox key at 45°, fill card opposite, two strip rim lights for clean edge definition, subtle gradient seamless background, soft contact shadow and gentle reflection; label faces camera in the FRONT panel."
      : "Lighting: soft studio three-point lighting (key, fill, rim) on a neutral light-grey seamless background (context panel uses the scene's own light), true-to-life colour.",
    `Look: ${st.look}. Camera: ${st.camera}. Same object, same proportions and colours in every panel.`,
    notes && `Revision notes (apply these, keep everything else identical): ${notes}.`,
    NEG_PROP,
  ].filter(Boolean).join("\n");
}

export function characterSheetPrompt(p: Project, a: Asset, s: CharacterSpec, notes = "") {
  const st = stylePreset(p);
  return [
    `CHARACTER REFERENCE SHEET of ${a.name}. Role: ${s.role}.`,
    `Layout: ${GRID[p.aspect] || "a 3×2 grid"} — FRONT full body, THREE-QUARTER full body, PROFILE, BACK, FACE CLOSE-UP (neutral expression), and an EXPRESSION panel (smiling). Same person in every panel.`,
    `Identity: ${s.age}; skin tone ${cols([s.skinTone])}; face ${s.face}; hair ${s.hair}; build ${s.build}.`,
    (s.wardrobe || []).length && `Wardrobe (exact colours): ${s.wardrobe.map((w) => `${w.item} ${cols([w.colour])}${w.material ? `, ${w.material}` : ""}`).join("; ")}.`,
    (s.accessories || []).length && `Accessories: ${s.accessories.join(", ")}.`,
    s.makeup && `Makeup: ${s.makeup}.`,
    (s.features || []).length && `Never change: ${s.features.join("; ")}.`,
    "Neutral light-grey seamless background, soft three-point studio lighting, true-to-life skin tones.",
    `Look: ${st.look.replace("studio product photography", "character photography")}. Camera: ${st.camera}.`,
    notes && `Revision notes (apply, keep everything else identical): ${notes}.`,
    "Avoid: different faces between panels, extra people, changed outfit colours, extra limbs or fingers, text, watermarks.",
  ].filter(Boolean).join("\n");
}

export function locationSheetPrompt(p: Project, a: Asset, s: LocationSpec, notes = "") {
  const st = stylePreset(p);
  return [
    `LOCATION REFERENCE of ${a.name} (${s.place}, ${s.eraRegion}). Role: ${s.role}.`,
    `Wide establishing view at ${s.timeOfDay}; lighting: ${s.lighting}.`,
    cols(s.palette) && `Colour palette: ${cols(s.palette)}.`,
    (s.setPieces || []).length && `Fixed set pieces (keep positions): ${s.setPieces.join("; ")}.`,
    `Textures: ${s.textures}. Atmosphere: ${s.atmosphere}.`,
    (s.features || []).length && `Must stay identical: ${s.features.join("; ")}.`,
    `No people. Look: ${st.look.replace("studio product photography", "location photography")}. ${p.aspect} composition, consistent 35mm lens.`,
    notes && `Revision notes (apply, keep everything else identical): ${notes}.`,
    "Avoid: people, text, watermarks, warped architecture.",
  ].filter(Boolean).join("\n");
}

/** Compact lock line injected into every shot prompt and the continuity bible. */
export function specLine(a: Asset): string {
  const s = a.spec as AssetSpec | undefined;
  if (!s) return `${a.name} (${a.description}; ${a.details})`;
  if (a.kind === "prop") { const x = s as PropSpec; const t = (x.text || []).filter((q) => q.text?.trim()); return `${a.name} [PROP LOCK${a.locked ? "ED" : ""}]: ${x.objectType}; ${x.scale}; ${x.materials}, ${x.finish}; ${x.condition}; colours ${cols(x.colours)}${t.length ? `; text exactly ${t.map((q) => `"${q.text}"`).join(", ")}` : "; no text"}; keep: ${(x.features || []).join(", ")}`; }
  if (a.kind === "character") { const x = s as CharacterSpec; return `${a.name} [CHARACTER LOCK]: ${x.age}; skin ${cols([x.skinTone])}; ${x.face}; hair ${x.hair}; wearing ${(x.wardrobe || []).map((w) => `${w.item} ${cols([w.colour])}`).join(", ")}; ${(x.accessories || []).join(", ")}; keep: ${(x.features || []).join(", ")}`; }
  const x = s as LocationSpec; return `${a.name} [LOCATION LOCK]: ${x.place}, ${x.timeOfDay}, ${x.lighting}; palette ${cols(x.palette)}; set pieces ${(x.setPieces || []).join(", ")}`;
}

/** Offline fallback spec (demo mode / no LLM). */
export function mockSpec(p: Project, a: Asset): AssetSpec {
  if (a.kind === "prop") return { role: `${a.name} in the story`, objectType: a.name, design: a.description || a.name, eraRegion: "Lagos 2020s", scale: "fits in two hands; about the size of a forearm", materials: a.details || "as described", finish: "satin", condition: "used, light wear", colours: [], markings: "", text: [], features: [a.description || a.name], context: "the main scene location" };
  if (a.kind === "character") return { role: "", age: "", skinTone: { name: "", hex: "" }, face: a.description, hair: "", build: "", wardrobe: [], accessories: a.details ? [a.details] : [], makeup: "", features: [a.description] };
  return { role: "", place: a.name, eraRegion: "", timeOfDay: a.details || "day", lighting: "natural", palette: [], setPieces: [], textures: "", atmosphere: a.description, features: [] };
}
