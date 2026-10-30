import { db } from "./db";
import { decrypt, encrypt, mask } from "./crypto";

export interface FieldDef { key: string; label: string; secret: boolean; group: string; help?: string; options?: string[]; default?: string; env?: string }

// Everything an admin can configure. Secrets are AES-256-GCM encrypted at rest and never sent to the browser.
export const FIELDS: FieldDef[] = [
  { key: "META_ONLY", label: "Meta models only (hackathon rules)", secret: false, group: "Hackathon rules", default: "on", options: ["on", "off"], env: "META_ONLY", help: "ON: every model called at runtime is a Meta model (Muse Spark / Muse Wonder / Muse Image, plus Meta's open Muse Spark weights on Baseten). Non-Meta LLM fallbacks and third-party video models are disabled; video is made with local FFmpeg motion (Ken Burns, parallax, crossfades) over Muse Image stills. The code is kept behind this flag." },
  { key: "META_API_KEY", label: "Meta Model API key", secret: true, group: "Meta Model API", env: "META_API_KEY", help: "dev.meta.ai → API keys. Enables live Muse Spark / Wonder / Image." },
  { key: "META_BASE_URL", label: "Base URL", secret: false, group: "Meta Model API", default: "https://api.meta.ai/v1", env: "META_BASE_URL" },
  { key: "META_TEXT_MODEL", label: "General model (chat, extraction)", secret: false, group: "Meta Model API", default: "muse-spark-1.3", options: ["muse-spark-1.3", "muse-wonder-1.0"] },
  { key: "META_DIRECTOR_MODEL", label: "Director model on Meta (brainstorm/script when Baseten is unavailable)", secret: false, group: "Meta Model API", default: "muse-spark-1.3", options: ["muse-spark-1.3", "muse-wonder-1.0"], help: "Muse Spark 1.3 is the reliable default. Contributor mode (below) replaces it only when you opt in." },
  { key: "META_CONTRIBUTOR_MODE", label: "Contributor mode (opt-in)", secret: false, group: "Meta Model API", default: "off", options: ["off", "on"], help: "OFF by default and never auto-selected. When ON (and the access test passes) Director + general text use muse-spark-1.3-contributor. Meta may use those inputs for training; only available in select countries. Every project shows a notice while it is on." },
  { key: "META_CONTRIBUTOR_OK", label: "Contributor access (set by “Check contributor access”)", secret: false, group: "Meta Model API", default: "unknown", options: ["unknown", "yes", "no"] },
  { key: "META_REVIEW_MODEL", label: "Continuity / vision review model", secret: false, group: "Meta Model API", default: "muse-spark-1.3", options: ["muse-spark-1.3", "muse-wonder-1.0"] },
  { key: "META_AGENT_MODEL", label: "Computer-use & Reel agent model", secret: false, group: "Meta Model API", default: "muse-spark-1.3", options: ["muse-spark-1.3", "muse-wonder-1.0"], help: "Drives Reel’s computer with Meta’s native computer tool." },
  { key: "META_ESCALATE_MODEL", label: "Escalate hard tasks to", secret: false, group: "Meta Model API", default: "muse-wonder-1.0", options: ["muse-wonder-1.0", "none"], help: "ON by default: Muse Spark 1.3 runs first; if it errors, gets stuck repeatedly, or the task is flagged complex, the task is handed to muse-wonder-1.0. Every escalation is logged below with its reason, tokens and cost." },
  { key: "CU_ESCALATE_AFTER", label: "Escalate after N stuck/failed steps", secret: false, group: "Meta Model API", default: "3" },
  { key: "CU_COMPLEX_AUTO", label: "Auto-flag complex tasks (start on the escalation model)", secret: false, group: "Meta Model API", default: "on", options: ["on", "off"], help: "A task is flagged complex when the caller marks it so, or its brief is long (>700 chars) / has 3+ chained steps (then / after that / next)." },
  { key: "CU_SAFETY_ACK", label: "Meta safety checks during computer use", secret: false, group: "Meta Model API", default: "allowlist", options: ["allowlist", "never"], help: "allowlist = acknowledge only generic checks while on the research sites below (never when typing personal data or on sign-in/payment checks); never = always stop and hand control to you." },
  { key: "CU_SAFE_DOMAINS", label: "Research sites where generic safety checks may be acknowledged", secret: false, group: "Meta Model API", default: "youtube.com,google.com,wikipedia.org,example.com,bing.com,duckduckgo.com" },
  { key: "CU_MAX_STEPS", label: "Computer-use step cap per task", secret: false, group: "Meta Model API", default: "12" },
  { key: "CU_SHOT_WIDTH", label: "Screenshot width sent to the model (px)", secret: false, group: "Meta Model API", default: "1024", options: ["768", "1024", "1280"] },
  { key: "CU_HISTORY", label: "Screenshots kept in context", secret: false, group: "Meta Model API", default: "4" },
  { key: "SAM_ENABLED", label: "SAM 3.1 person segmentation in continuity checks", secret: false, group: "Meta Model API", default: "off", options: ["off", "on"], help: "Segments/tracks each person within a frame or clip so the reviewer can isolate that character (crop) for the Spark vision review. It does not by itself guarantee the same identity across separately generated scenes — that comes from the character bible + approved reference images + the Muse Spark vision review." },
  { key: "META_IMAGE_MODEL", label: "Image model", secret: false, group: "Meta Model API", default: "muse-image-1.0" },
  { key: "PRICE_SPARK", label: "muse-spark-1.3 — USD per 1M tokens (input / cached input / output)", secret: false, group: "Pricing (cost estimates)", default: "1.25/0.15/4.25", help: "Used only to estimate costs in the usage log. Check your Meta billing page and edit if they differ." },
  { key: "PRICE_WONDER", label: "muse-wonder-1.0 — USD per 1M tokens (in / cached / out)", secret: false, group: "Pricing (cost estimates)", default: "4/0.2/20" },
  { key: "PRICE_CONTRIBUTOR", label: "muse-spark-1.3-contributor — USD per 1M tokens (in / cached / out)", secret: false, group: "Pricing (cost estimates)", default: "0.1/0.002/0.2" },
  { key: "PRICE_IMAGE", label: "muse-image-1.0 — USD per image", secret: false, group: "Pricing (cost estimates)", default: "0.01" },
  { key: "PRICE_SAM", label: "sam-3.1 — USD per image", secret: false, group: "Pricing (cost estimates)", default: "0.0025" },
  { key: "PRICE_BASETEN", label: "Baseten Director — USD per 1M tokens (in / cached / out), blank = not priced", secret: false, group: "Pricing (cost estimates)" },
  { key: "BASETEN_API_KEY", label: "Baseten API key", secret: true, group: "Baseten (Director model)", env: "BASETEN_API_KEY", help: "baseten.co → API keys. OpenAI-compatible Model API." },
  { key: "BASETEN_BASE_URL", label: "Base URL", secret: false, group: "Baseten (Director model)", default: "https://inference.baseten.co/v1", env: "BASETEN_BASE_URL" },
  { key: "BASETEN_MODEL", label: "Director model", secret: false, group: "Baseten (Director model)", default: "meta-models/muse-spark-open-1026", env: "BASETEN_MODEL" },
  { key: "ROUTE_DIRECTOR", label: "Director — brainstorm, script, character bible, shot list, video prompts", secret: false, group: "Task routing", default: "baseten", options: ["baseten", "meta", "fallback", "auto"], help: "baseten = Baseten muse-spark-open first, then Meta (muse-spark-1.3; contributor only if you opted in), then OmniRoute." },
  { key: "ROUTE_REVIEW", label: "Reviewer — script review & continuity checks (vision)", secret: false, group: "Task routing", default: "meta", options: ["meta", "baseten", "fallback", "auto"] },
  { key: "ROUTE_AGENT", label: "Agent — Reel chat & computer use", secret: false, group: "Task routing", default: "meta", options: ["meta", "baseten", "fallback", "auto"], help: "With a Meta key the desktop agent uses Meta’s native computer-use tool: Muse Spark 1.3 first, escalating to Muse Wonder when needed." },
  { key: "AUTO_CONTINUITY", label: "Automatic continuity review & fix", secret: false, group: "Continuity", default: "on", options: ["on", "off"], help: "After shots are generated (or one is regenerated), every shot is reviewed against the character/prop/location bibles; failures are auto-fixed with a Muse Image edit and re-checked." },
  { key: "CONTINUITY_RETRIES", label: "Auto-fix attempts per shot", secret: false, group: "Continuity", default: "2", options: ["0", "1", "2", "3"], help: "After this many failed fixes the shot is marked “Needs attention” with the reason." },
  { key: "LLM_PRIMARY", label: "Which AI answers", secret: false, group: "AI brain (provider chain)", default: "auto", options: ["auto", "meta", "fallback"], help: "auto = Meta Muse when a Meta key is set, otherwise the fallback. If Meta errors, the fallback answers." },
  { key: "FALLBACK_BASE_URL", label: "Fallback base URL (OpenAI-compatible)", secret: false, group: "AI brain (provider chain)", default: "https://api.x.ai/v1", help: "Disabled under the hackathon rules (Meta models only) while META_ONLY is on. xAI Grok, OpenAI, OpenRouter, Groq, Together, local Ollama… any /chat/completions API." },
  { key: "FALLBACK_API_KEY", label: "Fallback API key", secret: true, group: "AI brain (provider chain)", env: "FALLBACK_API_KEY", help: "Disabled under the hackathon rules (Meta models only) while META_ONLY is on. Leave empty to reuse the xAI key below." },
  { key: "FALLBACK_MODEL", label: "Fallback text model", secret: false, group: "AI brain (provider chain)", default: "grok-4-fast-non-reasoning" , help: "Disabled under the hackathon rules (Meta models only) while META_ONLY is on."},
  { key: "FALLBACK_VISION_MODEL", label: "Fallback vision model (screenshots)", secret: false, group: "AI brain (provider chain)", default: "grok-4-fast-non-reasoning" , help: "Disabled under the hackathon rules (Meta models only) while META_ONLY is on."},
  { key: "VIDEO_RETRIES", label: "Retries per video provider before falling back to the next", secret: false, group: "Video (first → last frame)", default: "1", options: ["0", "1", "2", "3"], help: "Providers, keys, models and fallback order are managed in Admin → Video providers." },
  { key: "VIDEO_PROVIDER", label: "Legacy video provider (pre-multi-provider)", secret: false, group: "Video (first → last frame)", default: "mock", options: ["mock", "veo"] },
  { key: "GEMINI_API_KEY", label: "Google Gemini API key (Veo 3.1)", secret: true, group: "Video (first → last frame)", env: "GEMINI_API_KEY" },
  { key: "VEO_MODEL", label: "Veo model", secret: false, group: "Video (first → last frame)", default: "veo-3.1-generate-preview" },
  { key: "TTS_PROVIDER", label: "Voice provider", secret: false, group: "Voiceover (TTS)", default: "meta-mms", options: ["meta-mms"], help: "Meta MMS-TTS, self-hosted. Offline fallback: espeak-ng (system voice, not an AI model)." },
  
  { key: "XAI_API_KEY", label: "xAI API key", secret: true, group: "Voiceover (TTS)", env: "XAI_API_KEY" },
  { key: "TTS_COMPAT_URL", label: "OpenAI-compatible TTS base URL", secret: false, group: "Voiceover (TTS)" },
  { key: "TTS_COMPAT_KEY", label: "OpenAI-compatible TTS key", secret: true, group: "Voiceover (TTS)" },
  { key: "DEFAULT_NARRATOR", label: "Default narrator voice (Edge)", secret: false, group: "Voiceover (TTS)", default: "en-US-AndrewNeural" },
  { key: "VOICE_FEMALE", label: "Default voice for women", secret: false, group: "Voiceover (TTS)", default: "en-NG-EzinneNeural", help: "Characters the bible describes as female get this voice (others in the cast rotate through similar voices so everyone sounds distinct)." },
  { key: "VOICE_MALE", label: "Default voice for men", secret: false, group: "Voiceover (TTS)", default: "en-NG-AbeoNeural" },
  { key: "VOICE_CHILD", label: "Default voice for children", secret: false, group: "Voiceover (TTS)", default: "en-US-AnaNeural" },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API key", secret: true, group: "Research agent", env: "YOUTUBE_API_KEY" },
  { key: "YOUTUBE_REGION", label: "Trending region", secret: false, group: "Research agent", default: "NG" },
  { key: "E2B_API_KEY", label: "E2B API key (optional cloud desktop)", secret: true, group: "Research agent", env: "E2B_API_KEY" },
  { key: "AUTO_RESEARCH", label: "Auto-research topics while brainstorming", secret: false, group: "Research agent", default: "on", options: ["on", "off"], help: "When you brainstorm a concrete topic, Reel searches YouTube + Google on its computer and feeds a summary back." },
  { key: "RESEARCH_MAX_STEPS", label: "Max agent steps", secret: false, group: "Research agent", default: "12" },
  { key: "R2_ENABLED", label: "Enable R2", secret: false, group: "Storage (Cloudflare R2)", default: "off", options: ["off", "on"], env: "R2_ENABLED", help: "on = new media is served from R2 via presigned URLs; off (or missing keys) = local disk. Switches live." },
  { key: "R2_ACCOUNT_ID", label: "Account ID", secret: false, group: "Storage (Cloudflare R2)", default: "5e3ffff9e6e200b628fd7e28fad77a07", env: "R2_ACCOUNT_ID" },
  { key: "R2_ACCESS_KEY_ID", label: "Access Key ID", secret: true, group: "Storage (Cloudflare R2)", env: "R2_ACCESS_KEY_ID" },
  { key: "R2_SECRET_ACCESS_KEY", label: "Secret Access Key", secret: true, group: "Storage (Cloudflare R2)", env: "R2_SECRET_ACCESS_KEY", help: "Stored encrypted on the server; never shown again." },
  { key: "R2_BUCKET", label: "Bucket", secret: false, group: "Storage (Cloudflare R2)", default: "cineforge", env: "R2_BUCKET" },
  { key: "R2_ENDPOINT", label: "Endpoint", secret: false, group: "Storage (Cloudflare R2)", default: "https://5e3ffff9e6e200b628fd7e28fad77a07.r2.cloudflarestorage.com", env: "R2_ENDPOINT", help: "Auto-filled from the Account ID." },
  { key: "R2_PUBLIC_URL", label: "Public URL base (optional)", secret: false, group: "Storage (Cloudflare R2)", env: "R2_PUBLIC_URL", help: "e.g. https://media.example.com or the bucket’s r2.dev URL — used instead of presigned links." },
];

export function getConfig(key: string): string | undefined {
  const f = FIELDS.find((x) => x.key === key);
  const raw = db.getSetting(key);
  if (raw) {
    try { return f?.secret ? decrypt(raw) : raw; } catch { /* rotated secret */ }
  }
  if (f?.env && process.env[f.env]) return process.env[f.env];
  if (process.env[key]) return process.env[key];
  return f?.default;
}

export async function setConfig(key: string, value: string | null) {
  const f = FIELDS.find((x) => x.key === key);
  if (!f) throw new Error("unknown key");
  if (value === null || value === "") return db.setSetting(key, undefined);
  return db.setSetting(key, f.secret ? encrypt(value) : value);
}

/** Admin-safe view: secrets masked, never the plaintext. */
export function configView() {
  return FIELDS.map((f) => {
    const v = getConfig(f.key);
    const stored = !!db.getSetting(f.key);
    return { ...f, set: !!v && v !== f.default ? true : !!v, source: stored ? "admin" : v ? (v === f.default ? "default" : "env") : "unset", value: f.secret ? (v ? mask(v) : "") : v || "" };
  });
}

export function liveStatus() {
  return {
    meta: !!getConfig("META_API_KEY"),
    llm: llmLabel(),
    video: hasVideoProvider(),
    tts: getConfig("TTS_PROVIDER") || "meta-mms",
    youtube: !!getConfig("YOUTUBE_API_KEY"),
    contributor: contributorOn(),
  };
}

export function fallbackKey() { return getConfig("FALLBACK_API_KEY") || (/x\.ai/.test(getConfig("FALLBACK_BASE_URL") || "") ? getConfig("XAI_API_KEY") : undefined); }
export function fallbackName() {
  const u = getConfig("FALLBACK_BASE_URL") || "";
  return /x\.ai/.test(u) ? "xAI Grok" : /openai\.com/.test(u) ? "OpenAI" : /openrouter/.test(u) ? "OpenRouter" : /groq/.test(u) ? "Groq" : /omniroute|:20127/.test(u) ? "OmniRoute" : /localhost|127\.0/.test(u) ? "Local LLM" : "OpenAI-compatible";
}
export type Provider = "meta" | "baseten" | "fallback";
export type LlmTask = "director" | "review" | "agent" | "general";
/** Hackathon rules: only Meta models at runtime (on by default). */
export const metaOnly = () => (getConfig("META_ONLY") || "on") !== "off";
export const META_ONLY_NOTE = "Disabled under the hackathon rules (Meta models only).";
const isMetaModel = (m?: string) => /muse|^meta-models\/|llama/i.test(m || "");
export const providerLive = (x: Provider) => (x === "meta" ? !!getConfig("META_API_KEY")
  : x === "baseten" ? !!getConfig("BASETEN_API_KEY") && (!metaOnly() || isMetaModel(getConfig("BASETEN_MODEL") || "meta-models/muse-spark-open-1026"))
  : !metaOnly() && !!fallbackKey());
/** Ordered provider chain actually usable right now, per task (Admin → Task routing). Missing keys drop out; the fallback (OmniRoute) is last unless chosen. */
export function llmChain(task: LlmTask = "general"): Provider[] {
  const pref = task === "general" ? getConfig("LLM_PRIMARY") || "auto" : getConfig("ROUTE_" + task.toUpperCase()) || "auto";
  const order: Provider[] = pref === "fallback" ? ["fallback", "meta", "baseten"] : pref === "baseten" ? ["baseten", "meta", "fallback"] : pref === "meta" ? ["meta", "baseten", "fallback"] : ["meta", "baseten", "fallback"];
  return order.filter(providerLive);
}
export const providerName = (x?: Provider) => (x === "meta" ? "Meta Muse" : x === "baseten" ? "Baseten" : x === "fallback" ? fallbackName() : "demo");
export function llmLabel(task: LlmTask = "general") { return providerName(llmChain(task)[0]); }

/** Contributor mode is strictly opt-in: Admin toggle ON *and* the access check passed. Never auto-selected. */
export const contributorOn = () => !!getConfig("META_API_KEY") && getConfig("META_CONTRIBUTOR_MODE") === "on" && getConfig("META_CONTRIBUTOR_OK") === "yes";

/** true when a real (non-demo) video provider is configured — read lazily to avoid an import cycle */
function hasVideoProvider() {
  try { const raw = db.getSetting("VIDEO_PROVIDERS"); const list = raw ? (JSON.parse(raw) as { id: string; type: string; enabled: boolean }[]) : []; if (metaOnly()) return false; return list.some((p) => p.enabled && p.type !== "mock" && (p.type === "ltx-comfy" || !!db.getSetting("VIDEO_KEY_" + p.id))) || (getConfig("VIDEO_PROVIDER") === "veo" && !!getConfig("GEMINI_API_KEY")); } catch { return false; }
}
