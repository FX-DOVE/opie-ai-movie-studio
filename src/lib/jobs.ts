import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { DATA_DIR } from "./db";

/**
 * Durable background jobs. Every long action (script, references, storyboard, frames, continuity, voice, render, …)
 * runs server-side, detached from the HTTP request that started it. Job records are persisted to DATA_DIR/jobs.json
 * (the same durable volume as the project DB), so a client can close the tab or refresh and reconnect by job id or by
 * listing a project's active jobs; after a container restart unfinished jobs are resumed (idempotent actions) or
 * marked interrupted with a clear message.
 */
export type JobState = "running" | "done" | "error" | "interrupted";
export type Job = {
  id: string; kind: "action" | "stream"; projectId?: string; action?: string; busyKey?: string; label?: string;
  body?: Record<string, unknown>; state: JobState; done: boolean; status: number; result?: unknown; error?: string;
  events: unknown[]; t: number; startedAt: number; attempts: number;
};
type Runner = (projectId: string, body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;

const FILE = path.join(DATA_DIR, "jobs.json");
const g = globalThis as unknown as { __jobs?: Map<string, Job>; __jobsLoaded?: boolean; __jobRunner?: Runner; __jobsTimer?: NodeJS.Timeout | null };
const J: Map<string, Job> = g.__jobs || (g.__jobs = new Map());

function loadOnce() {
  if (g.__jobsLoaded) return; g.__jobsLoaded = true;
  try {
    if (!fs.existsSync(FILE)) return;
    const arr: Job[] = JSON.parse(fs.readFileSync(FILE, "utf8"));
    for (const j of arr) if (!J.has(j.id)) J.set(j.id, j);
  } catch (e) { console.warn("[jobs] could not read jobs.json:", (e as Error).message); }
}
/** Persist (debounced). Stream deltas are coalesced and big payloads trimmed so the file stays small. */
function save(now = false) {
  const write = () => {
    g.__jobsTimer = null;
    try {
      const arr = [...J.values()].sort((a, b) => b.t - a.t).slice(0, 300).map((j) => ({
        ...j,
        result: j.result && typeof j.result === "object" ? { ...(j.result as Record<string, unknown>), project: undefined } : j.result,
        events: j.events.length > 400 ? j.events.slice(-400) : j.events,
      }));
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE + ".tmp", JSON.stringify(arr)); fs.renameSync(FILE + ".tmp", FILE);
    } catch (e) { console.warn("[jobs] persist failed:", (e as Error).message); }
  };
  if (now) { if (g.__jobsTimer) clearTimeout(g.__jobsTimer); write(); return; }
  if (!g.__jobsTimer) g.__jobsTimer = setTimeout(write, 700);
}
const gc = () => { const old = Date.now() - 24 * 3600_000; for (const [k, j] of J) if (j.done && j.t < old) J.delete(k); };

export const getJob = (id: string) => { loadOnce(); return J.get(id); };
export const activeJobs = (projectId?: string) => { loadOnce(); return [...J.values()].filter((j) => !j.done && (!projectId || j.projectId === projectId)); };
export const recentJobs = (projectId: string, n = 20) => { loadOnce(); return [...J.values()].filter((j) => j.projectId === projectId).sort((a, b) => b.t - a.t).slice(0, n); };
export const setRunner = (r: Runner) => { g.__jobRunner = r; };

function finish(job: Job, status: number, body: unknown) {
  job.status = status; job.result = body; job.done = true; job.t = Date.now();
  job.state = status < 400 ? "done" : "error";
  if (status >= 400) job.error = String((body as { error?: string })?.error || "Job failed");
  save(true);
}
function execute(job: Job) {
  const run = g.__jobRunner;
  if (!run || !job.projectId) { finish(job, 500, { error: "No job runner registered" }); return; }
  job.attempts++; job.state = "running"; job.done = false; job.t = Date.now(); save(true);
  run(job.projectId, job.body || {})
    .then((r) => finish(job, r.status, r.body))
    .catch((e) => finish(job, 500, { error: (e as Error).message || "Job failed" }));
}

/** Start a durable action job; returns its id immediately. The work runs in this server process, not in the request. */
export function startJob(o: { projectId: string; action: string; busyKey?: string; body: Record<string, unknown>; label?: string }): string {
  loadOnce(); gc();
  const job: Job = { id: nanoid(10), kind: "action", projectId: o.projectId, action: o.action, busyKey: o.busyKey || o.action, label: o.label, body: o.body, state: "running", done: false, status: 202, events: [], t: Date.now(), startedAt: Date.now(), attempts: 0 };
  J.set(job.id, job);
  execute(job);
  return job.id;
}

/** Actions that are safe to re-run from scratch after a server restart. */
const RESUMABLE = new Set(["writeScript", "extractAssets", "autofillAsset", "assetImage", "autocreateAssets", "expandSpec", "buildStoryboard", "frame", "autofillFrames", "autoContinuity", "continuity", "continuityAll", "fixContinuity", "voiceShot", "voiceAll", "clip", "clipAll"]);

/** Called once per server boot: resume or close out jobs that were running when the process stopped. */
export function recoverJobs(): { resumed: string[]; interrupted: string[] } {
  loadOnce();
  const resumed: string[] = [], interrupted: string[] = [];
  for (const j of J.values()) {
    if (j.done) continue;
    if (j.kind === "action" && j.action && RESUMABLE.has(j.action) && j.attempts < 3 && g.__jobRunner) { resumed.push(j.id); execute(j); }
    else {
      j.done = true; j.state = "interrupted"; j.status = 503; j.t = Date.now();
      j.error = "The server restarted while this was running — please try again.";
      j.result = { error: j.error };
      if (j.kind === "stream") j.events.push({ type: "error", error: j.error });
      interrupted.push(j.id);
    }
  }
  save(true);
  return { resumed, interrupted };
}

/** Tee an NDJSON stream into a durable job buffer (read in the background, independent of the client) and return a client stream with a job header + heartbeats. */
export function streamJob(src: ReadableStream<Uint8Array>, meta: { projectId?: string; action?: string; label?: string } = {}): Response {
  loadOnce(); gc();
  const job: Job = { id: nanoid(10), kind: "stream", ...meta, state: "running", done: false, status: 200, events: [], t: Date.now(), startedAt: Date.now(), attempts: 1 };
  J.set(job.id, job); save();
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const h: { push?: (l: string) => void; close?: () => void } = {};
  (async () => {
    const rd = src.getReader(); let buf = "";
    try {
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { job.events.push(JSON.parse(line)); } catch { /* */ } job.t = Date.now(); save(); h.push?.(line); }
      }
      job.state = "done";
    } catch (e) { const l = JSON.stringify({ type: "error", error: (e as Error).message }); job.events.push(JSON.parse(l)); h.push?.(l); job.state = "error"; job.error = (e as Error).message; }
    job.done = true; job.t = Date.now(); save(true); h.close?.();
  })();
  const out = new ReadableStream<Uint8Array>({
    start(c) {
      let open = true;
      const send = (s: string) => { if (open) try { c.enqueue(enc.encode(s + "\n")); } catch { open = false; } };
      send(JSON.stringify({ type: "job", id: job.id }));
      for (const e of job.events) send(JSON.stringify(e));
      h.push = send;
      const hb = setInterval(() => send(JSON.stringify({ type: "ping" })), 8000); // keeps proxies/tunnels from idling the connection out
      h.close = () => { clearInterval(hb); if (open) { open = false; try { c.close(); } catch { /* */ } } };
      if (job.done) h.close?.();
    },
    cancel() { h.push = undefined; }, // client went away — the job keeps running
  });
  return new Response(out, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}

/** Project ids with a script being written in THIS server process (a stale `writing` flag after a restart is ignored). */
export const WRITING: Set<string> = ((globalThis as unknown as { __rfWriting?: Set<string> }).__rfWriting ??= new Set());
