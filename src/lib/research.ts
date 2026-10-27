import { deskContext } from "./desk";
import { nanoid } from "nanoid";
import type { Browser, BrowserContext, Page } from "playwright-core";
import path from "node:path";
import { DATA_DIR } from "./db";
import { getConfig, llmChain, llmLabel } from "./config";
import { db } from "./db";
import { chatP, llmLive, metaLive, parseJson, type Msg } from "./providers/meta";

export type Task = "trending" | "analyse" | "watch" | "custom";
export interface Step { n: number; at: string; action: string; thought?: string; shot?: string; kind?: "act" | "note" | "info" | "error" }
export interface Video { title: string; channel: string; views?: string; url: string; thumb?: string; published?: string; length?: string }
export interface Session {
  inbox?: string[]; redirects?: string[]; control?: boolean; needsUser?: string; manualLog?: string[];
  id: string; goal: string; task: Task; url?: string; projectId?: string;
  status: "running" | "paused" | "done" | "error" | "stopped";
  steps: Step[]; notes: string; findings: string[]; trending: Video[]; frames: string[]; transcript?: string;
  mode: "meta-wonder" | "llm-agent" | "scripted" | "manual"; provider: string; error?: string;
  stop?: boolean; pause?: boolean; maxSteps: number; screen?: string; pageUrl?: string; startedAt: string; savedToProject?: boolean; onDesk?: boolean;
}

const g = globalThis as unknown as { __opieResearch?: Map<string, Session> };
const sessions = (g.__opieResearch ||= new Map());
export const getSession = (id: string) => sessions.get(id);
export const allSessions = () => [...sessions.values()];
export const listSessions = () => [...sessions.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20).map(({ id, goal, task, status, startedAt, provider }) => ({ id, goal, task, status, startedAt, provider }));
/** Client-safe view (drops heavy per-step screenshots except the last few). */
export function viewSession(s: Session, since = 0) { return { ...s, steps: s.steps.filter((x) => x.n > since) }; }

const W = 1280, H = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function browser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
}
export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const gp = globalThis as unknown as { __opieCtx?: Promise<BrowserContext>; __opiePages?: Map<string, Page> };
export const pages = (gp.__opiePages ||= new Map());
/** One persistent Chromium profile (cookies/logins survive restarts). Set BROWSER_HEADFUL=1 (under Xvfb) to look less automated. */
export function profileContext(): Promise<BrowserContext> {
  if (!gp.__opieCtx) gp.__opieCtx = (async () => {
    const { chromium } = await import("playwright-core");
    const headful = process.env.BROWSER_HEADFUL === "1";
    const ctx = await chromium.launchPersistentContext(path.join(DATA_DIR, "browser-profiles", getConfig("BROWSER_PROFILE") || "default"), {
      headless: !headful, executablePath: (headful ? process.env.CHROMIUM_HEADFUL_PATH : process.env.CHROMIUM_PATH) || undefined,
      viewport: { width: W, height: H }, locale: "en-US", userAgent: UA, ignoreDefaultArgs: ["--enable-automation"],
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--disable-blink-features=AutomationControlled"],
    });
    ctx.on("close", () => { gp.__opieCtx = undefined; });
    return ctx;
  })().catch((e) => { gp.__opieCtx = undefined; throw e; });
  return gp.__opieCtx;
}
export const isSignIn = async (page: Page) => /accounts\.google\.com|\/signin|\/login|ServiceLogin/i.test(page.url()) || (await page.locator("input[type=password]:visible").count().catch(() => 0)) > 0;
async function snap(page: Page, quality = 55) {
  return "data:image/jpeg;base64," + (await page.screenshot({ type: "jpeg", quality })).toString("base64");
}
async function refresh(s: Session, page: Page) {
  s.screen = await snap(page).catch(() => s.screen);
  s.pageUrl = page.url();
}
async function log(s: Session, page: Page | null, action: string, thought?: string, kind: Step["kind"] = "act") {
  if (page) await refresh(s, page);
  s.steps.push({ n: s.steps.length + 1, at: new Date().toISOString(), action, thought, kind, shot: page ? s.screen : undefined });
  s.steps.slice(0, -4).forEach((x: Step) => delete x.shot);
}
/** Honour Stop / Pause between actions. Returns false when stopped. */
async function gate(s: Session) {
  while ((s.pause || s.control) && !s.stop) await sleep(400);
  if (s.status === "paused" && !s.stop) s.status = "running";
  return !s.stop;
}

// ───────────── Page helpers ─────────────
async function dismissConsent(page: Page) {
  const b = page.locator('button:has-text("Accept all"), button:has-text("Reject all"), button[aria-label*="Accept"]').first();
  if (await b.isVisible({ timeout: 1500 }).catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(1500); }
}
async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(2200);
  await dismissConsent(page);
}

/** Accessibility-style snapshot: numbered interactive elements + visible text. */
async function observe(page: Page) {
  return page.evaluate(() => {
    document.querySelectorAll("[data-opie]").forEach((e) => e.removeAttribute("data-opie"));
    const els = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, textarea, [role="button"], [role="link"], [role="tab"], select'));
    const out: string[] = []; let n = 0;
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const st = getComputedStyle(e); if (st.visibility === "hidden" || st.display === "none") continue;
      const label = (e.getAttribute("aria-label") || e.getAttribute("title") || (e as HTMLInputElement).placeholder || e.innerText || (e as HTMLInputElement).value || "").replace(/\s+/g, " ").trim().slice(0, 90);
      if (!label && e.tagName !== "INPUT" && e.tagName !== "TEXTAREA") continue;
      e.setAttribute("data-opie", String(++n));
      const href = (e as HTMLAnchorElement).href ? ` → ${(e as HTMLAnchorElement).href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}` : "";
      out.push(`[${n}] ${e.tagName.toLowerCase()}${e.getAttribute("role") ? `(${e.getAttribute("role")})` : ""} "${label}"${href}`);
      if (n >= 70) break;
    }
    const text = (document.body?.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 2200);
    return { title: document.title, url: location.href, elements: out.join("\n"), text };
  });
}

async function scrapeResults(page: Page): Promise<Video[]> {
  return page.$$eval("ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer", (els) => els.slice(0, 20).map((e) => {
    const a = (["a#video-title", "a#video-title-link", "h3 a", "a.yt-lockup-metadata-view-model-wiz__title", "a[href*='/watch']"].map((q) => e.querySelector(q)).find(Boolean) as HTMLAnchorElement | null);
    const meta = Array.from(e.querySelectorAll("#metadata-line span, .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text")).map((x) => (x as HTMLElement).innerText.trim());
    return {
      title: (a?.getAttribute("title") || a?.innerText || "").trim(),
      url: a?.href || "",
      channel: ((e.querySelector("ytd-channel-name #text") || e.querySelector("ytd-channel-name a") || e.querySelector(".yt-content-metadata-view-model-wiz__metadata-text")) as HTMLElement | null)?.innerText?.trim() || "",
      views: meta[0] || "", published: meta[1] || "",
      thumb: (e.querySelector("img") as HTMLImageElement)?.src || "",
      length: ((e.querySelector("badge-shape, ytd-thumbnail-overlay-time-status-renderer") as HTMLElement)?.innerText || "").trim().split("\n")[0],
    };
  })).then((v) => v.filter((x) => x.title && x.url.includes("/watch")).map((x) => ({ ...x, thumb: x.thumb || `https://i.ytimg.com/vi/${new URL(x.url).searchParams.get("v")}/mqdefault.jpg` }))).catch(() => []);
}

/** Transcript: caption track JSON first, then the "Show transcript" panel. */
async function transcript(page: Page): Promise<string> {
  const viaTrack = await page.evaluate(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pr = (window as any).ytInitialPlayerResponse;
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const t = tracks.find((x: { languageCode: string }) => x.languageCode?.startsWith("en")) || tracks[0];
      if (!t) return "";
      const r = await fetch(t.baseUrl + "&fmt=json3"); const txt = await r.text(); if (!txt) return "";
      const j = JSON.parse(txt);
      return (j.events || []).map((e: { segs?: { utf8: string }[] }) => (e.segs || []).map((s) => s.utf8).join("")).join(" ").replace(/\s+/g, " ").trim();
    } catch { return ""; }
  }).catch(() => "");
  if (viaTrack.length > 80) return viaTrack;
  try {
    await page.locator("#description-inline-expander, tp-yt-paper-button#expand").first().click({ timeout: 3000 }).catch(() => {});
    await page.locator('button:has-text("Show transcript"), ytd-button-renderer:has-text("Show transcript") button').first().click({ timeout: 4000 });
    await page.waitForSelector("ytd-transcript-segment-renderer", { timeout: 8000 });
    return (await page.$$eval("ytd-transcript-segment-renderer", (els) => els.map((e) => (e.querySelector(".segment-text, yt-formatted-string") as HTMLElement)?.innerText || "").join(" "))).replace(/\s+/g, " ").trim();
  } catch { return ""; }
}

/** Sample N frames from the playing video element. */
async function sampleFrames(page: Page, n = 4): Promise<string[]> {
  const v = page.locator("video").first();
  if (!(await v.count())) return [];
  await page.evaluate(() => { const el = document.querySelector("video"); if (el) { el.muted = true; el.play().catch(() => {}); } }).catch(() => {});
  await page.waitForTimeout(2500);
  const dur = await page.evaluate(() => document.querySelector("video")?.duration || 0).catch(() => 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (dur && isFinite(dur)) { await page.evaluate((t) => { const el = document.querySelector("video"); if (el) el.currentTime = t; }, (dur * (i + 0.5)) / n).catch(() => {}); await page.waitForTimeout(1800); }
    else await page.waitForTimeout(2500);
    const b = await v.screenshot({ type: "jpeg", quality: 60, timeout: 5000 }).catch(() => null);
    if (b) out.push("data:image/jpeg;base64," + b.toString("base64"));
  }
  return out;
}


export const videoId = (u?: string) => u?.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];

/** Watch a YouTube video in a player tab: captions via the player's own timedtext call, frames by seeking. Works even when watch pages are bot-gated. */
async function watchVideo(s: Session, page: Page, url: string): Promise<{ title?: string; channel?: string; transcript: string; frames: string[] }> {
  const id = videoId(url); if (!id) return { transcript: "", frames: [] };
  const meta = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as { title?: string; author_name?: string };
  const tab = await page.context().newPage();
  await tab.setViewportSize({ width: 640, height: 360 });
  let transcript = "";
  tab.on("response", async (r) => {
    if (!r.url().includes("/api/timedtext") || transcript) return;
    try { const j = JSON.parse(await r.text()); transcript = (j.events || []).map((e: { segs?: { utf8: string }[] }) => (e.segs || []).map((x) => x.utf8).join("")).join(" ").replace(/\s+/g, " ").trim(); } catch { /* ignore */ }
  });
  const frames: string[] = [];
  try {
    await tab.goto(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&cc_load_policy=1&cc_lang_pref=en&hl=en`, { waitUntil: "domcontentloaded", timeout: 30000, referer: "https://opie.studio/" });
    for (let i = 0; i < 20 && !transcript; i++) await tab.waitForTimeout(500);
    s.screen = await snap(tab).catch(() => s.screen); s.pageUrl = `youtube player · ${meta.title || id}`;
    const dur = await tab.evaluate(() => document.querySelector("video")?.duration || 0).catch(() => 0);
    if (dur && isFinite(dur)) {
      for (let i = 0; i < 4; i++) {
        await tab.evaluate((t) => { const v = document.querySelector("video"); if (v) { v.currentTime = t; v.play().catch(() => {}); } }, (dur * (i + 0.5)) / 4);
        await tab.waitForTimeout(1600);
        const b = await tab.locator("video").first().screenshot({ type: "jpeg", quality: 60, timeout: 5000 }).catch(() => null);
        if (b) frames.push("data:image/jpeg;base64," + b.toString("base64"));
      }
      if (frames.length) s.screen = frames[frames.length - 1];
    }
  } catch { /* fall through */ }
  await tab.close().catch(() => {});
  if (!frames.length) for (const n of ["1", "2", "3"]) { const r = await fetch(`https://i.ytimg.com/vi/${id}/${n}.jpg`).catch(() => null); if (r?.ok) frames.push("data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64")); }
  return { title: meta.title, channel: meta.author_name, transcript, frames };
}

async function describeFrames(frames: string[], ctx: string) {
  const r = await chatP([{ role: "user", content: [{ type: "text", text: `These are frames sampled across a YouTube video (${ctx}). Describe in 5 bullets: visual style, shot types, on-screen text, people/expressions, colour palette and editing pace. Only describe what you see.` }, ...frames.slice(0, 4).map((u) => ({ type: "image_url" as const, image_url: { url: u } }))] }], { vision: true, temperature: 0.2 });
  return r.text;
}

const blocked = (t: string) => /unusual traffic|not a robot|confirm you.re not a bot/i.test(t);

// ───────────── YouTube Data API (when keyed) ─────────────
async function youtubeApi(s: Session) {
  const key = getConfig("YOUTUBE_API_KEY"); if (!key) return false;
  const region = getConfig("YOUTUBE_REGION") || "NG";
  const map = (items: { id: string | { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt?: string; thumbnails: { medium: { url: string } } }; statistics?: { viewCount: string } }[]) =>
    items.map((v) => { const id = typeof v.id === "string" ? v.id : v.id.videoId; return { title: v.snippet.title, channel: v.snippet.channelTitle, views: v.statistics?.viewCount ? Number(v.statistics.viewCount).toLocaleString() + " views" : undefined, url: `https://www.youtube.com/watch?v=${id}`, thumb: v.snippet.thumbnails?.medium?.url, published: v.snippet.publishedAt?.slice(0, 10) }; });
  try {
    if (s.task !== "watch") {
      const after = new Date(Date.now() - 30 * 864e5).toISOString();
      const sr = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=15&regionCode=${region}&publishedAfter=${after}&q=${encodeURIComponent(s.goal)}&key=${key}`)).json();
      const ids = (sr.items || []).map((x: { id: { videoId: string } }) => x.id.videoId).join(",");
      if (ids) {
        const vr = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${key}`)).json();
        s.trending = map(vr.items || []);
      }
      const tr = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=8&regionCode=${region}&key=${key}`)).json();
      s.findings.push(`YouTube Data API — trending now in ${region}: ${map(tr.items || []).map((v) => `"${v.title}" (${v.views})`).join("; ")}`);
      await log(s, null, `YouTube Data API: ${s.trending.length} top videos for "${s.goal}" (last 30 days) + ${region} trending chart`, undefined, "info");
      return true;
    }
  } catch (e) { await log(s, null, "YouTube Data API failed", (e as Error).message, "error"); }
  return false;
}

// ───────────── LLM agent loop (vision + accessibility text) ─────────────
const TASK_BRIEF: Record<Task, (s: Session) => string> = {
  trending: (s) => `Research what is trending on YouTube for the niche "${s.goal}". Search YouTube (sort/filter for recent, high-view videos), scan results, open 1–2 standout videos, and identify trending topics, formats and hooks.`,
  analyse: (s) => `Analyse the top YouTube titles and thumbnails for "${s.goal}". Collect at least 8 titles, note title formulas (numbers, questions, emotional words, length), and describe thumbnail patterns (faces, expressions, colours, text overlays) from what you SEE in screenshots.`,
  watch: (s) => `Watch this video and take detailed notes: ${s.url || s.goal}. Use the "transcript" action to read what is said, the "frames" action to look at sampled frames, and "read" for the description. Note the hook, structure, pacing, visual style and what makes it work.`,
  custom: (s) => s.goal,
};

const AGENT_SYS = `You are ReelForge's research agent operating a real Chromium browser for a film studio. Each turn you get a screenshot (when supported), the page URL/title, a numbered list of visible interactive elements, and visible text.
Reply with ONLY a JSON object: {"thought": "short reasoning", "action": {...}} where action is one of:
{"type":"navigate","url":"https://..."}
{"type":"click","id":12}
{"type":"type","id":3,"text":"query","submit":true}
{"type":"scroll","direction":"down"|"up"}
{"type":"read"}                       — read the page's visible text in full
{"type":"transcript"}                 — fetch the current YouTube video's transcript/captions
{"type":"frames"}                     — sample frames from the current video for visual analysis
{"type":"note","text":"a concrete finding"}   — save a finding (titles, view counts, patterns, quotes)
{"type":"done","notes":"final research notes in markdown"}
Rules: prefer direct URLs (e.g. https://www.youtube.com/results?search_query=...&sp=CAI%253D for newest, &sp=CAMSAhAB for most viewed). Save notes as you go; be specific (real titles, numbers, channels). Do not log in or buy anything. Finish with "done" before running out of steps. Final notes must include: key findings, title patterns, thumbnail patterns, hooks/formats, and 3–5 story ideas the studio could make.`;

async function llmLoop(s: Session, page: Page) {
  const brief = TASK_BRIEF[s.task](s);
  const memory: string[] = [];
  let vision = true;
  let watchTitle = "";
  if (s.task === "watch" && s.url) {
    await log(s, null, `Open video player for ${s.url}`, undefined, "info");
    const w = await watchVideo(s, page, s.url);
    s.transcript = w.transcript; s.frames = w.frames;
    if (w.title) { watchTitle = w.title; s.findings.push(`Video: "${w.title}" by ${w.channel}`); }
    await log(s, null, w.transcript ? `Read captions (${w.transcript.split(" ").length} words)` : "No captions available for this video", w.transcript.slice(0, 200), "act");
    if (w.frames.length) {
      await log(s, null, `Sampled ${w.frames.length} frames across the video`, undefined, "act");
      if (vision) { try { const d = await describeFrames(w.frames, w.title || s.url); s.findings.push(`Visuals: ${d.replace(/\n+/g, " ").slice(0, 700)}`); await log(s, null, "Analysed frames with vision", d.slice(0, 300), "note"); } catch (e) { if (!/timeout|aborted/i.test((e as Error).message)) vision = false; await log(s, null, "Frame analysis failed", (e as Error).message.slice(0, 160), "error"); } }
    }
    if (w.transcript) memory.push(`TRANSCRIPT: ${w.transcript.slice(0, 3500)}`);
  }
  const start = `https://www.youtube.com/results?search_query=${encodeURIComponent(s.task === "watch" ? watchTitle || s.url || s.goal : s.goal)}`;
  await goto(page, start); await log(s, page, `navigate ${start}`, s.task === "watch" ? "Looking at the video's search context (similar titles & thumbnails)" : "Opening the starting page");
  for (let i = 0; i < s.maxSteps; i++) {
    if (!(await gate(s))) return;
    if (await isSignIn(page)) {
      s.needsUser = "signin"; s.control = true; s.pause = true; s.status = "paused";
      await log(s, page, "Sign-in page — waiting for you", "I never type passwords. Press “Take control”, sign in yourself, then “Hand back to agent”.", "info");
      if (!(await gate(s))) return; s.needsUser = undefined;
    }
    const ob = await observe(page).catch(() => ({ title: "", url: page.url(), elements: "", text: "" }));
    await refresh(s, page);
    if (/youtube\.com\/(results|feed|@|$)/.test(page.url())) { const v = await scrapeResults(page); if (v.length) s.trending = mergeVideos(s.trending, v); }
    if (blocked(ob.text)) memory.push("NOTE: YouTube showed a bot-check on this page. Don't retry it — use the transcript/frames actions (they open the video player directly), go back to search results, or finish.");
    const left = s.maxSteps - i;
    if (s.inbox?.length) { const m = s.inbox.splice(0); (s.redirects ||= []).push(...m); memory.push(...m.map((x) => `USER SAID (mid-task, top priority — adapt your plan to this): ${x}`)); }
    const obsText = `${s.redirects?.length ? `USER INSTRUCTIONS DURING TASK (override the task where they conflict): ${s.redirects.join(" | ")}\n` : ""}TASK: ${brief}\nSteps left: ${left}${left <= 2 ? " — finish now with done." : ""}\n\nYour findings so far:\n${s.findings.slice(-14).map((f) => "- " + f).join("\n") || "(none)"}\n\nRecent actions:\n${memory.slice(-6).join("\n") || "(none)"}\n\nPAGE: ${ob.title}\nURL: ${ob.url}\n\nELEMENTS:\n${ob.elements}\n\nVISIBLE TEXT:\n${ob.text}`;
    const msgs: Msg[] = [{ role: "system", content: AGENT_SYS }, { role: "user", content: vision && s.screen ? [{ type: "text", text: obsText }, { type: "image_url", image_url: { url: s.screen } }] : obsText }];
    let res;
    try { res = await chatP(msgs, { json: true, temperature: 0.2, vision: vision, agent: true }); }
    catch (e) {
      if (vision) { vision = false; await log(s, null, "Vision input rejected — continuing with page text only", (e as Error).message.slice(0, 160), "error"); i--; continue; }
      throw e;
    }
    s.provider = `${res.provider} · ${res.model}${vision ? " (vision)" : ""}`;
    type Act = { type: string; url?: string; id?: number; text?: string; submit?: boolean; direction?: string; notes?: string };
    let d: { thought?: string; action?: Act | string } & Partial<Act>;
    try { d = parseJson(res.text); } catch { memory.push("(invalid JSON reply — reply with JSON only)"); continue; }
    // Normalise the many shapes models produce: {"action":"read"}, {"type":"note",...}, {"action":{"note":"..."}}
    let a: Act = typeof d.action === "string" ? { ...(d as Partial<Act>), type: d.action } as Act : (d.action as Act) || (d.type ? (d as Act) : { type: "" });
    if (!a.type) { const k = ["navigate", "click", "type", "scroll", "read", "transcript", "frames", "note", "done"].find((x) => x in (a as object)); if (k) a = { ...a, type: k, ...(k === "note" ? { text: String((a as Record<string, unknown>).note) } : k === "navigate" ? { url: String((a as Record<string, unknown>).navigate) } : {}) }; }
    if (!a.type) a = d.thought ? { type: "note", text: d.thought } : { type: "scroll", direction: "down" };
    a.type = a.type.toLowerCase().trim();
    { const [verb, ...rest] = a.type.split(/[\s_-]+/); if (rest.length && ["navigate", "click", "type", "scroll", "read", "transcript", "frames", "note", "done"].includes(verb)) { a.type = verb; if (verb === "scroll" && !a.direction) a.direction = rest[0] === "up" ? "up" : "down"; } }
    if (a.type === "note" && !a.text) a.text = (a as Record<string, unknown>).note as string || d.thought || "";
    if (a.type === "done" && !a.notes) a.notes = (a as Record<string, unknown>).text as string || "";
    const sel = (id?: number) => page.locator(`[data-opie="${id}"]`).first();
    let label = a.type, extra = "";
    try {
      switch (a.type) {
        case "navigate": await goto(page, a.url!); label = `navigate ${a.url}`; break;
        case "click": { const el = sel(a.id); const t = (await el.innerText({ timeout: 2000 }).catch(() => "")).slice(0, 60).replace(/\s+/g, " "); await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await el.click({ timeout: 6000 }); await page.waitForTimeout(2500); label = `click [${a.id}] ${t}`; break; }
        case "type": { const el = sel(a.id); if ((await el.getAttribute("type").catch(() => "")) === "password") { label = "refused to type into a password field — ask the user to take control"; break; } await el.fill(a.text || "", { timeout: 5000 }); if (a.submit) await el.press("Enter"); await page.waitForTimeout(2500); label = `type "${a.text}"${a.submit ? " ⏎" : ""}`; break; }
        case "scroll": await page.mouse.wheel(0, a.direction === "up" ? -700 : 700); await page.waitForTimeout(1200); label = `scroll ${a.direction || "down"}`; break;
        case "read": { const t = (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n").slice(0, 4000); memory.push(`READ ${page.url()}:\n${t.slice(0, 1800)}`); const v = await scrapeResults(page); if (v.length) s.trending = mergeVideos(s.trending, v); label = `read page (${t.length} chars${v.length ? `, ${v.length} videos` : ""})`; break; }
        case "transcript": { let t = blocked(ob.text) ? "" : await transcript(page); const vid = videoId(page.url()) || videoId(s.url); if (!t && vid) { const w = await watchVideo(s, page, `https://youtu.be/${vid}`); t = w.transcript; if (w.frames.length) s.frames = w.frames; } s.transcript = t; memory.push(t ? `TRANSCRIPT (${t.length} chars): ${t.slice(0, 3000)}` : "TRANSCRIPT: none available — use frames/description instead"); label = t ? `read transcript (${t.split(" ").length} words)` : "transcript unavailable"; break; }
        case "frames": {
          let fr = blocked(ob.text) ? [] : await sampleFrames(page, 4); const vid = videoId(page.url()) || videoId(s.url);
          if (!fr.length && vid) fr = (await watchVideo(s, page, `https://youtu.be/${vid}`)).frames;
          s.frames = fr;
          if (fr.length && vision) {
            const t = await describeFrames(fr, ob.title);
            memory.push(`FRAMES ANALYSIS: ${t}`); s.findings.push(`Visuals: ${t.replace(/\n+/g, " ").slice(0, 600)}`); extra = t.slice(0, 220);
          }
          label = `sampled ${fr.length} frames`; break;
        }
        case "note": s.findings.push(a.text || ""); label = "note"; extra = a.text || ""; break;
        case "done": s.notes = a.notes || ""; await log(s, page, "done", d.thought, "act"); return;
        default: label = `unknown action ${a.type}`;
      }
    } catch (e) { extra = `failed: ${(e as Error).message.split("\n")[0].slice(0, 140)}`; }
    if (memory.length && memory[memory.length - 1].startsWith(`${i}. ${label}`)) memory.push(`(You just repeated "${label}". Do something different — click a promising video, use transcript/frames, save a note, or finish with done.)`);
    memory.push(`${i + 1}. ${label}${extra ? ` → ${extra.slice(0, 160)}` : ""}`);
    await log(s, page, label, [d.thought, extra].filter(Boolean).join(" — ").slice(0, 400), a.type === "note" ? "note" : "act");
  }
}

function mergeVideos(a: Video[], b: Video[]) { const seen = new Set(a.map((x) => x.url)); return [...a, ...b.filter((x) => !seen.has(x.url))].slice(0, 30); }

async function finalNotes(s: Session) {
  if (s.notes && s.notes.length > 200) return;
  if (!s.trending.length && !s.findings.length && !s.transcript) { s.notes = `## Research notes — ${s.goal}\n\nThe agent could not collect usable data this run (the site may have blocked the browser). Try again, use a different task, or add a YouTube Data API key in Admin.`; return; }
  const vids = s.trending.slice(0, 15).map((v, i) => `${i + 1}. ${v.title} — ${v.channel} ${v.views || ""} ${v.published || ""}`).join("\n");
  const r = await chatP([{ role: "system", content: "You are a YouTube strategist for a film studio. Write crisp research notes in markdown." },
    { role: "user", content: `Goal: ${s.goal} (task: ${s.task})\n\nVideos seen:\n${vids || "(none)"}\n\nFindings:\n${s.findings.join("\n")}\n\n${s.transcript ? `Transcript excerpt:\n${s.transcript.slice(0, 5000)}\n\n` : ""}${s.notes ? `Agent draft:\n${s.notes}\n\n` : ""}Write: ## Key findings, ## Title patterns, ## Thumbnail patterns, ## Hooks & formats, ## Story ideas for us (3–5, one line each). Be specific and cite real titles/numbers seen. Use ONLY the data above — never invent titles, numbers or facts; if the data is thin, say what is missing.` }], { temperature: 0.3 });
  s.notes = r.text; s.provider ||= r.provider;
}

// ───────────── Muse Wonder (Meta Responses API computer use) ─────────────
async function wonderLoop(s: Session, page: Page) {
  const base = (getConfig("META_BASE_URL") || "https://api.meta.ai/v1").replace(/\/$/, "");
  const key = getConfig("META_API_KEY");
  const model = getConfig("META_AGENT_MODEL") || "muse-wonder-1.0";
  s.provider = `Meta Muse · ${model} (computer use)`;
  await goto(page, s.task === "watch" && s.url ? s.url : "https://www.youtube.com"); await log(s, page, "Open YouTube");
  const call = async (body: unknown) => {
    const r = await fetch(base + "/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("Muse Wonder " + r.status + " " + (await r.text()).slice(0, 300));
    return r.json();
  };
  const tools = [{ type: "computer", display_width: W, display_height: H, environment: "browser" }];
  let resp = await call({ model, tools, truncation: "auto", input: [{ role: "user", content: `${TASK_BRIEF[s.task](s)} Finish with concise research notes (findings, title patterns, thumbnail patterns, hooks, story ideas).` }] });
  for (let i = 0; i < s.maxSteps; i++) {
    if (!(await gate(s))) return;
    const calls = (resp.output || []).filter((o: { type: string }) => o.type === "computer_call");
    const text = (resp.output || []).filter((o: { type: string }) => o.type === "message").map((o: { content: { text: string }[] }) => o.content.map((c) => c.text).join("")).join("\n");
    if (!calls.length) { s.notes = text || s.notes; break; }
    const c = calls[0]; const a = c.action || {};
    try {
      if (a.type === "click") await page.mouse.click(a.x, a.y, { button: a.button === "right" ? "right" : "left" });
      else if (a.type === "double_click") await page.mouse.dblclick(a.x, a.y);
      else if (a.type === "type") await page.keyboard.type(a.text);
      else if (a.type === "keypress") for (const k of a.keys || []) await page.keyboard.press(k === "ENTER" ? "Enter" : k);
      else if (a.type === "scroll") { await page.mouse.move(a.x || W / 2, a.y || H / 2); await page.mouse.wheel(a.scroll_x || 0, a.scroll_y || 400); }
      else if (a.url) await goto(page, a.url);
      else if (a.type === "wait") await page.waitForTimeout(2000);
      await page.waitForTimeout(900);
    } catch { /* keep going */ }
    await log(s, page, `${a.type}${a.text ? ` "${a.text}"` : ""}${a.x !== undefined ? ` @${a.x},${a.y}` : ""}`, text.slice(0, 200));
    const v = await scrapeResults(page); if (v.length) s.trending = mergeVideos(s.trending, v);
    resp = await call({ model, tools, truncation: "auto", previous_response_id: resp.id, input: [{ type: "computer_call_output", call_id: c.call_id, output: { type: "input_image", image_url: s.screen } }] });
  }
}

// ───────────── Scripted (no AI key) ─────────────
async function scripted(s: Session, page: Page) {
  s.provider = "demo (scripted browsing)";
  if (s.task !== "watch") {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(s.goal)}&sp=CAMSAhAB`;
    await goto(page, url); await log(s, page, `Search YouTube: "${s.goal}" (most viewed)`);
    if (!(await gate(s))) return;
    s.trending = mergeVideos(s.trending, await scrapeResults(page));
    await page.mouse.wheel(0, 1200); await page.waitForTimeout(1500);
    s.trending = mergeVideos(s.trending, await scrapeResults(page));
    await log(s, page, "Scroll & read titles/thumbnails", `${s.trending.length} videos captured`);
    s.url = s.trending[0]?.url;
  }
  if (s.url && (await gate(s))) {
    const w = await watchVideo(s, page, s.url); s.transcript = w.transcript; s.frames = w.frames;
    await log(s, null, `Watch: ${w.title || s.url}`, w.channel);
    await log(s, null, w.transcript ? `Read captions (${w.transcript.split(" ").length} words)` : "No captions available", w.transcript.slice(0, 200));
    await log(s, null, `Sampled ${w.frames.length} frames`);
  }
  const words = s.trending.flatMap((v) => v.title.toLowerCase().match(/[a-z']{4,}/g) || []);
  const stop = new Set(["with", "this", "that", "from", "your", "what", "when", "they", "have", "official", "full", "movie", "video", "will"]);
  const freq = Object.entries(words.reduce<Record<string, number>>((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})).filter(([w]) => !stop.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const caps = s.trending.filter((v) => /[A-Z]{4,}/.test(v.title)).length, nums = s.trending.filter((v) => /\d/.test(v.title)).length, q = s.trending.filter((v) => /\?/.test(v.title)).length;
  s.notes = `## Research notes — ${s.goal}\n\n**Demo mode:** a scripted browser collected this data; add an AI key in Admin → AI brain for an agent that reasons over screenshots.\n\n## Top videos\n${s.trending.slice(0, 8).map((v, i) => `${i + 1}. ${v.title} — ${v.channel} (${v.views || "?"})`).join("\n")}\n\n## Title patterns\n- Recurring words: ${freq.map(([w, c]) => `${w}×${c}`).join(", ")}\n- ${caps}/${s.trending.length} use ALL-CAPS words, ${nums} include numbers, ${q} ask a question\n${s.transcript ? `\n## Transcript excerpt (top video)\n${s.transcript.slice(0, 600)}…\n` : ""}`;
}

export function startResearch(o: { goal: string; task?: Task; url?: string; projectId?: string; maxSteps?: number }) {
  const mode: Session["mode"] = metaLive() && llmChain()[0] === "meta" ? "meta-wonder" : llmLive() ? "llm-agent" : "scripted";
  const s: Session = { id: nanoid(10), goal: o.goal, task: o.task || "trending", url: o.url, projectId: o.projectId, status: "running", steps: [], notes: "", findings: [], trending: [], frames: [], mode, provider: llmLive() ? llmLabel() : "demo", maxSteps: Math.min(40, Math.max(3, o.maxSteps || parseInt(getConfig("RESEARCH_MAX_STEPS") || "14"))), startedAt: new Date().toISOString() };
  sessions.set(s.id, s);
  (async () => {
    try {
      await log(s, null, `Boot virtual desktop (headless Chromium ${W}×${H}) — ${mode === "scripted" ? "demo scripted mode" : `agent: ${s.provider}`}`, undefined, "info");
      await youtubeApi(s);
      // Prefer the real desktop's Chromium so the user watches (and can take over) the same browser.
      const dctx = await deskContext().catch(() => null); if (dctx) { s.onDesk = true; await log(s, null, "Using Reel’s computer (real Linux desktop Chromium)", undefined, "info"); }
      const page = await (dctx || await profileContext()).newPage(); pages.set(s.id, page);
      if (mode === "meta-wonder") { try { await wonderLoop(s, page); } catch (e) { await log(s, null, "Muse Wonder unavailable — switching to vision agent", (e as Error).message.slice(0, 200), "error"); await llmLoop(s, page); } }
      else if (mode === "llm-agent") await llmLoop(s, page);
      else await scripted(s, page);
      if (mode !== "scripted" && !s.stop) { await log(s, null, "Writing final research notes…", undefined, "info"); await finalNotes(s); }
      s.status = s.stop ? "stopped" : "done";
      if (s.stop && !s.notes && s.findings.length) s.notes = `## Partial notes — ${s.goal}\n${s.findings.map((f) => "- " + f).join("\n")}`;
    } catch (e) { s.status = "error"; s.error = (e as Error).message.slice(0, 400); }
    finally {
      if (!s.onDesk) await pages.get(s.id)?.close().catch(() => {}); pages.delete(s.id);
      if (s.projectId && s.notes) {
        await db.update(s.projectId, (x) => { const at = new Date().toISOString(); (x.research ||= []).push({ id: s.id, goal: s.goal, notes: s.notes, at, provider: s.provider }); x.brainstorm.push({ role: "assistant", kind: "note", content: `📎 Research notes attached: ${s.goal}`, at }); }).then(() => (s.savedToProject = true)).catch(() => {});
      }
    }
  })();
  return s;
}

/** A browser the user drives by hand (sign in once, browse, then ask the agent). */
export function startManual(url = "https://www.google.com") {
  const s: Session = { id: nanoid(10), goal: "Manual browsing", task: "custom", status: "paused", steps: [], notes: "", findings: [], trending: [], frames: [], mode: "manual", provider: "you", maxSteps: 0, control: true, startedAt: new Date().toISOString() };
  sessions.set(s.id, s);
  (async () => {
    try {
      const page = await (await profileContext()).newPage(); pages.set(s.id, page);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await log(s, page, `open ${url}`, "You're in control — click, type and scroll on the screen.", "info");
      let idle = 0; while (!s.stop && idle < 1800) { await sleep(1000); idle++; }
    } catch (e) { s.error = (e as Error).message.slice(0, 300); s.status = "error"; }
    finally { await pages.get(s.id)?.close().catch(() => {}); pages.delete(s.id); if (s.status !== "error") s.status = "stopped"; }
  })();
  return s;
}

/** Forward one user input event to the live page. Typed text is never logged (could be a password). */
export async function control(s: Session, e: { t: string; x?: number; y?: number; dy?: number; text?: string; key?: string; url?: string }) {
  const page = pages.get(s.id); if (!page) throw new Error("No live page for this session");
  const L = (s.manualLog ||= []);
  switch (e.t) {
    case "click": await page.mouse.click(Math.round((e.x || 0) * W), Math.round((e.y || 0) * H)); L.push(`clicked at ${Math.round((e.x || 0) * 100)}%,${Math.round((e.y || 0) * 100)}%`); break;
    case "scroll": await page.mouse.wheel(0, e.dy || 400); break;
    case "type": await page.keyboard.insertText(e.text || ""); L.push("typed text"); break;
    case "key": { const k = { Backspace: "Backspace", Enter: "Enter", Tab: "Tab", Escape: "Escape", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", Delete: "Delete" }[e.key || ""]; if (k) await page.keyboard.press(k); break; }
    case "navigate": { let u = (e.url || "").trim(); if (!/^https?:\/\//.test(u)) u = /\.[a-z]{2,}(\/|$)/i.test(u) && !/\s/.test(u) ? "https://" + u : `https://www.google.com/search?q=${encodeURIComponent(u)}`; await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}); L.push(`opened ${u.slice(0, 80)}`); break; }
    case "back": await page.goBack({ timeout: 15000 }).catch(() => {}); break;
    case "forward": await page.goForward({ timeout: 15000 }).catch(() => {}); break;
    case "reload": await page.reload({ timeout: 30000 }).catch(() => {}); break;
  }
  if (L.length > 40) L.splice(0, L.length - 40);
  await page.waitForTimeout(e.t === "type" || e.t === "scroll" ? 80 : 350);
  return frame(s);
}
export async function frame(s: Session) {
  const page = pages.get(s.id); if (!page) return { screen: s.screen, url: s.pageUrl };
  s.screen = await snap(page, 50).catch(() => s.screen); s.pageUrl = page.url();
  return { screen: s.screen, url: s.pageUrl, signIn: await isSignIn(page) };
}
