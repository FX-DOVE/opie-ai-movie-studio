import fs from "node:fs";
import path from "node:path";
import type { Project, UserMemory } from "./types";

// Tiny durable JSON document store (atomic writes, serialized). Swap for Postgres via the same interface.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
const DB_FILE = path.join(DATA_DIR, "db.json");

export interface UserRec { id: string; email: string; name?: string; hash: string; role: "admin" | "user"; createdAt: string }
interface DBShape { projects: Record<string, Project>; settings: Record<string, string>; users?: Record<string, UserRec>; memory?: Record<string, UserMemory>; docs?: Record<string, Record<string, { id: string; ownerId: string; updatedAt?: string }>> }

let cache: DBShape | null = null;
let chain: Promise<unknown> = Promise.resolve();

function load(): DBShape {
  if (cache) return cache;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) cache = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  else cache = { projects: {}, settings: {} };
  cache!.users ||= {}; cache!.memory ||= {};
  // projects created before accounts existed belong to the admin
  for (const p of Object.values(cache!.projects)) if (!p.ownerId) p.ownerId = "admin";
  return cache!;
}
function persist() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

export const db = {
  listProjects(ownerId?: string): Project[] {
    return Object.values(load().projects).filter((p) => !ownerId || p.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  findUserByEmail(email: string) { return Object.values(load().users!).find((u) => u.email === email.toLowerCase()); },
  getUser(id: string) { return load().users![id]; },
  async saveUser(u: UserRec) { return (chain = chain.then(() => { load().users![u.id] = u; persist(); })); },
  getMemory(uid: string): UserMemory { return load().memory![uid] || { enabled: true, notes: [] }; },
  async setMemory(uid: string, fn: (m: UserMemory) => void) {
    return (chain = chain.then(() => { const m = load().memory![uid] || { enabled: true, notes: [] }; fn(m); m.updatedAt = new Date().toISOString(); load().memory![uid] = m; persist(); return m; })) as Promise<UserMemory>;
  },
  getProject(id: string): Project | undefined {
    return load().projects[id];
  },
  async saveProject(p: Project) {
    return (chain = chain.then(() => {
      p.updatedAt = new Date().toISOString();
      load().projects[p.id] = p;
      persist();
    }));
  },
  async update(id: string, fn: (p: Project) => void) {
    const p = load().projects[id];
    if (!p) throw new Error("not found");
    fn(p);
    await this.saveProject(p);
    return p;
  },
  async deleteProject(id: string) {
    DELETED.add(id);
    return (chain = chain.then(() => { delete load().projects[id]; persist(); }));
  },
  /** Generic owner-scoped collections (agents, chats). */
  listDocs<T extends { id: string; ownerId: string; updatedAt?: string }>(kind: string, ownerId?: string): T[] {
    const c = (load().docs ||= {})[kind] || {}; return (Object.values(c) as T[]).filter((d) => !ownerId || d.ownerId === ownerId).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },
  getDoc<T>(kind: string, id: string): T | undefined { return ((load().docs ||= {})[kind] || {})[id] as T | undefined; },
  async putDoc<T extends { id: string; ownerId: string; updatedAt?: string }>(kind: string, d: T) {
    return (chain = chain.then(() => { d.updatedAt = new Date().toISOString(); ((load().docs ||= {})[kind] ||= {})[d.id] = d; persist(); return d; })) as Promise<T>;
  },
  async delDoc(kind: string, id: string) { return (chain = chain.then(() => { const c = (load().docs ||= {})[kind]; if (c) delete c[id]; persist(); })); },
  getSetting(k: string) { return load().settings[k]; },
  allSettings() { return { ...load().settings }; },
  async setSetting(k: string, v: string | undefined) {
    return (chain = chain.then(() => {
      if (v === undefined) delete load().settings[k]; else load().settings[k] = v;
      persist();
    }));
  },
};

/** Projects deleted in this process: background work that is still unwinding may not recreate their media folder. */
export const DELETED: Set<string> = ((globalThis as unknown as { __rfDeleted?: Set<string> }).__rfDeleted ??= new Set());
export function projectMediaDir(id: string) {
  if (DELETED.has(id)) throw new Error("This project was deleted.");
  const d = path.join(MEDIA_DIR, id);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function mediaUrl(abs: string) {
  return "/api/files/" + path.relative(MEDIA_DIR, abs).split(path.sep).join("/");
}
export function mediaPath(url: string) {
  const rel = url.replace(/^\/api\/files\//, "").split("?")[0];
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR)) throw new Error("bad path");
  return abs;
}
