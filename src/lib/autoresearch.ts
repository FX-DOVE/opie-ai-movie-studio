/** Auto-research: when a user brainstorms a concrete video topic, launch the research agent on Reel's computer once per topic. */
import { getConfig } from "./config";
import { db } from "./db";
import { chatP, llmLive, parseJson } from "./providers/meta";
import { allSessions, startResearch } from "./research";

const g = globalThis as unknown as { __rfAuto?: Map<string, { id: string; at: number }> };
const seen = (g.__rfAuto ||= new Map());
const TTL = 6 * 3600e3;
export const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).sort().join(" ");
const STOP = new Set(["the", "and", "for", "about", "with", "video", "videos", "youtube", "short", "shorts", "idea", "ideas", "make", "want", "story", "film", "movie", "pitch", "give", "some", "this", "that", "please", "can", "you", "our"]);
const SMALL = /^(hi|hey|hello|yo|thanks?|thank you|ok(ay)?|cool|nice|great|yes|no|yep|nope|sure|lol|good (morning|night|evening)|how are you|who are you|what can you do|help)\b[\s!.?]*$/i;
const META = /\b(how do i|how to use|where is|what is (this|reelforge)|settings|admin|log ?in|password|delete|undo|clear|render|export|upload)\b/i;
const FOLLOWUP = /^(make it|more|less|shorter|longer|darker|funnier|again|another|next|use (the|this)|write (the|full)|go with|option|number|#?\d\b)/i;

/** Returns a concise searchable topic, or null for small talk / app questions / follow-ups. */
export async function detectTopic(message: string, context = ""): Promise<string | null> {
  const m = message.trim();
  if (m.length < 12 || m.split(/\s+/).length < 3 || SMALL.test(m) || META.test(m) || FOLLOWUP.test(m)) return null;
  if (!llmLive()) return m.split(/\s+/).length >= 4 ? m.replace(/[?.!]+$/, "").slice(0, 80) : null;
  try {
    const r = await chatP([{ role: "system", content: 'Decide if the user message names a CONCRETE video topic or idea worth researching on YouTube (a subject, story premise, product, event, place, person, niche). Small talk, app questions, requests to tweak an existing idea ("make it darker"), or vague asks ("give me ideas") are NOT. Reply JSON {"topic": <2-6 word YouTube search query for the topic> | null}.' }, { role: "user", content: `${context ? `Project context: ${context}\n` : ""}Message: ${m.slice(0, 600)}` }], { json: true, temperature: 0 });
    const t = parseJson<{ topic?: string | null }>(r.text).topic;
    return t && typeof t === "string" && t.trim().length > 2 ? t.trim().slice(0, 80) : null;
  } catch { return null; }
}

export const autoResearchOn = () => (getConfig("AUTO_RESEARCH") || "on") !== "off";

/** Starts (at most once per topic per project/chat) and returns the session id, or null. */
export async function maybeAutoResearch(o: { message: string; projectId?: string; scope: string; context?: string; ownerId?: string }): Promise<{ id: string; topic: string } | null> {
  if (!autoResearchOn()) return null;
  const topic = await detectTopic(o.message, o.context); if (!topic) return null;
  const k = `${o.scope}|${norm(topic)}`; if (!norm(topic)) return null;
  const prev = seen.get(k); if (prev && Date.now() - prev.at < TTL) return null;
  // one auto run at a time per scope; and never repeat a topic the project already has research for
  if (allSessions().some((s) => s.auto && s.status === "running" && (s.projectId || "") === (o.projectId || ""))) return null;
  const p = o.projectId ? db.getProject(o.projectId) : undefined;
  if (p?.research?.some((r) => norm(r.goal) === norm(topic))) return null;
  const s = startResearch({ goal: topic, task: "topic", projectId: o.projectId, auto: true, maxSteps: 12, ownerId: o.ownerId });
  seen.set(k, { id: s.id, at: Date.now() });
  return { id: s.id, topic };
}
