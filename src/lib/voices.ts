import type { Asset, Project } from "./types";
import { getConfig } from "./config";

/** Voices for characters, picked from the gender and age the character bible describes (unless the user chose one by hand). */
export type Gender = "female" | "male" | "unknown";
const FEMALE_ALT = ["en-GB-SoniaNeural", "en-US-JennyNeural", "en-ZA-LeahNeural", "en-US-AriaNeural"];
const MALE_ALT = ["en-GB-RyanNeural", "en-US-GuyNeural", "en-KE-ChilembaNeural", "en-US-AndrewNeural"];

const F = /\b(woman|women|female|girl|girls|she|her|hers|herself|mother|mum|mom|mama|wife|sister|daughter|aunt|auntie|aunty|queen|lady|ladies|madam|madame|grandmother|grandma|granny|mrs|ms|miss|actress|bride|princess|matriarch|lioness|niece|heroine|businesswoman|policewoman|girlfriend|nun|waitress|hostess)\b/g;
const M = /\b(man|men|male|boy|boys|he|him|his|himself|father|dad|daddy|papa|husband|brother|son|uncle|king|gentleman|sir|grandfather|grandpa|mr|actor|groom|prince|patriarch|nephew|hero|businessman|policeman|boyfriend|monk|waiter|host|bull|stallion|mane)\b/g;
const CHILD = /\b(child|kid|toddler|baby|infant|little (?:girl|boy)|schoolgirl|schoolboy|(?:[1-9]|1[0-2])[- ](?:year|yr)s?[- ]old|aged? (?:[1-9]|1[0-2])\b|cub|calf|fawn|juvenile|orphaned)\b/;

const text = (a: Pick<Asset, "name" | "description" | "details" | "spec">) => `${a.name} ${a.description} ${a.details} ${a.spec ? JSON.stringify(a.spec) : ""}`.toLowerCase();
export function inferGender(a: Pick<Asset, "name" | "description" | "details" | "spec">): Gender {
  const g = (a.spec as Record<string, unknown> | undefined)?.gender || (a.spec as Record<string, unknown> | undefined)?.sex;
  if (typeof g === "string") { if (/^f|wom/i.test(g)) return "female"; if (/^m|man/i.test(g)) return "male"; }
  const t = text(a);
  // the description (who they are) outweighs wardrobe mentions
  const lead = `${a.name} ${a.description}`.toLowerCase();
  const f = (lead.match(F) || []).length * 2 + (t.match(F) || []).length, m = (lead.match(M) || []).length * 2 + (t.match(M) || []).length;
  return f > m ? "female" : m > f ? "male" : "unknown";
}
export function inferAge(a: Pick<Asset, "name" | "description" | "details" | "spec">): "child" | "adult" | "elder" {
  const t = text(a);
  const n = Number((a.spec as Record<string, unknown> | undefined)?.age) || Number(t.match(/\b(\d{1,2})[- ](?:year|yr)s?[- ]old\b/)?.[1]);
  if (n && n <= 12) return "child";
  if (!n && CHILD.test(t)) return "child";
  if ((n && n >= 60) || /\b(elderly|old (?:wo)?man|grand(?:mother|father|ma|pa)|aged|senior|matriarch|patriarch)\b/.test(t)) return "elder";
  return "adult";
}
const list = (g: Gender) => {
  const f = getConfig("VOICE_FEMALE") || "en-NG-EzinneNeural", m = getConfig("VOICE_MALE") || "en-NG-AbeoNeural";
  return g === "female" ? [f, ...FEMALE_ALT.filter((v) => v !== f)] : [m, ...MALE_ALT.filter((v) => v !== m)];
};
/** Default voice for one character given voices already taken by the rest of the cast. */
export function pickVoice(a: Asset, taken: string[] = []): string {
  const age = inferAge(a);
  if (age === "child") return getConfig("VOICE_CHILD") || "en-US-AnaNeural";
  let g = inferGender(a);
  if (g === "unknown") g = /\b(ada|ngozi|chioma|amaka|funke|aisha|zainab|fatima|bisi|yetunde|folake|kemi|nneka|ifeoma|uche?nna|mary|sarah|grace|joy|blessing)\b/i.test(a.name) ? "female" : /\b(tunde|chidi|emeka|obi|segun|musa|ibrahim|john|james|david|peter|samuel|daniel|tayo|kunle|femi)\b/i.test(a.name) ? "male" : "unknown";
  const opts = g === "unknown" ? [...list("female").slice(0, 2), ...list("male").slice(0, 2)] : list(g);
  const pool = age === "elder" ? [...opts.slice(1), opts[0]] : opts; // elders start on the deeper/calmer alternates
  return pool.find((v) => !taken.includes(v)) || pool[taken.filter((t) => pool.includes(t)).length % pool.length];
}
/** Give every character without a hand-picked voice the default for its gender/age; returns the names whose voice changed. */
export function assignVoices(p: Project): string[] {
  const changed: string[] = [];
  const chars = p.assets.filter((a) => a.kind === "character");
  const taken: string[] = chars.filter((a) => a.voiceManual && a.voice).map((a) => a.voice!);
  for (const a of chars) {
    if (a.voiceManual && a.voice) continue;
    const v = pickVoice(a, taken);
    taken.push(v);
    if (a.voice !== v) { a.voice = v; changed.push(a.name); }
  }
  return changed;
}
/** Drop recorded audio for lines spoken by these characters so the next render re-voices them. */
export function clearLinesFor(p: Project, names: string[]) {
  const set = new Set(names.map((n) => n.toLowerCase()));
  for (const s of p.scenes) for (const sh of s.shots) if (sh.dialogue && set.has((sh.speaker || "").toLowerCase())) { sh.audioUrl = undefined; sh.audioProvider = undefined; }
}
export const voiceFor = (p: Project, speaker?: string) => {
  const a = p.assets.find((x) => x.kind === "character" && x.name.toLowerCase() === (speaker || "").toLowerCase());
  if (!a) return getConfig("VOICE_FEMALE") || "en-NG-EzinneNeural";
  return a.voice || pickVoice(a, p.assets.filter((x) => x.kind === "character" && x !== a && x.voice).map((x) => x.voice!));
};
