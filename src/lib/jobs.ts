import { nanoid } from "nanoid";
/** Detached jobs: long LLM/render work keeps running even if the client's connection (or a tunnel) drops; clients resume by polling. */
export type Job = { id: string; events: unknown[]; done: boolean; status: number; body?: unknown; t: number };
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const J: Map<string, Job> = g.__jobs || (g.__jobs = new Map());
const gc = () => { const old = Date.now() - 30 * 60_000; for (const [k, j] of J) if (j.done && j.t < old) J.delete(k); };
export const getJob = (id: string) => J.get(id);

/** Run a request-like function detached; returns the job id immediately. */
export function startJob(fn: () => Promise<Response>): string {
  gc(); const job: Job = { id: nanoid(10), events: [], done: false, status: 202, t: Date.now() }; J.set(job.id, job);
  fn().then(async (r) => { job.status = r.status; job.body = await r.json().catch(() => ({})); })
    .catch((e) => { job.status = 500; job.body = { error: (e as Error).message || "Job failed" }; })
    .finally(() => { job.done = true; job.t = Date.now(); });
  return job.id;
}

/** Tee an NDJSON stream into a job buffer (read in the background, independent of the client) and return a client stream with a job header + heartbeats. */
export function streamJob(src: ReadableStream<Uint8Array>): Response {
  gc(); const job: Job = { id: nanoid(10), events: [], done: false, status: 200, t: Date.now() }; J.set(job.id, job);
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const h: { push?: (l: string) => void; close?: () => void } = {};
  (async () => {
    const rd = src.getReader(); let buf = "";
    try {
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { job.events.push(JSON.parse(line)); } catch { /* */ } h.push?.(line); }
      }
    } catch (e) { const l = JSON.stringify({ type: "error", error: (e as Error).message }); job.events.push(JSON.parse(l)); h.push?.(l); }
    job.done = true; job.t = Date.now(); h.close?.();
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
