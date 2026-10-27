import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { db, MEDIA_DIR } from "./db";
import { getConfig } from "./config";
import { FORMATS, type Project } from "./types";
import { activeJobs, purgeProjectJobs } from "./jobs";
import { dropProjectClips } from "./render";
import { r2DeletePrefix } from "./storage";
import { anonymizeProject } from "./usage";
import { allSessions } from "./research";
import { forgetProjectInConvs } from "./agent";

export function newProject(b: Record<string, any>, ownerId: string): Project { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = new Date().toISOString();
  const format = (b.format in FORMATS ? b.format : "yt_shorts") as Project["format"];
  return {
    id: nanoid(10), ownerId, title: String(b.title || "Untitled project").slice(0, 120), mode: ["drama", "documentary", "ad"].includes(b.mode) ? b.mode : "drama",
    format, aspect: ["9:16", "16:9", "1:1", "4:5"].includes(b.aspect) ? b.aspect : FORMATS[format].aspect,
    style: ["realistic", "pixar", "cartoon", "anime", "custom"].includes(b.style) ? b.style : "realistic", customStyle: b.customStyle || "",
    outputType: b.outputType === "video" ? "video" : "image", idea: String(b.idea || ""), script: String(b.script || ""), brainstorm: [], assets: [], scenes: [], bible: "",
    narratorVoice: getConfig("DEFAULT_NARRATOR") || "en-US-AndrewNeural", music: b.mode === "ad" ? "upbeat" : b.mode === "documentary" ? "ambient" : "tension", subtitles: true,
    render: { status: "idle", progress: 0, message: "", updatedAt: t }, editLog: [], createdAt: t, updatedAt: t,
  };
}
export async function createProject(b: Record<string, unknown>, ownerId: string) { const p = newProject(b, ownerId); await db.saveProject(p); return p; }

/** Delete a project and everything it produced: running jobs, DB row, job records, local media, R2 objects, research sessions, chat links.
 *  Cost rows are kept for billing totals but lose their project id. Learned user memory is untouched. */
export async function purgeProject(id: string) {
  const running = activeJobs(id).length;
  dropProjectClips(id);
  for (const s of allSessions()) if (s.projectId === id) { s.stop = true; s.projectId = undefined; s.notes = ""; s.findings = []; s.steps = []; s.frames = []; s.transcript = undefined; }
  forgetProjectInConvs(id);
  await db.deleteProject(id);
  const jobs = purgeProjectJobs(id);
  const dir = path.join(MEDIA_DIR, id);
  const rm = () => fs.rmSync(dir, { recursive: true, force: true });
  rm();
  // a render/ffmpeg step that was mid-write can still flush a file: sweep again once it has unwound
  for (const ms of [15_000, 90_000, 600_000]) setTimeout(() => { try { if (fs.existsSync(dir)) rm(); void r2DeletePrefix(`media/${id}/`); } catch { /* */ } }, ms).unref?.();
  const r2 = await r2DeletePrefix(`media/${id}/`);
  const usage = anonymizeProject(id);
  return { ok: true, cancelledJobs: running, jobRecords: jobs, r2, usageRowsAnonymized: usage, mediaLeft: fs.existsSync(dir) };
}
