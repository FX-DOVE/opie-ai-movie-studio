import { nanoid } from "nanoid";
import { db } from "./db";
import { agentStream, getConv, interrupt, type Persona } from "./agent";

/** Named production agents and persisted multi-agent chats (owner-scoped, stored server-side). */
export interface AgentRec { id: string; ownerId: string; name: string; color: string; brief: string; filmStyle?: string; projectId?: string; approval: "auto" | "key"; notes: string[]; createdAt: string; updatedAt?: string }
export interface Card { id: string; name: string; ok?: boolean; summary?: string }
export interface ChatMsg { id: string; role: "user" | "agent" | "info"; agentId?: string; text: string; at: string; cards?: Card[]; projectId?: string }
export interface ChatRec { id: string; ownerId: string; title: string; color?: string; topic?: string; notes?: string[]; projectIds?: string[]; filmStyle?: string; approval?: "auto" | "key"; agentIds: string[]; msgs: ChatMsg[]; createdAt: string; updatedAt?: string; busy?: boolean }

export const COLORS = ["#0071e3", "#af52de", "#ff9500", "#34c759", "#ff2d55", "#5ac8fa", "#5856d6", "#a2845e"];
const now = () => new Date().toISOString();

export const agents = {
  list: (owner: string) => db.listDocs<AgentRec>("agents", owner),
  get: (id: string, owner: string) => { const a = db.getDoc<AgentRec>("agents", id); return a && a.ownerId === owner ? a : undefined; },
  async create(owner: string, b: Partial<AgentRec>) {
    const n = agents.list(owner).length;
    const a: AgentRec = { id: nanoid(10), ownerId: owner, name: String(b.name || `Agent ${String.fromCharCode(65 + (n % 26))}`).slice(0, 40), color: b.color && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : COLORS[n % COLORS.length], brief: String(b.brief || "").slice(0, 600), filmStyle: b.filmStyle || undefined, projectId: b.projectId || undefined, approval: b.approval === "key" ? "key" : "auto", notes: [], createdAt: now() };
    return db.putDoc("agents", a);
  },
  async update(a: AgentRec, b: Partial<AgentRec>) {
    for (const k of ["name", "color", "brief", "filmStyle", "projectId", "approval"] as const) if (b[k] !== undefined) (a as unknown as Record<string, unknown>)[k] = b[k] === "" ? undefined : b[k];
    if (Array.isArray(b.notes)) a.notes = b.notes.map(String).slice(-40);
    return db.putDoc("agents", a);
  },
};
export const chats = {
  list: (owner: string) => db.listDocs<ChatRec>("chats", owner).map(({ msgs, ...c }) => ({ ...c, last: msgs[msgs.length - 1]?.text.slice(0, 90) || "", count: msgs.length })),
  get: (id: string, owner: string) => { const c = db.getDoc<ChatRec>("chats", id); return c && c.ownerId === owner ? c : undefined; },
  async create(owner: string, b: { title?: string; agentIds?: string[] }) {
    const ids = (b.agentIds || []).filter((x) => agents.get(x, owner));
    const names = ids.map((x) => agents.get(x, owner)!.name);
    const n = db.listDocs<ChatRec>("chats", owner).length;
    const c: ChatRec = { id: nanoid(10), ownerId: owner, title: String(b.title || (names[0] || "New agent")).slice(0, 80), color: COLORS[n % COLORS.length], topic: "", notes: [], projectIds: [], approval: "auto", agentIds: ids, msgs: [], createdAt: now() };
    return db.putDoc("chats", c);
  },
  save: (c: ChatRec) => db.putDoc("chats", c),
};

const convKey = (chatId: string, agentId: string) => `${chatId}~${agentId}`;

/**
 * Who answers: @mentioned agents (in mention order; @all/@everyone = all), else the one agent of a 1:1 chat,
 * else the agent whose name/brief best matches the message, else the first ("lead") agent. Never all at once by default.
 */
export function responders(c: ChatRec, owner: string, text: string): AgentRec[] {
  const list = c.agentIds.map((id) => agents.get(id, owner)).filter(Boolean) as AgentRec[];
  if (!list.length) return [];
  if (/@(all|everyone|team)\b/i.test(text)) return list;
  const low = text.toLowerCase();
  const hit = list.map((a) => ({ a, i: Math.min(...[a.name, a.name.replace(/\s+/g, ""), a.name.split(/\s+/)[0]].map((n) => { const k = low.indexOf("@" + n.toLowerCase()); return k < 0 ? Infinity : k; })) })).filter((x) => x.i < Infinity).sort((x, y) => x.i - y.i).map((x) => x.a);
  if (hit.length) return hit;
  if (list.length === 1) return list;
  const words = new Set(low.match(/[a-z]{4,}/g) || []);
  const scored = list.map((a) => ({ a, s: (`${a.name} ${a.brief} ${a.filmStyle || ""}`.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => words.has(w)).length })).sort((x, y) => y.s - x.s);
  return [scored[0].s > 0 ? scored[0].a : list[0]];
}

/** One user message into a chat: persisted, then each responding agent runs in turn (its own conversation, project and memory). */
/** Each chat IS an agent: its persona comes from the chat itself (name = title, colour, topic, memory, linked projects). */
export function chatStream(c: ChatRec, owner: string, text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const emit = (x: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(x) + "\n")); } catch { /* client gone */ } };
      c.msgs.push({ id: nanoid(8), role: "user", text, at: now() }); c.busy = true;
      if (c.title === "New chat" && c.msgs.length === 1) c.title = text.replace(/\s+/g, " ").slice(0, 48);
      await chats.save(c);
      const who: AgentRec[] = c.agentIds.length ? responders(c, owner, text) : [{ id: c.id, ownerId: owner, name: c.title, color: c.color || COLORS[0], brief: c.topic || "", filmStyle: c.filmStyle, projectId: c.projectIds?.[c.projectIds.length - 1], approval: c.approval || "auto", notes: c.notes || [], createdAt: c.createdAt }];
      const self = !c.agentIds.length;
      if (!who.length) { const t = "Add an agent to this chat (or create one) and I'll get to work."; c.msgs.push({ id: nanoid(8), role: "info", text: t, at: now() }); emit({ type: "info", text: t }); }
      for (const a of who) {
        const fresh = c.agentIds.length > 1 ? c.msgs.slice(-10, -1).filter((m) => m.role !== "info") : [];
        const transcript = fresh.length ? `[Group chat so far]\n${fresh.map((m) => `${m.role === "user" ? "User" : agents.get(m.agentId || "", owner)?.name || "Agent"}: ${m.text.slice(0, 400)}`).join("\n")}\n\n[User now]\n` : "";
        const msg: ChatMsg = { id: nanoid(8), role: "agent", agentId: a.id, text: "", at: now(), cards: [] };
        c.msgs.push(msg); emit({ type: "speaker", agentId: a.id, name: a.name, color: a.color, msgId: msg.id });
        const persona: Persona = { agentId: a.id, name: a.name, brief: a.brief, notes: a.notes, filmStyle: a.filmStyle, projectId: a.projectId, approval: a.approval,
          others: c.agentIds.filter((x) => x !== a.id).map((x) => agents.get(x, owner)?.name).filter(Boolean).join(", "),
          onNote: async (n) => { if (self) { c.notes = [...(c.notes || []), n].slice(-40); await chats.save(c); return; } const cur = agents.get(a.id, owner); if (cur) { cur.notes = [...cur.notes, n].slice(-40); await db.putDoc("agents", cur); } } };
        const history = c.msgs.filter((m) => m !== msg && (m.role === "user" || m.agentId === a.id)).slice(-16, -1).map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.text }));
        const { stream } = agentStream({ convId: convKey(c.id, a.id), message: transcript + text, ownerId: owner, persona, history, autoResearch: false });
        const rd = stream.getReader(); const dec = new TextDecoder(); let buf = "";
        let lastSave = Date.now();
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
            let e: Record<string, unknown>; try { e = JSON.parse(line); } catch { continue; }
            if (e.type === "conv") continue;
            if (e.type === "delta") msg.text += String(e.text || "");
            else if (e.type === "turn_end") { if (msg.text && !msg.text.endsWith("\n\n")) msg.text += "\n\n"; }
            else if (e.type === "tool_start") msg.cards!.push({ id: String(e.id), name: String(e.name) });
            else if (e.type === "tool_end") { const k = msg.cards!.find((x) => x.id === e.id); if (k) { k.ok = !!e.ok; k.summary = String(e.summary || "").slice(0, 300); } }
            else if (e.type === "project") { msg.projectId = String(e.id); if (self) { c.projectIds = [...new Set([...(c.projectIds || []), msg.projectId])]; } else if (!a.projectId) { const cur = agents.get(a.id, owner); if (cur) { cur.projectId = msg.projectId; await db.putDoc("agents", cur); } } }
            else if (e.type === "done" && e.projectId) { msg.projectId ||= String(e.projectId); if (self) c.projectIds = [...new Set([...(c.projectIds || []), String(e.projectId)])]; }
            emit({ ...e, agentId: a.id, msgId: msg.id });
            if (Date.now() - lastSave > 4000) { lastSave = Date.now(); await chats.save(c); }
          }
        }
        msg.text = msg.text.trim(); if (!msg.text && !msg.cards!.length) msg.text = "(no reply)";
        await chats.save(c);
        if (getConv(convKey(c.id, a.id))?.abort) break; // Stop pressed: later agents don't start
      }
      c.busy = false; await chats.save(c);
      emit({ type: "done" }); try { ctrl.close(); } catch { /* */ }
    },
  });
}

/** Stop button: abort every agent run in the chat. */
export function stopChat(c: ChatRec) {
  let n = 0;
  for (const id of c.agentIds.length ? c.agentIds : [c.id]) { const v = getConv(convKey(c.id, id)); if (v?.busy) { interrupt(v, "stop"); n++; } else if (v) v.abort = true; }
  return n;
}
