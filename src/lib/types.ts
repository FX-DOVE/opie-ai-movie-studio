export type Mode = "drama" | "documentary" | "ad";
export type Format = "yt_shorts" | "tiktok" | "fb_reels" | "yt_long";
export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";
export type VisualStyle = "realistic" | "pixar" | "cartoon" | "anime" | "custom";
export type OutputType = "image" | "video";

export interface ImageVersion { id: string; url: string; prompt: string; createdAt: string; source: "meta" | "mock" | "upload" }

export interface Asset {
  id: string;
  kind: "character" | "location" | "prop";
  name: string;
  description: string;
  details: string; // clothing/accessories for characters, time of day for locations
  voice?: string; // TTS voice for characters
  /** true once the user picked a voice by hand (otherwise ReelForge picks one from gender/age in the bible) */
  voiceManual?: boolean;
  images: ImageVersion[];
  activeImage?: string;
  /** structured reference spec expanded by the Director (exact colours/hex, scale, materials, label text…) */
  spec?: Record<string, unknown>;
  /** locked bible entry: spec + approved image are frozen and injected into every shot */
  locked?: boolean;
  /** approved reference (AI sheets are auto-approved when the review passes; uploads need a manual Approve) */
  approved?: boolean;
  refState?: "checking" | "fixing" | "passed" | "fixed" | "attention";
  refIssues?: string[];
}
/** Back-compat: older assets with an image and no flag count as approved; drafts with nothing don't count. */
export const isApproved = (a: Asset) => !!a.activeImage && (a.approved ?? true);
export const isDraft = (a: Asset) => !a.images.length && !a.description.trim();

export interface Shot {
  id: string;
  index: number;
  description: string;
  camera: string;
  dialogue?: string;
  speaker?: string;
  narration?: string;
  durationSec: number;
  assetIds: string[];
  startFrame: ImageVersion[];
  endFrame: ImageVersion[];
  activeStart?: string;
  activeEnd?: string;
  clipUrl?: string;
  clipProvider?: string;
  /** video job (queue with retries + provider fallback) */
  clipJob?: { state: "queued" | "running" | "done" | "failed"; provider?: string; attempt?: number; progress?: number; error?: string; estUsd?: number; updatedAt?: string };
  audioUrl?: string;
  continuity?: { ok: boolean; issues: string[]; checkedAt: string; source: string; fix?: string; state?: "checking" | "fixing" | "passed" | "fixed" | "attention"; attempts?: number };
  trimStart?: number;
  trimEnd?: number;
  /** set when the user picks a length by hand; otherwise the cut fits each shot to its voice line */
  durationLocked?: boolean;
  /** which TTS engine voiced this line ("none" = TTS unavailable) */
  audioProvider?: string;
  /** genre beat type from the film-style skill (establish, action, impact, dialogue, reaction…) */
  beat?: string;
  /** screen direction / axis note, e.g. "Ada frame-left looking right; moves L→R" */
  screen?: string;
  /** automatic dialogue-clarity check of the voiced line (speech-to-text round trip) */
  clarity?: { audio?: string; ok: boolean; wer?: number; cer?: number; heard?: string; wps?: number; issues: string[]; attempts: number; checkedAt: string; source: string };
}

export interface Scene { id: string; heading: string; summary: string; shots: Shot[] }

export interface Idea { title: string; logline: string; hook?: string; beats?: string[]; characters?: { name: string; description: string }[] }
export interface ChatMsg { role: "user" | "assistant"; content: string; at: string; provider?: string; ideas?: Idea[]; kind?: "note" | "research" }
export interface ResearchNote { id: string; goal: string; notes: string; at: string; provider?: string }

export interface RenderJob { status: "idle" | "queued" | "running" | "done" | "error"; progress: number; message: string; url?: string; updatedAt: string; review?: string; warnings?: string[]; srtUrl?: string; loudness?: number; jobId?: string; startedAt?: string; attempts?: number }

export interface MemoryNote { id: string; text: string; category: "genre" | "pacing" | "tone" | "visual" | "characters" | "wardrobe" | "voice" | "rejects" | "other"; at: string; source?: string; hits?: number }
export interface UserMemory { enabled: boolean; notes: MemoryNote[]; updatedAt?: string }

export interface Project {
  /** user id of the creator who owns this project ("admin" for legacy projects) */
  ownerId?: string;
  writing?: number; // set while a script is being written in the background
  id: string;
  title: string;
  mode: Mode;
  format: Format;
  aspect: Aspect;
  style: VisualStyle;
  customStyle?: string;
  /** film style / genre skill id (src/lib/genres); default "blockbuster" */
  filmStyle?: string;
  /** true once the user picked the film style; otherwise Muse may pick it from the idea/brainstorm */
  filmStyleManual?: boolean;
  /** how the story is voiced: character dialogue or a narrator voice-over (agent/user choice) */
  voiceMode?: "dialogue" | "narration";
  /** "<id>@<version>" of the genre skill that last shaped the script/storyboard */
  genreSkill?: string;
  outputType: OutputType;
  /** Video mode: provider id from Admin → Video providers ("auto" = fallback order) */
  videoProvider?: string;
  idea: string;
  script: string;
  brainstorm: ChatMsg[];
  research?: ResearchNote[];
  assets: Asset[];
  scenes: Scene[];
  bible: string;
  narratorVoice: string;
  music: string; // "none" | "ambient" | "tension" | "upbeat"
  subtitles: boolean;
  render: RenderJob;
  editLog: ChatMsg[];
  cover?: string;
  createdAt: string;
  updatedAt: string;
}

export const FORMATS: Record<Format, { label: string; aspect: Aspect; maxSec: number }> = {
  yt_shorts: { label: "YouTube Shorts", aspect: "9:16", maxSec: 60 },
  tiktok: { label: "TikTok", aspect: "9:16", maxSec: 180 },
  fb_reels: { label: "Facebook Reels", aspect: "9:16", maxSec: 90 },
  yt_long: { label: "YouTube Video", aspect: "16:9", maxSec: 1200 },
};

export const STYLES: Record<VisualStyle, string> = {
  realistic: "photorealistic cinematic film still, natural skin texture, anamorphic lens, shallow depth of field",
  pixar: "Feature-quality 3D animation, soft global illumination, expressive stylised characters",
  cartoon: "2D cartoon illustration, bold clean outlines, flat vibrant colours",
  anime: "anime key visual, cel shading, detailed backgrounds, dramatic lighting",
  custom: "",
};

export const MODES: Record<Mode, string> = { drama: "Drama / Filmmaking", documentary: "Documentary", ad: "Product Ad" };

export function aspectSize(a: Aspect, long = 1280): { w: number; h: number } {
  const [x, y] = a.split(":").map(Number);
  if (x >= y) return { w: long, h: Math.round((long * y) / x / 2) * 2 };
  return { w: Math.round((long * x) / y / 2) * 2, h: long };
}
