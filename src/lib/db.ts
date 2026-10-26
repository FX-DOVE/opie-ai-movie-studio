import fs from "node:fs";
import path from "node:path";
import type { Project } from "./types";

// Tiny durable JSON document store (atomic writes, serialized). Swap for Postgres via the same interface.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DBShape { projects: Record<string, Project>; settings: Record<string, string> }

let cache: DBShape | null = null;
let chain: Promise<unknown> = Promise.resolve();

function load(): DBShape {
  if (cache) return cache;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) cache = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  else cache = { projects: {}, settings: {} };
  return cache!;
}
function persist() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

export const db = {
  listProjects(): Project[] {
    return Object.values(load().projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    return (chain = chain.then(() => { delete load().projects[id]; persist(); }));
  },
  getSetting(k: string) { return load().settings[k]; },
  allSettings() { return { ...load().settings }; },
  async setSetting(k: string, v: string | undefined) {
    return (chain = chain.then(() => {
      if (v === undefined) delete load().settings[k]; else load().settings[k] = v;
      persist();
    }));
  },
};

export function projectMediaDir(id: string) {
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
