import fs from "node:fs";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getConfig } from "../config";

/** Pluggable text-to-speech. Default: Microsoft Edge neural voices (free). ElevenLabs / xAI / OpenAI-compatible slots are configured in Admin. */
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
];

const edge: TTSProvider = {
  id: "edge",
  async synth(text, voice, outFile) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice || "en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const dir = path.dirname(outFile);
    const { audioFilePath } = await tts.toFile(dir, text);
    fs.renameSync(audioFilePath, outFile);
    tts.close();
  },
};

const elevenlabs: TTSProvider = {
  id: "elevenlabs",
  async synth(text, voice, outFile) {
    const id = voice.startsWith("en-") ? "21m00Tcm4TlvDq8ikWAM" : voice;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`, {
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
      const r = await fetch(baseUrl.replace(/\/$/, "") + "/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text, voice: voice.startsWith("en-") ? "alloy" : voice, response_format: "mp3" }),
      });
      if (!r.ok) throw new Error(id + " TTS " + r.status);
      fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
    },
  };
}

export function ttsProvider(): TTSProvider {
  const p = getConfig("TTS_PROVIDER") || "edge";
  if (p === "elevenlabs" && getConfig("ELEVENLABS_API_KEY")) return elevenlabs;
  if (p === "xai" && getConfig("XAI_API_KEY")) return openaiCompatible("xai", "https://api.x.ai/v1", getConfig("XAI_API_KEY")!, "grok-tts");
  if (p === "openai-compatible" && getConfig("TTS_COMPAT_URL")) return openaiCompatible("openai-compatible", getConfig("TTS_COMPAT_URL")!, getConfig("TTS_COMPAT_KEY") || "", "tts-1");
  return edge;
}

export async function speak(text: string, voice: string, outFile: string) {
  const p = ttsProvider();
  try { await p.synth(text, voice, outFile); return p.id; }
  catch (e) { if (p.id === "edge") throw e; await edge.synth(text, voice, outFile); return "edge (fallback)"; }
}
