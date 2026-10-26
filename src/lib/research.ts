import { nanoid } from "nanoid";
import type { Browser, Page } from "playwright-core";
import { getConfig } from "./config";
import { chat, metaLive } from "./providers/meta";

export interface Step { n: number; at: string; action: string; thought?: string; shot?: string }
export interface Session { id: string; goal: string; status: "running" | "done" | "error" | "stopped"; steps: Step[]; notes: string; trending: { title: string; channel: string; views?: string; url: string; thumb?: string }[]; mode: "meta" | "scripted"; error?: string; stop?: boolean }

const g = globalThis as unknown as { __opieResearch?: Map<string, Session> };
const sessions = (g.__opieResearch ||= new Map());
export const getSession = (id: string) => sessions.get(id);
const W = 1280, H = 800;

async function browser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}
async function snap(page: Page) {
  const b = await page.screenshot({ type: "jpeg", quality: 55 });
  return "data:image/jpeg;base64," + b.toString("base64");
}
async function push(s: Session, page: Page | null, action: string, thought?: string) {
  s.steps.push({ n: s.steps.length + 1, at: new Date().toISOString(), action, thought, shot: page ? await snap(page).catch(() => undefined) : undefined });
  // keep memory bounded: only the last 6 steps keep screenshots
  s.steps.slice(0, -6).forEach((x: Step) => delete x.shot);
}

async function youtubeTrending(s: Session) {
  const key = getConfig("YOUTUBE_API_KEY");
  if (!key) return;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=12&regionCode=${getConfig("YOUTUBE_REGION") || "NG"}&key=${key}`);
  if (!r.ok) return;
  const j = await r.json();
  s.trending = (j.items || []).map((v: { id: string; snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } }; statistics: { viewCount: string } }) => ({ title: v.snippet.title, channel: v.snippet.channelTitle, views: v.statistics?.viewCount, url: `https://youtu.be/${v.id}`, thumb: v.snippet.thumbnails?.medium?.url }));
}

/** Scripted research (no Meta key): real browsing of YouTube, scraping titles/thumbnails, with notes. */
async function scripted(s: Session, page: Page) {
  const q = encodeURIComponent(s.goal);
  await page.goto(`https://www.youtube.com/results?search_query=${q}&sp=CAMSAhAB`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const consent = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
  if (await consent.isVisible().catch(() => false)) { await consent.click().catch(() => {}); await page.waitForTimeout(2000); }
  await push(s, page, `Open YouTube search: "${s.goal}" sorted by views`);
  const vids = await page.$$eval("ytd-video-renderer", (els) => els.slice(0, 10).map((e) => ({
    title: (e.querySelector("#video-title") as HTMLElement)?.innerText?.trim() || "",
    url: (e.querySelector("#video-title") as HTMLAnchorElement)?.href || "",
    channel: (e.querySelector("ytd-channel-name #text") as HTMLElement)?.innerText?.trim() || "",
    views: (e.querySelector("#metadata-line span") as HTMLElement)?.innerText?.trim() || "",
    thumb: (e.querySelector("img") as HTMLImageElement)?.src || "",
  }))).catch(() => []);
  if (!s.trending.length) s.trending = vids.filter((v) => v.title);
  await page.mouse.wheel(0, 900); await page.waitForTimeout(1200);
  await push(s, page, "Scroll results, read titles & thumbnails", `${vids.length} videos captured`);
  if (s.stop) return;
  const top = vids.find((v) => v.url.includes("watch"));
  if (top) {
    await page.goto(top.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    await push(s, page, `Watch top video: ${top.title}`);
    const desc = await page.locator("#description-inline-expander, #description").first().innerText({ timeout: 4000 }).catch(() => "");
    await push(s, page, "Read description & engagement", desc.slice(0, 200));
  }
  const words = vids.flatMap((v) => v.title.toLowerCase().match(/[a-z]{4,}/g) || []);
  const freq = Object.entries(words.reduce<Record<string, number>>((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})).filter(([w]) => !["with", "this", "that", "from", "your", "what", "when", "they", "have"].includes(w)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  s.notes = `Research notes — ${s.goal}\n\nTop performing titles:\n${vids.slice(0, 6).map((v, i) => `${i + 1}. ${v.title} — ${v.channel} (${v.views})`).join("\n")}\n\nRecurring title words: ${freq.map(([w, c]) => `${w}×${c}`).join(", ")}\n\nPatterns: emotional hooks and specific stakes in titles; faces with strong expressions dominate thumbnails.\n\n(Scripted browsing — add a Meta key for Muse Wonder to drive the desktop and write deeper notes.)`;
}

/** Muse Wonder computer-use loop (Responses API, tool {type:"computer"}). */
async function wonderLoop(s: Session, page: Page) {
  const base = (getConfig("META_BASE_URL") || "https://api.meta.ai/v1").replace(/\/$/, "");
  const key = getConfig("META_API_KEY");
  const maxSteps = parseInt(getConfig("RESEARCH_MAX_STEPS") || "12");
  await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded" });
  const call = async (body: unknown) => {
    const r = await fetch(base + "/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("Muse Wonder " + r.status + " " + (await r.text()).slice(0, 300));
    return r.json();
  };
  const tools = [{ type: "computer", display_width: W, display_height: H, environment: "browser" }];
  let resp = await call({ model: getConfig("META_AGENT_MODEL") || "muse-wonder-1.0", tools, truncation: "auto", input: [{ role: "user", content: `You are a research assistant for a film studio, operating a web browser. Goal: ${s.goal}. Use Google and YouTube: check trending topics, read titles and thumbnails, open and watch promising videos, then finish with concise research notes (hooks, title patterns, thumbnail patterns, story ideas).` }] });
  for (let i = 0; i < maxSteps && !s.stop; i++) {
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
      else if (a.type === "goto" || a.url) await page.goto(a.url, { waitUntil: "domcontentloaded" });
      else if (a.type === "wait") await page.waitForTimeout(2000);
      await page.waitForTimeout(900);
    } catch { /* keep going */ }
    await push(s, page, `${a.type}${a.text ? ` "${a.text}"` : ""}${a.x !== undefined ? ` @${a.x},${a.y}` : ""}`, text.slice(0, 200));
    const shot = (await page.screenshot({ type: "png" })).toString("base64");
    resp = await call({ model: getConfig("META_AGENT_MODEL") || "muse-wonder-1.0", tools, truncation: "auto", previous_response_id: resp.id, input: [{ type: "computer_call_output", call_id: c.call_id, output: { type: "input_image", image_url: `data:image/png;base64,${shot}` } }] });
  }
  if (!s.notes) s.notes = await chat([{ role: "user", content: `Summarise research notes for: ${s.goal}. Steps taken: ${s.steps.map((x) => x.action).join("; ")}` }]);
}

export function startResearch(goal: string) {
  const s: Session = { id: nanoid(10), goal, status: "running", steps: [], notes: "", trending: [], mode: metaLive() ? "meta" : "scripted" };
  sessions.set(s.id, s);
  (async () => {
    let b: Browser | null = null;
    try {
      await push(s, null, "Boot virtual desktop (headless Chromium)");
      await youtubeTrending(s).catch(() => {});
      b = await browser();
      const page = await (await b.newContext({ viewport: { width: W, height: H }, locale: "en-US" })).newPage();
      if (s.mode === "meta") await wonderLoop(s, page); else await scripted(s, page);
      s.status = s.stop ? "stopped" : "done";
    } catch (e) { s.status = "error"; s.error = (e as Error).message.slice(0, 300); }
    finally { await b?.close().catch(() => {}); }
  })();
  return s;
}
