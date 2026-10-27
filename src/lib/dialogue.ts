import fs from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import { ffmpeg, probeDuration } from "./ffmpeg";
import { record } from "./usage";

/** Dialogue clarity: lines short enough to voice and read, one speaker per shot, and a speech-to-text round trip that proves
 *  the voiced line is understandable (low word error rate) and paced for its shot. */

export const MAX_WORDS = 14;
const MAX_NARRATION_WORDS = 26;
/** comfortable speech is ~2.3–3 words/s; above this a line sounds rushed */
export const MAX_WPS = 3.4;
export const MAX_WER = 0.2;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
/** Strip what a voice engine would read aloud by mistake: parentheticals, stage directions, emoji, a leading "NAME:" and wrapping quotes. */
export function cleanLine(s: string) {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]|\*[^*]*\*/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^\s*[A-Z][A-Z .'-]{1,24}:\s*/, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Split a long line at sentence (then clause) boundaries into chunks of ≤ max words. */
export function splitLine(s: string, max = MAX_WORDS): string[] {
  if (words(s).length <= max) return [s];
  const sentences = s.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) || [s];
  const out: string[] = []; let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  for (const sen of sentences) {
    if (words(sen).length > max + 4) {
      push();
      // clause split on commas/semicolons/dashes, then hard split
      let part = "";
      for (const cl of sen.split(/(?<=[,;:—–])\s+/)) {
        if (words(part + " " + cl).length > max && words(part).length >= 4) { out.push(part.trim()); part = cl; } else part = `${part} ${cl}`;
      }
      const ws = words(part); const n = Math.ceil(ws.length / (max + 4)); const per = Math.ceil(ws.length / n);
      for (let i = 0; i < ws.length; i += per) out.push(ws.slice(i, i + per).join(" "));
      continue;
    }
    if (words(`${cur} ${sen}`).length > max) push();
    cur = `${cur} ${sen}`;
  }
  push();
  return out.filter(Boolean);
}

interface LineShot { description: string; camera: string; speaker?: string; dialogue?: string; narration?: string; durationSec: number; assets: string[]; end?: string; beat?: string; screen?: string }
/** Enforce one speaker per shot and short lines: embedded "OTHER: …" turns become their own shot; long speeches are split
 *  into consecutive shots (closer framing for the continuation) so every line is short, voiced alone and never overlaps. */
export function normalizeDialogue<T extends LineShot>(shots: T[]): T[] {
  const out: T[] = [];
  for (const sh of shots) {
    if (sh.narration) {
      const parts = splitLine(cleanLine(sh.narration), MAX_NARRATION_WORDS);
      parts.forEach((t, i) => out.push({ ...sh, narration: t, description: i ? `${sh.description.split(" → ends: ")[0]} (continued)` : sh.description, durationSec: i ? Math.max(3, Math.round(words(t).length / 2.6 + 1)) : sh.durationSec }));
      continue;
    }
    if (!sh.dialogue) { out.push(sh); continue; }
    // "Line one. CHIDI: reply" inside one dialogue → separate turns
    const turns: { speaker?: string; text: string }[] = [];
    const re = /\s(?=[A-Z][A-Z .'-]{1,24}:\s)/;
    for (const seg of sh.dialogue.split(re)) {
      const m = seg.match(/^\s*([A-Z][A-Z .'-]{1,24}):\s*([\s\S]*)$/);
      turns.push(m && turns.length ? { speaker: m[1].trim(), text: m[2] } : { speaker: sh.speaker, text: seg });
    }
    for (const [ti, turn] of turns.entries()) {
      const spk = turn.speaker || sh.speaker;
      const parts = splitLine(cleanLine(turn.text));
      parts.forEach((t, i) => {
        if (!t) return;
        const first = ti === 0 && i === 0;
        out.push({
          ...sh, speaker: spk, dialogue: t,
          description: first ? sh.description : `${spk} ${i ? "continues speaking" : "replies"} — ${sh.description.split(" → ends: ")[0]}`,
          camera: first ? sh.camera : i ? `Closer single on ${spk}` : `Single on ${spk} (reverse angle)`,
          beat: first ? sh.beat : "dialogue",
          durationSec: first ? sh.durationSec : Math.max(2.5, Math.round((words(t).length / 2.6 + 1) * 10) / 10),
        });
      });
    }
  }
  return out;
}

/** Word error rate (Levenshtein over normalised words). */
export function wer(ref: string, hyp: string) {
  const norm = (s: string) => speakable(s).toLowerCase().replace(/-/g, " ").replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const r = norm(ref), h = norm(hyp);
  if (!r.length) return h.length ? 1 : 0;
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return +(d[r.length][h.length] / r.length).toFixed(3);
}

const sttKey = () => getConfig("XAI_API_KEY") || (/x\.ai/.test(getConfig("FALLBACK_BASE_URL") || "") ? getConfig("FALLBACK_API_KEY") : undefined);
export const sttOn = () => (getConfig("DIALOGUE_CHECK") || "on") !== "off" && !!sttKey();

/** Speech-to-text (xAI batch STT). Names in the line are passed as key terms so they aren't counted as errors unfairly. */
export async function transcribe(file: string, keyterms: string[] = []): Promise<string> {
  const key = sttKey(); if (!key) throw new Error("no speech-to-text key");
  const fd = new FormData();
  fd.append("model", "grok-voice-transcribe-2.0"); fd.append("language", "en");
  for (const k of keyterms.slice(0, 20)) fd.append("keyterm", k.slice(0, 50));
  fd.append("file", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), path.basename(file));
  const r = await fetch("https://api.x.ai/v1/stt", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`STT HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json() as { text?: string; duration?: number };
  record("voice", "Speech-to-text", "grok-voice-transcribe-2.0", undefined, 0, ((j.duration || 0) / 3600) * 0.1);
  return String(j.text || "");
}

/** Make a line easier for TTS: numbers spelled, symbols spoken, ellipses/dashes as commas. */
export function speakable(s: string) {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const num = (n: number): string => n < 20 ? ones[n] : n < 100 ? tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "") : n < 1000 ? ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + num(n % 100) : "") : String(n);
  return cleanLine(s).replace(/&/g, " and ").replace(/%/g, " percent").replace(/\$(\d+)/g, "$1 dollars").replace(/\b\d{1,3}\b/g, (m) => num(+m)).replace(/\s*(…|\.\.\.|—|–)\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/,$/, ".");
}

/** Slow a voice file slightly (pitch-preserving) when a line is rushed. */
export async function slowDown(file: string, factor: number) {
  const tmp = file.replace(/\.mp3$/, "") + `.slow.mp3`;
  await ffmpeg(["-i", file, "-filter:a", `atempo=${Math.max(0.8, Math.min(1, factor)).toFixed(3)}`, "-c:a", "libmp3lame", "-b:a", "64k", tmp]);
  fs.renameSync(tmp, file);
  return probeDuration(file);
}
