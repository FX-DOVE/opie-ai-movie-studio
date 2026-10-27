import type { Browser, BrowserContext } from "playwright-core";

/** Bridge to the real Linux desktop service (desk/server.mjs). */
export const DESK_URL = process.env.DESK_URL || "http://127.0.0.1:7900";
const CDP_URL = process.env.DESK_CDP_URL || "http://127.0.0.1:9333";
const g = globalThis as unknown as { __deskBrowser?: Promise<Browser> };

export async function desk(p: string, body?: unknown, timeout = 15000) {
  return fetch(DESK_URL + p, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout), cache: "no-store" });
}
export async function deskStatus(): Promise<{ state: string; control: boolean } | null> {
  try { const r = await desk("/status", undefined, 2000); return r.ok ? await r.json() : null; } catch { return null; }
}
export const deskControl = async () => !!(await deskStatus())?.control;

/** The agent drives the SAME Chromium the user sees, via CDP. Wakes the desktop and opens the browser if needed. */
export async function deskContext(): Promise<BrowserContext | null> {
  if (process.env.DESK_AGENT === "0" || !(await deskStatus())) return null;
  const up = async () => { try { return (await fetch(CDP_URL + "/json/version", { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
  if (!(await up())) {
    await desk("/browser", {});
    for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 300));
  }
  if (!g.__deskBrowser) g.__deskBrowser = (async () => {
    const { chromium } = await import("playwright-core");
    const b = await chromium.connectOverCDP(CDP_URL);
    b.on("disconnected", () => { g.__deskBrowser = undefined; });
    return b;
  })().catch((e) => { g.__deskBrowser = undefined; throw e; });
  const b = await g.__deskBrowser;
  return b.contexts()[0] || null;
}

/** The desk Chromium's context only if it is already running (never launches anything — used by quick UI probes). */
export async function deskContextIfUp(): Promise<BrowserContext | null> {
  try { if (!(await fetch(CDP_URL + "/json/version", { signal: AbortSignal.timeout(600) })).ok) return null; } catch { return null; }
  return deskContext();
}
