import { getConfig } from "./config";
import { chatP, llmLive, parseJson } from "./providers/meta";
import { profileContext, UA } from "./research";

/** YouTube keyword + transcript tooling (no API key needed; Data API used when YOUTUBE_API_KEY is set). */
export const ytId = (u?: string) => u?.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)?.[1] || (/^[\w-]{11}$/.test(u || "") ? u : undefined);
export type Seg = { t: number; text: string };
export interface VideoInfo { id: string; title: string; channel?: string; views?: string; description: string; tags: string[]; hashtags: string[]; source: string[] }
const hdr = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1; SOCS=CAI" };
const json3 = (j: { events?: { tStartMs?: number; segs?: { utf8: string }[] }[] }): Seg[] =>
  (j.events || []).filter((e) => e.segs).map((e) => ({ t: (e.tStartMs || 0) / 1000, text: (e.segs || []).map((s) => s.utf8).join("").replace(/\s+/g, " ").trim() })).filter((s) => s.text);

async function watchPage(id: string) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: hdr, signal: AbortSignal.timeout(15000) })).text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});(?:var|<\/script)/);
  const pr = m ? JSON.parse(m[1]) : null;
  const metaKw = html.match(/<meta name="keywords" content="([^"]*)"/)?.[1];
  return { pr, metaKw, gated: !pr?.videoDetails };
}

export async function videoInfo(id: string): Promise<VideoInfo & { tracks: { baseUrl: string; languageCode: string; kind?: string }[] }> {
  const v: VideoInfo & { tracks: { baseUrl: string; languageCode: string; kind?: string }[] } = { id, title: "", description: "", tags: [], hashtags: [], source: [], tracks: [] };
  try {
    const w = await watchPage(id);
    if (w.pr?.videoDetails) {
      const d = w.pr.videoDetails; v.title = d.title; v.channel = d.author; v.views = d.viewCount; v.description = d.shortDescription || ""; v.tags = d.keywords || []; v.source.push("ytInitialPlayerResponse");
      v.tracks = w.pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    }
    if (!v.tags.length && w.metaKw) { v.tags = w.metaKw.split(",").map((s) => s.trim()).filter(Boolean); v.source.push("meta keywords"); }
  } catch { /* gated or offline */ }
  if (!v.tags.length) try { const e = await embedProbe(id); const d = e.pr?.videoDetails; if (d?.keywords?.length) { v.tags = d.keywords; v.source.push("embedded player"); } if (d) { v.description ||= d.shortDescription || ""; v.views ||= d.viewCount; } if (!v.tracks.length) v.tracks = e.tracks; } catch { /* */ }
  const key = getConfig("YOUTUBE_API_KEY");
  if (key) try {
    const j = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${id}&key=${key}`)).json();
    const it = j.items?.[0]; if (it) { v.title ||= it.snippet.title; v.channel ||= it.snippet.channelTitle; v.description ||= it.snippet.description; v.views ||= it.statistics?.viewCount; if (it.snippet.tags?.length) { v.tags = [...new Set([...v.tags, ...it.snippet.tags])]; v.source.push("YouTube Data API"); } }
  } catch { /* ignore */ }
  if (!v.title) try { const o = await (await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)).json(); v.title = o.title; v.channel = o.author_name; v.source.push("oEmbed"); } catch { /* ignore */ }
  v.hashtags = [...new Set([...(v.description + " " + v.title).matchAll(/#[\p{L}\p{N}_]+/gu)].map((m) => m[0]))];
  return v;
}

export async function suggest(q: string): Promise<string[]> {
  try {
    const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    const j = JSON.parse(await r.text()); return (j[1] || []).map(String);
  } catch { return []; }
}

/** Full transcript with timestamps: caption track → embed player's own timedtext call (works when watch pages are bot-gated). */
export async function transcriptSegs(id: string, info?: Awaited<ReturnType<typeof videoInfo>>): Promise<{ segs: Seg[]; via: string }> {
  const tr = info?.tracks || [];
  const t = tr.find((x) => x.languageCode?.startsWith("en") && x.kind !== "asr") || tr.find((x) => x.languageCode?.startsWith("en")) || tr[0];
  if (t) try { const txt = await (await fetch(t.baseUrl + "&fmt=json3", { headers: hdr })).text(); if (txt) { const segs = json3(JSON.parse(txt)); if (segs.length) return { segs, via: `caption track (${t.languageCode}${t.kind === "asr" ? ", auto" : ""})` }; } } catch { /* fall through */ }
  const e = await embedProbe(id, true); return { segs: e.segs, via: e.segs.length ? e.via : "none (video has no captions)" };
}

/** Load the embed player in the persistent browser and read its own player/timedtext responses — works when watch pages are bot-gated for this IP. */
type Track = { baseUrl: string; languageCode: string; kind?: string };
type PR = { videoDetails?: { keywords?: string[]; shortDescription?: string; viewCount?: string }; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } } };
export async function embedProbe(id: string, wantCaptions = false) {
  const ctx = await profileContext(); const page = await ctx.newPage();
  let segs: Seg[] = []; const st: { pr: PR | null } = { pr: null }; let via = "embedded player captions";
  try {
    page.on("response", async (r) => {
      const u = r.url();
      try { if (!segs.length && u.includes("/api/timedtext")) segs = json3(JSON.parse(await r.text())); else if (!st.pr && u.includes("/youtubei/v1/player")) st.pr = JSON.parse(await r.text()); } catch { /* */ }
    });
    await page.goto(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&cc_load_policy=1&cc_lang_pref=en&hl=en`, { waitUntil: "domcontentloaded", timeout: 30000, referer: "https://opie.studio/" });
    for (let i = 0; i < 24 && !(st.pr && (!wantCaptions || segs.length)); i++) { await page.waitForTimeout(500); if (i === 4) await page.click("body").catch(() => {}); }
    const tracks: Track[] = st.pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (wantCaptions && !segs.length && tracks.length) {
      const t = tracks.find((x) => x.languageCode?.startsWith("en")) || tracks[0];
      const txt = await page.evaluate(async (u) => (await fetch(u)).text(), t.baseUrl + "&fmt=json3").catch(() => "");
      try { segs = json3(JSON.parse(txt)); via = `player caption track (${t.languageCode})`; } catch { /* */ }
    }
    return { segs, via, pr: st.pr, tracks };
  } finally { await page.close().catch(() => {}); }
}
export const stamp = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export async function keywordReport(input: string) {
  const id = ytId(input);
  const info = id ? await videoInfo(id) : undefined;
  const seed = (input && !id ? input : info?.title.split(/[|\-–(]/)[0]) || input;
  const sugg = [...new Set([...(await suggest(seed)), ...(await suggest(seed.split(" ").slice(0, 3).join(" ")))])];
  const words = (info ? `${info.title} ${info.description.slice(0, 1500)}` : "").toLowerCase().match(/[\p{L}']{4,}/gu) || [];
  const stop = new Set("this that with from your have will what when they them their there been were into watch video subscribe channel please movie movies full latest 2024 2025 2026 https www youtube".split(" "));
  const freq = Object.entries(words.filter((w) => !stop.has(w)).reduce<Record<string, number>>((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w);
  const raw = { seed, video: info && { title: info.title, channel: info.channel, views: info.views, source: info.source }, tags: info?.tags || [], hashtags: info?.hashtags || [], suggestions: sugg, titleDescWords: freq };
  let report: { primary: string[]; longTail: string[]; trending: string[]; hashtags: string[]; clusters?: { name: string; keywords: string[] }[]; summary: string } = { primary: (raw.tags.length ? raw.tags : sugg).slice(0, 8), longTail: sugg.filter((s) => s.split(" ").length >= 4).slice(0, 12), trending: sugg.slice(0, 10), hashtags: raw.hashtags, summary: "" };
  let provider = "rules";
  if (llmLive()) try {
    const r = await chatP([{ role: "system", content: 'You are a YouTube SEO strategist. Using ONLY the raw keyword data, return JSON {"primary":[5-8 core keywords],"longTail":[8-12 long-tail phrases],"trending":[up to 10 rising/searchy phrases from the autocomplete suggestions],"hashtags":[5-10 hashtags incl. #],"clusters":[{"name":string,"keywords":[string]}],"summary":"2-3 sentences of advice"}. Rank by likely search demand. Never invent brand names not in the data.' }, { role: "user", content: JSON.stringify(raw).slice(0, 7000) }], { json: true, temperature: 0.2 });
    const j = parseJson<typeof report>(r.text); if (j.primary?.length) { report = { ...report, ...j }; provider = `${r.provider} · ${r.model}`; }
  } catch { /* rules fallback */ }
  return { raw, report, provider };
}

export async function scriptReport(url: string) {
  const id = ytId(url); if (!id) throw new Error("Not a YouTube link");
  const info = await videoInfo(id);
  const { segs, via } = await transcriptSegs(id, info);
  const text = segs.map((s) => s.text).join(" ");
  let analysis: { cleanScript: string; hook: string; beats: { t?: string; beat: string }[]; cta: string; structure: string } | null = null, provider = "";
  if (text && llmLive()) try {
    const timed = segs.map((s) => `[${stamp(s.t)}] ${s.text}`).join("\n").slice(0, 3500);
    const r = await chatP([{ role: "system", content: 'Analyse this YouTube transcript. Return JSON {"cleanScript": the transcript cleaned into a readable script with speaker/scene breaks (keep the meaning, fix filler/run-ons),"hook": what happens in the first ~10s and why it grabs,"beats":[{"t":"m:ss","beat":string}],"cta": the call to action (or "none"),"structure": 2-3 sentences on pacing and format}. Use only the transcript.' }, { role: "user", content: `Title: ${info.title}\nChannel: ${info.channel}\n\n${timed}` }], { json: true, temperature: 0.2 });
    analysis = parseJson(r.text); provider = `${r.provider} · ${r.model}`;
  } catch { /* transcript only */ }
  if (segs.length && !analysis?.hook) {
    const span = segs[segs.length - 1].t || 1, at = (f: number) => segs.find((x) => x.t >= span * f) || segs[0];
    analysis = { cleanScript: analysis?.cleanScript || text, hook: segs.filter((x) => x.t < 12).map((x) => x.text).join(" "), beats: [0, 0.25, 0.5, 0.75, 0.92].map((f) => { const x = at(f); return { t: stamp(x.t), beat: x.text }; }),
      cta: segs.filter((x) => /subscribe|like (this|the) video|comment|follow|link (in|below)|share/i.test(x.text)).map((x) => `[${stamp(x.t)}] ${x.text}`).slice(0, 3).join(" ") || "none detected", structure: `${segs.length} caption lines over ${stamp(span)}.` };
    provider ||= "rules (LLM analysis unavailable)";
  }
  return { video: { id, title: info.title, channel: info.channel, views: info.views }, via, segs, analysis, provider };
}

/** Write an ORIGINAL script inspired by the video's structure — never a copy. */
export async function rewriteAsScript(r: Awaited<ReturnType<typeof scriptReport>>, angle = "") {
  const res = await chatP([{ role: "system", content: "You are a screenwriter. Write an ORIGINAL screenplay (Fountain-style: INT./EXT. scene headings, action lines, CHARACTER names in caps, dialogue) inspired only by the STRUCTURE (hook, beats, pacing, CTA) of the reference. Use new characters, new names, new dialogue and new situations — do not reuse sentences from the reference. Output the screenplay only." }, { role: "user", content: `Reference: "${r.video.title}"\nHook: ${r.analysis?.hook || ""}\nBeats: ${(r.analysis?.beats || []).map((b) => b.beat).join(" | ") || r.segs.slice(0, 40).map((s) => s.text).join(" ").slice(0, 2000)}\nCTA: ${r.analysis?.cta || ""}\n${angle ? `Angle: ${angle}` : ""}` }], { temperature: 0.8 });
  return { script: res.text.replace(/^```\w*\n?|```$/g, "").trim(), provider: `${res.provider} · ${res.model}` };
}
