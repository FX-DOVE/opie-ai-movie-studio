/** A genre skill: everything the writers' room, director, image/video prompts and continuity reviewer need to make one kind of film.
 *  Versioned so projects record which revision of the skill shaped them. All examples are original — no real titles, characters or actors. */
export type GenreId = "blockbuster" | "martial_comedy" | "commando" | "war_epic" | "kdrama_romcom" | "epic_fantasy" | "prison_break" | "nollywood";

export interface GenreSkill {
  id: GenreId;
  version: string;
  label: string;
  /** one line for the picker */
  short: string;
  /** default music bed (render.ts MUSIC keys) */
  music: "tension" | "upbeat" | "ambient";
  /** story spine: acts and beats, in order */
  structure: string[];
  archetypes: string[];
  dialogue: { rules: string[]; examples: string[] };
  shots: {
    lenses: string;
    moves: string;
    coverage: string[];
    /** framing per beat type — the director tags every shot with one of these keys */
    framing: Record<string, string>;
  };
  /** fights / stunts / battles, broken into readable beats */
  action?: string[];
  /** romance and comedy timing, reaction shots, two-shot/OTS patterns */
  romance?: string[];
  comedy?: string[];
  lighting: string;
  grade: string;
  sound: string;
  pacing: { shotSec: [number, number]; notes: string };
  /** reference/still look appended to image prompts */
  look: string;
  /** motion language appended to video-provider prompts */
  motion: string;
  failures: { risk: string; counter: string }[];
  checklist: string[];
  /** keywords for auto-detection from an idea or brainstorm */
  keywords: string[];
  /** few-shot: one original scene with shot notes */
  example: string;
}
