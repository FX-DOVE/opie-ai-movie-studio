import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getConfig } from "../config";
import { record } from "../usage";
import { ffmpeg, probeDuration } from "../ffmpeg";

/**
 * Pluggable text-to-speech. Default: Microsoft Edge neural voices (free). ElevenLabs / xAI / OpenAI-compatible slots are configured in Admin.
 *
 * Robustness: every line is split into short sentence chunks, each chunk is synthesized with a hard timeout and up to
 * 3 attempts (fresh connection, backoff), chunks are concatenated with ffmpeg, and if the primary engine still fails we
 * fall through the other configured engines and finally an offline voice (espeak-ng) — so a flaky TTS socket never fails a render.
 */
export interface TTSProvider { id: string; synth(text: string, voice: string, outFile: string): Promise<void> }

export const EDGE_VOICES = [
  { id: "en-US-AndrewNeural", label: "Andrew · US · warm narrator" },
  { id: "en-US-AriaNeural", label: "Aria · US · bright" },
  { id: "en-GB-RyanNeural", label: "Ryan · UK · documentary" },
  { id: "en-GB-SoniaNeural", label: "Sonia · UK · calm" },
  { id: "en-NG-AbeoNeural", label: "Abeo · Nigeria · male" },
  { id: "en-NG-EzinneNeural", label: "Ezinne · Nigeria · female" },
  { id: "en-US-GuyNeural", label: "Guy · US · ad read" },
  { id: "en-US-JennyNeural", label: "Jenny · US · friendly" },
  { id: "en-KE-ChilembaNeural", label: "Chilemba · Kenya · male" },
  { id: "en-ZA-LeahNeural", label: "Leah · South Africa · female" },
  { id: "en-US-AnaNeural", label: "Ana · US · child" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms); })]).finally(() => clearTimeout(t));
}
const fetchT = (url: string, init: RequestInit, ms = 45_000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

const edge: TTSProvider = {
  id: "edge",
  async synth(text, voice, outFile) {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 10_000, synthesisTimeoutMs: 20_000 } as never);
    const dir = fs.mkdtempSync(path.join(path.dirname(outFile), ".tts-"));
    try {
      await withTimeout(tts.setMetadata(voice || "en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3), 15_000, "Edge TTS connect");
      const { audioFilePath } = await withTimeout(tts.toFile(dir, text), 40_000, "Edge TTS synthesis");
      fs.renameSync(audioFilePath, outFile);
    } finally {
      try { tts.close(); } catch { /* already closed */ }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

const elevenlabs: TTSProvider = {
  id: "elevenlabs",
  async synth(text, voice, outFile) {
    const id = voice.startsWith("en-") ? "21m00Tcm4TlvDq8ikWAM" : voice;
    const r = await fetchT(`https://api.elevenlabs.io/v1/text-to-speech/${id}`, {
      method: "POST",
      headers: { "xi-api-key": getConfig("ELEVENLABS_API_KEY")!, "Content-Type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!r.ok) throw new Error("ElevenLabs " + r.status);
    fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
  },
};

function openaiCompatible(id: string, baseUrl: string, key: string, model: string): TTSProvider {
  return {
    id,
    async synth(text, voice, outFile) {
      const r = await fetchT(baseUrl.replace(/\/$/, "") + "/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text, voice: voice.startsWith("en-") ? "alloy" : voice, response_format: "mp3" }),
      });
      if (!r.ok) throw new Error(id + " TTS " + r.status);
      fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
    },
  };
}

/** Offline last resort: espeak-ng (installed in the runtime image). Robotic, but the cut keeps its voice track. */
const espeak: TTSProvider = {
  id: "espeak",
  async synth(text, voice, outFile) {
    const wav = outFile + ".wav";
    const v = /en-GB/.test(voice) ? "en-gb" : "en-us";
    const female = /Aria|Sonia|Ezinne|Jenny|Leah/.test(voice);
    await withTimeout(new Promise<void>((res, rej) => {
      const p = spawn("espeak-ng", ["-v", v + (female ? "+f3" : "+m3"), "-s", "155", "-w", wav, text]);
      p.on("error", rej); p.on("close", (c) => (c === 0 ? res() : rej(new Error("espeak-ng exit " + c))));
    }), 30_000, "espeak");
    try { await ffmpeg(["-i", wav, "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", outFile]); } finally { fs.rmSync(wav, { force: true }); }
  },
};

function configured(): TTSProvider[] {
  const out: TTSProvider[] = [];
  if (getConfig("ELEVENLABS_API_KEY")) out.push(elevenlabs);
  if (getConfig("XAI_API_KEY")) out.push(openaiCompatible("xai", "https://api.x.ai/v1", getConfig("XAI_API_KEY")!, "grok-tts"));
  if (getConfig("TTS_COMPAT_URL")) out.push(openaiCompatible("openai-compatible", getConfig("TTS_COMPAT_URL")!, getConfig("TTS_COMPAT_KEY") || "", "tts-1"));
  return out;
}

export function ttsProvider(): TTSProvider {
  const p = getConfig("TTS_PROVIDER") || "edge";
  return configured().find((x) => x.id === p) || edge;
}

/** Order to try: the chosen engine, then Edge, then any other configured engine, then offline espeak. */
export function ttsChain(): TTSProvider[] {
  const seen = new Set<string>(); const out: TTSProvider[] = [];
  for (const x of [ttsProvider(), edge, ...configured(), espeak]) if (!seen.has(x.id)) { seen.add(x.id); out.push(x); }
  return out;
}

/** Split into sentence-sized chunks (≤ max chars) so one dropped socket only costs a short retry. */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
  const out: string[] = []; let cur = "";
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (let s of sentences) {
    while (s.length > max) { // very long sentence: break at a comma/space
      const cut = Math.max(s.lastIndexOf(",", max), s.lastIndexOf(" ", max), Math.floor(max / 2));
      flush(); out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1);
    }
    if ((cur + s).length > max) flush();
    cur += s;
  }
  flush();
  return out.filter(Boolean);
}

async function valid(file: string) {
  return fs.existsSync(file) && fs.statSync(file).size > 600 && (await probeDuration(file)) > 0.15;
}

/** One chunk on one engine: up to 3 attempts with backoff, each with a timeout and output validation. */
async function synthChunk(p: TTSProvider, text: string, voice: string, outFile: string, attempts = 3) {
  let last: Error | null = null;
  for (let a = 1; a <= attempts; a++) {
    try {
      fs.rmSync(outFile, { force: true });
      await withTimeout(p.synth(text, voice, outFile), 60_000, `${p.id} TTS`);
      if (!(await valid(outFile))) throw new Error(`${p.id} returned empty/invalid audio`);
      return;
    } catch (e) {
      last = e as Error;
      console.warn(`[tts] ${p.id} attempt ${a}/${attempts} failed: ${last.message}`);
      if (/40[13]\b|invalid api key|unauthor/i.test(last.message)) break; // config error: don't hammer
      if (a < attempts) await sleep(800 * 2 ** (a - 1) + Math.random() * 400);
    }
  }
  throw last || new Error("TTS failed");
}

/**
 * Voice a line robustly. Returns the engine that produced it, or throws only when every engine (incl. offline) failed.
 * Long text is chunked and concatenated.
 */
export async function speak(text: string, voice: string, outFile: string): Promise<string> {
  const chunks = chunkText(text);
  const errors: string[] = [];
  for (const p of ttsChain()) {
    const parts: string[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        const part = chunks.length === 1 ? outFile : `${outFile}.part${i}.mp3`;
        await synthChunk(p, chunks[i], voice, part, p.id === "espeak" ? 1 : 3);
        parts.push(part);
      }
      if (chunks.length > 1) {
        const list = outFile + ".list.txt";
        fs.writeFileSync(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
        try { await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", outFile]); }
        finally { fs.rmSync(list, { force: true }); }
      }
      record("voice", "Voice", p.id, undefined, 0);
      return p === ttsChain()[0] ? p.id : `${p.id} (fallback)`;
    } catch (e) {
      errors.push(`${p.id}: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      if (chunks.length > 1) for (const f of parts) fs.rmSync(f, { force: true });
    }
  }
  throw new Error("All TTS engines failed — " + errors.join(" | "));
}
