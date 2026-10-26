import { db } from "./db";
import { decrypt, encrypt, mask } from "./crypto";

export interface FieldDef { key: string; label: string; secret: boolean; group: string; help?: string; options?: string[]; default?: string; env?: string }

// Everything an admin can configure. Secrets are AES-256-GCM encrypted at rest and never sent to the browser.
export const FIELDS: FieldDef[] = [
  { key: "META_API_KEY", label: "Meta Model API key", secret: true, group: "Meta Model API", env: "META_API_KEY", help: "dev.meta.ai → API keys. Enables live Muse Spark / Wonder / Image." },
  { key: "META_BASE_URL", label: "Base URL", secret: false, group: "Meta Model API", default: "https://api.meta.ai/v1", env: "META_BASE_URL" },
  { key: "META_TEXT_MODEL", label: "Writer / checker model", secret: false, group: "Meta Model API", default: "muse-spark-1.3", options: ["muse-spark-1.3", "muse-wonder-1.0"] },
  { key: "META_AGENT_MODEL", label: "Director / computer-use model", secret: false, group: "Meta Model API", default: "muse-wonder-1.0", options: ["muse-wonder-1.0", "muse-spark-1.3"] },
  { key: "META_IMAGE_MODEL", label: "Image model", secret: false, group: "Meta Model API", default: "muse-image-1.0" },
  { key: "LLM_PRIMARY", label: "Which AI answers", secret: false, group: "AI brain (provider chain)", default: "auto", options: ["auto", "meta", "fallback"], help: "auto = Meta Muse when a Meta key is set, otherwise the fallback. If Meta errors, the fallback answers." },
  { key: "FALLBACK_BASE_URL", label: "Fallback base URL (OpenAI-compatible)", secret: false, group: "AI brain (provider chain)", default: "https://api.x.ai/v1", help: "xAI Grok, OpenAI, OpenRouter, Groq, Together, local Ollama… any /chat/completions API." },
  { key: "FALLBACK_API_KEY", label: "Fallback API key", secret: true, group: "AI brain (provider chain)", env: "FALLBACK_API_KEY", help: "Leave empty to reuse the xAI key below." },
  { key: "FALLBACK_MODEL", label: "Fallback text model", secret: false, group: "AI brain (provider chain)", default: "grok-4-fast-non-reasoning" },
  { key: "FALLBACK_VISION_MODEL", label: "Fallback vision model (screenshots)", secret: false, group: "AI brain (provider chain)", default: "grok-4-fast-non-reasoning" },
  { key: "VIDEO_PROVIDER", label: "Video provider", secret: false, group: "Video (first → last frame)", default: "mock", options: ["mock", "veo"] },
  { key: "GEMINI_API_KEY", label: "Google Gemini API key (Veo 3.1)", secret: true, group: "Video (first → last frame)", env: "GEMINI_API_KEY" },
  { key: "VEO_MODEL", label: "Veo model", secret: false, group: "Video (first → last frame)", default: "veo-3.1-generate-preview" },
  { key: "TTS_PROVIDER", label: "Voice provider", secret: false, group: "Voiceover (TTS)", default: "edge", options: ["edge", "elevenlabs", "xai", "openai-compatible"] },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs API key", secret: true, group: "Voiceover (TTS)", env: "ELEVENLABS_API_KEY" },
  { key: "XAI_API_KEY", label: "xAI API key", secret: true, group: "Voiceover (TTS)", env: "XAI_API_KEY" },
  { key: "TTS_COMPAT_URL", label: "OpenAI-compatible TTS base URL", secret: false, group: "Voiceover (TTS)" },
  { key: "TTS_COMPAT_KEY", label: "OpenAI-compatible TTS key", secret: true, group: "Voiceover (TTS)" },
  { key: "DEFAULT_NARRATOR", label: "Default narrator voice (Edge)", secret: false, group: "Voiceover (TTS)", default: "en-US-AndrewNeural" },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API key", secret: true, group: "Research agent", env: "YOUTUBE_API_KEY" },
  { key: "YOUTUBE_REGION", label: "Trending region", secret: false, group: "Research agent", default: "NG" },
  { key: "E2B_API_KEY", label: "E2B API key (optional cloud desktop)", secret: true, group: "Research agent", env: "E2B_API_KEY" },
  { key: "RESEARCH_MAX_STEPS", label: "Max agent steps", secret: false, group: "Research agent", default: "12" },
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
    video: getConfig("VIDEO_PROVIDER") === "veo" && !!getConfig("GEMINI_API_KEY"),
    tts: getConfig("TTS_PROVIDER") || "edge",
    youtube: !!getConfig("YOUTUBE_API_KEY"),
  };
}

export function fallbackKey() { return getConfig("FALLBACK_API_KEY") || (/x\.ai/.test(getConfig("FALLBACK_BASE_URL") || "") ? getConfig("XAI_API_KEY") : undefined); }
export function fallbackName() {
  const u = getConfig("FALLBACK_BASE_URL") || "";
  return /x\.ai/.test(u) ? "xAI Grok" : /openai\.com/.test(u) ? "OpenAI" : /openrouter/.test(u) ? "OpenRouter" : /groq/.test(u) ? "Groq" : /localhost|127\.0/.test(u) ? "Local LLM" : "OpenAI-compatible";
}
/** Ordered provider chain actually usable right now. */
export function llmChain(): ("meta" | "fallback")[] {
  const meta = !!getConfig("META_API_KEY"), fb = !!fallbackKey();
  const pref = getConfig("LLM_PRIMARY") || "auto";
  const order: ("meta" | "fallback")[] = pref === "fallback" ? ["fallback", "meta"] : ["meta", "fallback"];
  return order.filter((x) => (x === "meta" ? meta : fb));
}
export function llmLabel() { const c = llmChain()[0]; return c === "meta" ? "Meta Muse" : c === "fallback" ? fallbackName() : "demo"; }
