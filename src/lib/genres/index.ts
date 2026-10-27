import { blockbuster } from "./blockbuster";
import { martialComedy } from "./martial_comedy";
import { commando } from "./commando";
import { warEpic } from "./war_epic";
import { kdramaRomcom } from "./kdrama_romcom";
import { epicFantasy } from "./epic_fantasy";
import { prisonBreak } from "./prison_break";
import { nollywood } from "./nollywood";
import { COMMON_FAILURES, DIALOGUE_RULES, SPATIAL_RULES } from "./common";
import type { GenreId, GenreSkill } from "./types";

export type { GenreId, GenreSkill } from "./types";
export { DIALOGUE_RULES, SPATIAL_RULES } from "./common";

export const GENRES: Record<GenreId, GenreSkill> = {
  blockbuster, martial_comedy: martialComedy, commando, war_epic: warEpic, kdrama_romcom: kdramaRomcom, epic_fantasy: epicFantasy, prison_break: prisonBreak, nollywood,
};
export const GENRE_IDS = Object.keys(GENRES) as GenreId[];
export const DEFAULT_GENRE: GenreId = "blockbuster";
export const isGenre = (x: unknown): x is GenreId => typeof x === "string" && x in GENRES;

/** For the picker (client-safe: plain data). */
export const GENRE_OPTIONS = GENRE_IDS.map((id) => ({ id, label: GENRES[id].label, short: GENRES[id].short }));

/** Keyword guess from an idea/brainstorm; undefined when nothing clearly matches. */
export function detectGenre(text: string): GenreId | undefined {
  const t = ` ${text.toLowerCase()} `;
  let best: { id: GenreId; n: number } | undefined;
  for (const g of Object.values(GENRES)) {
    const n = g.keywords.reduce((s, k) => s + (t.includes(k) ? (k.includes(" ") ? 2 : 1) : 0), 0);
    if (n && (!best || n > best.n)) best = { id: g.id, n };
  }
  return best?.id;
}

interface HasGenre { filmStyle?: string; idea?: string; title?: string; mode?: string }
/** The skill a project uses: its chosen film style, else a keyword guess, else the default (American blockbuster). */
export function genreOf(p: HasGenre): GenreSkill {
  if (isGenre(p.filmStyle)) return GENRES[p.filmStyle];
  return GENRES[detectGenre(`${p.title || ""} ${p.idea || ""}`) || DEFAULT_GENRE];
}

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export type GenrePurpose = "brainstorm" | "script" | "director" | "image" | "video" | "continuity";
/** The slice of a genre skill each agent loads. Image and video slices stay short — they're appended to every prompt. */
export function genreBrief(g: GenreSkill, purpose: GenrePurpose): string {
  const head = `FILM STYLE SKILL: ${g.label} (v${g.version}) — ${g.short}.`;
  switch (purpose) {
    case "brainstorm":
      return `${head}\nDevelop ideas that fit this genre's spine:\n${list(g.structure)}\nTypical characters:\n${list(g.archetypes)}\nNever reuse existing film titles, franchises, characters or real actors — everything original.`;
    case "script":
      return `${head}
STORY STRUCTURE (follow these beats in order, compressed to the runtime):
${list(g.structure)}
CHARACTER ARCHETYPES (adapt, don't copy):
${list(g.archetypes)}
DIALOGUE STYLE:
${list(g.dialogue.rules)}
Example lines in the house voice (original; match the tone, never reuse them):
${list(g.dialogue.examples)}
DIALOGUE CLARITY (required — every line is voiced by TTS and subtitled):
${list(DIALOGUE_RULES)}
${g.action ? `ACTION WRITING:\n${list(g.action)}\n` : ""}${g.romance ? `ROMANCE BEATS:\n${list(g.romance)}\n` : ""}${g.comedy ? `COMEDY TIMING:\n${list(g.comedy)}\n` : ""}PACING: ${g.pacing.notes}
Never use existing film titles, franchises, characters or real actors' names.
EXAMPLE SCENE (format and density reference only):
${g.example}`;
    case "director":
      return `${head}
SHOT GRAMMAR — lenses: ${g.shots.lenses}
Camera moves: ${g.shots.moves}
Coverage pattern per scene:
${list(g.shots.coverage)}
Framing per beat type (tag each shot's "beat" with one of: ${Object.keys(g.shots.framing).join(", ")}):
${Object.entries(g.shots.framing).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
SPATIAL CONTINUITY:
${list(SPATIAL_RULES)}
${g.action ? `ACTION / FIGHT CHOREOGRAPHY (split into short readable beats, one action per shot):\n${list(g.action)}\n` : ""}${g.romance ? `ROMANCE / TWO-SHOT & OTS PATTERNS:\n${list(g.romance)}\n` : ""}${g.comedy ? `COMEDIC TIMING:\n${list(g.comedy)}\n` : ""}LIGHTING: ${g.lighting}
COLOUR GRADE: ${g.grade}
SOUND & MUSIC: ${g.sound}
PACING: shots ${g.pacing.shotSec[0]}–${g.pacing.shotSec[1]} s. ${g.pacing.notes}
DIALOGUE: one speaker per shot, lines of 4–14 words; split longer speeches across shots with a reaction in between.
AI-VIDEO FAILURE MODES TO DESIGN AROUND:
${[...g.failures, ...COMMON_FAILURES].map((f) => `- ${f.risk} → ${f.counter}`).join("\n")}
EXAMPLE (shot notes show the expected density):
${g.example}`;
    case "image":
      return `${g.look}. Lighting: ${g.lighting.split(",")[0]}. Grade: ${g.grade.split(",")[0]}.`;
    case "video":
      return `${g.motion}. ${g.failures.slice(0, 2).map((f) => f.counter).join(" ")}`;
    case "continuity":
      return `GENRE CONTINUITY CHECKLIST (${g.label}) — flag any violation:\n${list(g.checklist)}\nAlso check: ${SPATIAL_RULES.slice(0, 3).map((r) => r.split(":")[0]).join("; ")}; exact headcount; no extra limbs or merged bodies; same face as the reference sheet.`;
  }
}
