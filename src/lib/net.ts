"use client";
/** Resilient client networking: detached jobs + resumable NDJSON streams, friendly errors. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Headers every API call carries: JSON + the tunnel bypass (so a proxy never swaps the reply for an HTML page). */
export const H = { "Content-Type": "application/json", "X-Pinggy-No-Screen": "1" };
const isHtml = (r: Response) => /text\/html/i.test(r.headers.get("content-type") || "");
export function friendly(e: unknown): string {
  const m = (e as Error)?.message || String(e);
  if (/load failed|failed to fetch|networkerror|network error|the network connection was lost|terminated/i.test(m)) return "Connection to ReelForge dropped. Check your network and tap retry — any work already started keeps running.";
  if (/timed? ?out|aborted due to timeout/i.test(m)) return "That took too long. The AI may be busy — please retry in a moment.";
  return m;
}
async function poll(id: string, since: number, onEvent?: (e: Record<string, unknown>) => void, signal?: AbortSignal, maxMs = 20 * 60_000) {
  const t0 = Date.now(); let n = since; let fails = 0;
  while (Date.now() - t0 < maxMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const r = await fetch(`/api/jobs/${id}?since=${n}`, { cache: "no-store", signal, headers: H });
      const j = await r.json(); if (r.status === 404) throw Object.assign(new Error(j.error || "Task lost"), { gone: true }); if (!r.ok) throw new Error(j.error || "Task lost");
      fails = 0; for (const e of j.events) onEvent?.(e); n = j.next;
      if (j.done) return j as { status: number; body: Record<string, unknown> };
    } catch (e) { if ((e as Error).name === "AbortError" || (e as { gone?: boolean }).gone) throw e; if (++fails > 20) throw e; }
    await sleep(Math.min(1200 + fails * 800, 6000));
  }
  throw new Error("timed out");
}
/** Wait for an already-started job (e.g. one found again after a page refresh). */
export async function waitJob<T = Record<string, unknown>>(id: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; data: T }> {
  const j = await poll(id, 0, undefined, signal, 3 * 3600_000);
  return { ok: j.status < 400, status: j.status, data: (j.body || {}) as T };
}
/** Re-attach to a stream job by id after a refresh: replays every event from the start, then follows it live. */
export async function resumeStream(id: string, onEvent: (e: Record<string, unknown>) => void, signal?: AbortSignal) {
  await poll(id, 0, onEvent, signal, 3 * 3600_000);
}
/** POST a long action as a detached job and wait for the result (survives dropped connections). */
export async function jobPost<T = Record<string, unknown>>(url: string, body: unknown, signal?: AbortSignal): Promise<{ ok: boolean; status: number; data: T }> {
  let id = "";
  for (let a = 0; a < 3 && !id; a++) {
    try { const r = await fetch(url, { method: "POST", headers: { ...H, "x-job": "1" }, body: JSON.stringify(body), signal }); if (isHtml(r)) throw new Error("Failed to fetch (tunnel page)"); const j = await r.json(); if (!r.ok && !j.job) return { ok: false, status: r.status, data: j }; id = j.job; }
    catch (e) { if ((e as Error).name === "AbortError" || a === 2) throw new Error(friendly(e)); await sleep(1500 * (a + 1)); }
  }
  const j = await poll(id, 0, undefined, signal, 3 * 3600_000).catch((e) => { throw new Error(friendly(e)); });
  return { ok: j.status < 400, status: j.status, data: j.body as T };
}
/** Stream NDJSON; if the connection drops or stalls, resume from the server-side job buffer by polling. */
export async function ndjson(url: string, body: unknown, onEvent: (e: Record<string, unknown>) => void, signal?: AbortSignal, onJob?: (id: string) => void) {
  let job = ""; let seen = 0;
  const handle = (e: Record<string, unknown>) => { if (e.type === "job") { job = String(e.id); onJob?.(job); return; } if (e.type === "ping") return; seen++; onEvent(e); };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body), signal, cache: "no-store" });
      if (isHtml(r)) throw new Error("Failed to fetch (tunnel page)"); // the proxy answered, not the app — safe to retry
      if (!r.ok || !r.body) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`), { http: true });
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      // watchdog: some mobile networks/proxies buffer streams — if nothing arrives for 15s, switch to polling the job
      let last = Date.now(); const wd = setInterval(() => { if (Date.now() - last > 15000) rd.cancel().catch(() => {}); }, 3000);
      try {
        for (;;) { const { value, done } = await rd.read(); if (done) break; last = Date.now(); buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) try { handle(JSON.parse(l)); } catch { /* */ } } }
      } finally { clearInterval(wd); }
      if (!job && attempt < 2) { await sleep(1500); continue; } // stalled before the server acknowledged — retry
      if (job) { const j = await fetch(`/api/jobs/${job}?since=0`, { headers: H, cache: "no-store" }).then((x) => x.json()).catch(() => null); if (!j || !j.done) await poll(job, seen, onEvent, signal, 3 * 3600_000); }
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError" || (e as { http?: boolean }).http) throw e;
      if (!job) { if (attempt < 2) { await sleep(1500 * (attempt + 1)); continue; } throw new Error(friendly(e)); }
      onEvent({ type: "status", text: "Connection hiccup — reconnecting…" });
      await poll(job, seen, onEvent, signal).catch((x) => { throw new Error(friendly(x)); });
      return;
    }
  }
}
