import { nanoid } from "nanoid";
import { db } from "./db";
import { chatP, llmLive, parseJson } from "./providers/meta";
import type { MemoryNote, Project } from "./types";
import { inferAge, inferGender } from "./voices";

/**
 * Per-user learning memory. After each meaningful step, Muse Spark distills SHORT, durable taste notes (genre, pacing, tone, look,
 * character/wardrobe habits, voice choices, things the user rejects) into a user-level store. Only the distilled notes are kept —
 * never scripts, media or story text — so the notes survive project deletion and feed the next project's prompts.
 */
export const CATEGORIES: MemoryNote["category"][] = ["genre", "pacing", "tone", "visual", "characters", "wardrobe", "voice", "rejects", "other"];
export const MAX_NOTES = 40;
const MAX_LEN = 160;

export type LearnEvent = { kind: string; detail?: string; before?: string; after?: string };
type Pending = { events: (LearnEvent & { mode: string; style: string; format: string })[]; timer?: NodeJS.Timeout; running?: Promise<void> };
const g = globalThis as unknown as { __rfLearn?: Map<string, Pending> };
const pending = (g.__rfLearn ||= new Map());

const clip = (s: string | undefined, n: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
function similar(a: string, b: string) { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.min(A.size, B.size) >= 0.7; }
/** A rough line-level summary of a script edit (what was added/removed) so the model can read intent without us storing the script. */
function editSummary(before = "", after = "") {
  const b = new Set(before.split("\n").map((l) => l.trim()).filter(Boolean)), a = after.split("\n").map((l) => l.trim()).filter(Boolean);
  const added = a.filter((l) => !b.has(l)); const aSet = new Set(a); const removed = [...b].filter((l) => !aSet.has(l));
  return `length ${before.split(/\s+/).length}→${after.split(/\s+/).length} words. Removed: ${clip(removed.slice(0, 8).join(" / "), 700)} || Added: ${clip(added.slice(0, 8).join(" / "), 700)}`;
}

export function memoryOf(uid: string) { return db.getMemory(uid); }
export async function setEnabled(uid: string, on: boolean) { return db.setMemory(uid, (m) => { m.enabled = on; }); }

/** Queue a learning event for this user (debounced; distilled in the background, never blocks the step). */
export function learn(uid: string | undefined, p: Pick<Project, "mode" | "style" | "format">, e: LearnEvent) {
  if (!uid || !db.getMemory(uid).enabled) return;
  const ev = { kind: e.kind, detail: clip(e.detail, 600), ...(e.before !== undefined || e.after !== undefined ? { detail: editSummary(e.before, e.after) } : {}), mode: p.mode, style: p.style, format: p.format };
  const q = pending.get(uid) || { events: [] };
  q.events.push(ev); if (q.events.length > 12) q.events.splice(0, q.events.length - 12);
  pending.set(uid, q);
  clearTimeout(q.timer);
  q.timer = setTimeout(() => void flush(uid), Number(process.env.LEARN_DEBOUNCE_MS || 6000));
}
/** Distill now (used by the debounce timer and by tests). */
export async function flush(uid: string) {
  const q = pending.get(uid); if (!q) return;
  if (q.running) { await q.running; return flush(uid); } // a distill is in flight: wait for it, then take whatever queued meanwhile
  if (!q.events.length) return;
  clearTimeout(q.timer); const events = q.events.splice(0);
  q.running = (async () => {
    try {
      const mem = db.getMemory(uid); if (!mem.enabled) return;
      const ops = await distill(mem.notes, events);
      await db.setMemory(uid, (m) => applyOps(m.notes, ops));
    } catch (e) { console.warn("[memory] distill failed:", (e as Error).message); }
  })();
  try { await q.running; } finally { q.running = undefined; if (q.events.length) q.timer = setTimeout(() => void flush(uid), 2000); }
}
type Ops = { add?: { text: string; category: string }[]; update?: { id: string; text: string; category?: string }[]; remove?: string[]; reinforce?: string[] };

async function distill(notes: MemoryNote[], events: Pending["events"]): Promise<Ops> {
  if (!llmLive()) return heuristic(events);
  const sys = `You maintain a creator's long-term TASTE PROFILE for an AI film studio. From the latest studio events, distill short, durable preferences that will still be useful on a DIFFERENT future project.
Rules: each note ≤ 140 characters, written as a general preference ("Prefers…", "Avoids…", "Likes…", "Rejects…"). NEVER copy story text, dialogue, plot, character names, places or titles — generalise ("female Nigerian leads in their 20s", not "Ada"). Skip one-off fixes that say nothing about taste. If an event repeats an existing note, put its id in "reinforce" instead of adding. If it contradicts one, "update" it. Remove notes the events prove wrong. Prefer zero notes over weak ones.
Categories: ${CATEGORIES.join(", ")} ("rejects" = things they turn down or fix away).
Return JSON {"add":[{"text","category"}],"update":[{"id","text","category"}],"remove":["id"],"reinforce":["id"]}.`;
  const user = `Existing notes:\n${notes.map((n) => `${n.id} [${n.category}] ${n.text}`).join("\n") || "(none)"}\n\nNew events:\n${events.map((e) => `- ${e.kind} (${e.mode}, ${e.style}, ${e.format}): ${e.detail || ""}`).join("\n")}`;
  const r = await chatP([{ role: "system", content: sys }, { role: "user", content: user }], { json: true, task: "general", temperature: 0.2 });
  return parseJson<Ops>(r.text);
}
/** Offline fallback: only the unambiguous signals. */
function heuristic(events: Pending["events"]): Ops {
  const add: Ops["add"] = [];
  for (const e of events) {
    if (e.kind === "settings" && /style: .*→ (\w+)/.test(e.detail || "")) add.push({ text: `Prefers the ${(e.detail || "").match(/style: .*→ (\w+)/)![1]} visual style`, category: "visual" });
    if (e.kind === "voice_choice") add.push({ text: `Voice choice: ${clip(e.detail, 120)}`, category: "voice" });
    if (e.kind === "reference_rejected") add.push({ text: `Rejected a reference: ${clip(e.detail, 110)}`, category: "rejects" });
  }
  return { add };
}
function applyOps(notes: MemoryNote[], ops: Ops) {
  const at = new Date().toISOString();
  const cat = (c?: string) => (CATEGORIES.includes(c as MemoryNote["category"]) ? c : "other") as MemoryNote["category"];
  const clean = (t: string) => clip(t, MAX_LEN);
  for (const id of ops.remove || []) { const i = notes.findIndex((n) => n.id === id); if (i >= 0) notes.splice(i, 1); }
  for (const id of ops.reinforce || []) { const n = notes.find((x) => x.id === id); if (n) { n.hits = (n.hits || 1) + 1; n.at = at; } }
  for (const u of ops.update || []) { const n = notes.find((x) => x.id === u.id); if (n && u.text) { n.text = clean(u.text); n.category = cat(u.category || n.category); n.at = at; n.hits = (n.hits || 1) + 1; } }
  for (const a of ops.add || []) {
    if (!a?.text || clean(a.text).length < 8) continue;
    const dup = notes.find((n) => similar(n.text, a.text));
    if (dup) { dup.hits = (dup.hits || 1) + 1; dup.at = at; continue; }
    notes.push({ id: nanoid(8), text: clean(a.text), category: cat(a.category), at, hits: 1, source: "auto" });
  }
  // cap: keep the most reinforced / most recent
  if (notes.length > MAX_NOTES) {
    const keep = [...notes].sort((x, y) => (y.hits || 1) - (x.hits || 1) || y.at.localeCompare(x.at)).slice(0, MAX_NOTES);
    notes.splice(0, notes.length, ...notes.filter((n) => keep.includes(n)));
  }
}
export async function editNote(uid: string, id: string, patch: { text?: string; category?: string }) {
  return db.setMemory(uid, (m) => { const n = m.notes.find((x) => x.id === id); if (!n) return; if (patch.text) n.text = clip(patch.text, MAX_LEN); if (patch.category && CATEGORIES.includes(patch.category as MemoryNote["category"])) n.category = patch.category as MemoryNote["category"]; n.source = "edited"; n.at = new Date().toISOString(); });
}
export async function addNote(uid: string, text: string, category = "other") { return db.setMemory(uid, (m) => applyOps(m.notes, { add: [{ text, category }] })); }
export async function deleteNote(uid: string, id: string) { return db.setMemory(uid, (m) => { m.notes = m.notes.filter((n) => n.id !== id); }); }
export async function clearNotes(uid: string) { pending.delete(uid); return db.setMemory(uid, (m) => { m.notes = []; }); }

const FOR: Record<string, MemoryNote["category"][]> = {
  director: CATEGORIES, script: ["genre", "pacing", "tone", "characters", "rejects", "other"],
  reference: ["visual", "characters", "wardrobe", "rejects"], continuity: ["visual", "characters", "wardrobe", "rejects"], brainstorm: ["genre", "tone", "pacing", "characters", "rejects", "other"],
};
/** Short block of the user's learned taste for a prompt ("" when learning is off or empty). */
export function memoryBrief(uid: string | undefined, purpose: keyof typeof FOR = "director", max = 12): string {
  if (!uid) return "";
  const m = db.getMemory(uid); if (!m.enabled || !m.notes.length) return "";
  const cats = FOR[purpose] || CATEGORIES;
  const picked = m.notes.filter((n) => cats.includes(n.category)).sort((a, b) => (b.hits || 1) - (a.hits || 1) || b.at.localeCompare(a.at)).slice(0, max);
  if (!picked.length) return "";
  return `\nWhat this creator has taught you (learned taste from past projects — follow it unless this project's brief, bible or locked spec says otherwise):\n${picked.map((n) => `- [${n.category}] ${n.text}`).join("\n")}\n`;
}
/** Human summary of a character for the voice-choice event (no names). */
export const castLine = (a: { name: string; description: string; details: string; spec?: Record<string, unknown> }) => `${inferAge(a)} ${inferGender(a)} character`;
