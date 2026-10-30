import { voiceFor } from "./voices";
import fs from "node:fs";
import path from "node:path";
import { db, mediaPath, mediaUrl, projectMediaDir } from "./db";
import { ffmpeg, probeDuration } from "./ffmpeg";
import { speak } from "./providers/tts";
import { chain, estimate, listProviders, runProvider } from "./providers/videoProviders";
import { chat, llmLive, structured } from "./providers/meta";
import { findShot, genreFor } from "./studio";
import { genreBrief } from "./genres";
import { MAX_WPS, clarity, slowDown, speakable, sttOn, transcribe } from "./dialogue";
import { record, withStep } from "./usage";
import { getConfig } from "./config";
import { aspectSize, type Project, type Shot } from "./types";

const now = () => new Date().toISOString();
const shotsOf = (p: Project) => p.scenes.flatMap((s) => s.shots);

async function setRender(id: string, patch: Partial<Project["render"]>) {
  await db.update(id, (x) => { x.render = { ...x.render, ...patch, updatedAt: now() }; });
}

/** Shot length that fits its voice line: the line plus a short breath, never a long hold of dead air. */
export function fitDuration(audioSec: number) { return Math.max(2, Math.round((audioSec + 0.6) * 10) / 10); }
/** Silent (no-line) shots are kept short so the cut doesn't sag between lines. */
const SILENT_MAX = 3.5;

/** Voice every line: narration with the narrator voice, dialogue with each character's voice. */
export async function voiceShot(p: Project, shotId: string, opts: { spoken?: string; tempo?: number } = {}) {
  const sh = findShot(p, shotId);
  const text = sh.narration || sh.dialogue;
  if (!text) return null;
  const voice = sh.narration ? p.narratorVoice : voiceFor(p, sh.speaker);
  const file = path.join(projectMediaDir(p.id), `voice-${sh.id}-${Date.now()}.mp3`);
  const provider = await speak(opts.spoken || text, voice, file);
  let dur = await probeDuration(file);
  if (opts.tempo && opts.tempo < 1) dur = await slowDown(file, opts.tempo);
  const prev = sh.audioUrl && mediaPath(sh.audioUrl);
  await db.update(p.id, (x) => { const t = findShot(x, shotId); t.audioUrl = mediaUrl(file); t.audioProvider = provider; if (!t.durationLocked || dur + 0.5 > t.durationSec) t.durationSec = fitDuration(dur); t.clarity = undefined; });
  if (prev && prev !== file) fs.promises.unlink(prev).catch(() => {});
  return { url: mediaUrl(file), provider, duration: dur };
}

/**
 * Dialogue clarity check for one voiced shot: pace (words/second) and a speech-to-text round trip (word error rate).
 * Failures are fixed automatically — rushed lines are slowed, misheard lines re-voiced with speakable text (numbers
 * spelled, symbols spoken) and then slower — and the shot is re-fitted so speech never runs into the next shot.
 */
export async function clarityShot(pid: string, shotId: string) {
  const issues: string[] = []; let attempts = 0; let werV: number | undefined; let cerV: number | undefined; let heard: string | undefined; let wps = 0; let source = "pace";
  for (;;) {
    const p = db.getProject(pid)!; const sh = findShot(p, shotId);
    const text = sh.narration || sh.dialogue; if (!text || !sh.audioUrl || !fs.existsSync(mediaPath(sh.audioUrl))) return null;
    const file = mediaPath(sh.audioUrl);
    const dur = await probeDuration(file);
    wps = +(text.split(/\s+/).length / Math.max(0.3, dur)).toFixed(2);
    issues.length = 0;
    if (wps > MAX_WPS) issues.push(`rushed (${wps} words/s)`);
    if (sttOn()) {
      try {
        const names = [sh.speaker, ...p.assets.filter((a) => a.kind === "character").map((a) => a.name)].filter(Boolean) as string[];
        heard = await transcribe(file, names); const v = clarity(text, heard); werV = v.wer; cerV = v.cer; source = "Meta wav2vec2 speech-to-text";
        if (!v.pass) issues.push(`unclear (WER ${(v.wer * 100).toFixed(0)}%, CER ${(v.cer * 100).toFixed(0)}%: heard "${heard.slice(0, 80)}")`);
      } catch (e) { source = `pace only (STT: ${(e as Error).message.slice(0, 60)})`; }
    }
    if (!issues.length || attempts >= 2) {
      const ok = !issues.length;
      await db.update(pid, (x) => { const t = findShot(x, shotId); t.clarity = { audio: t.audioUrl, ok, wer: werV, cer: cerV, heard, wps, issues: [...issues], attempts, checkedAt: now(), source }; if (!t.durationLocked) t.durationSec = Math.max(t.durationSec, fitDuration(dur)); });
      return { ok, issues, wer: werV, wps, attempts };
    }
    attempts++;
    // fix 1: speakable text (+ slow if rushed); fix 2: speakable and 12% slower
    const tempo = attempts === 2 ? 0.88 : wps > MAX_WPS ? Math.max(0.8, 3.0 / wps) : undefined;
    await voiceShot(p, shotId, { spoken: speakable(text), tempo });
  }
}

export async function voiceAll(p: Project) {
  const out = [];
  for (const sh of shotsOf(p)) if (sh.narration || sh.dialogue) out.push(await voiceShot(db.getProject(p.id)!, sh.id).catch((e) => ({ shotId: sh.id, error: (e as Error).message })));
  return out;
}

/** Generate one clip now: the project's provider first, then the Admin fallback order (demo motion last), with retries. */
/** Video-provider prompt: camera + action + screen direction + the genre motion grammar and its AI-video countermeasures. */
export function clipPrompt(p: Project, sh: Shot) {
  const g = genreFor(p);
  return [`${sh.camera}. ${sh.description}.`, sh.screen ? `Screen direction: ${sh.screen}.` : "", sh.dialogue ? `${sh.speaker} speaks one short line; lips move naturally, others listen.` : "", "Keep faces, wardrobe and props identical to the start frame; one continuous action; no new people; no on-screen text.", g ? genreBrief(g, "video") : ""].filter(Boolean).join(" ").slice(0, 1400);
}
export async function clipShot(p: Project, shotId: string, onJob?: (j: NonNullable<Shot["clipJob"]>) => unknown) {
  const sh = findShot(p, shotId);
  const start = sh.startFrame.find((v) => v.id === sh.activeStart);
  if (!start) throw new Error("Generate a start frame first");
  const end = sh.endFrame.find((v) => v.id === sh.activeEnd);
  const file = path.join(projectMediaDir(p.id), `clip-${sh.id}-${Date.now()}.mp4`);
  const retries = Math.max(0, Math.min(3, parseInt(getConfig("VIDEO_RETRIES") || "1")));
  const errors: string[] = [];
  for (const prov of chain(p.videoProvider)) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      const est = estimate(prov, sh.durationSec);
      await onJob?.({ state: "running", provider: prov.name, attempt, progress: 2, estUsd: est.usd });
      try {
        await runProvider(prov, { startFrame: mediaPath(start.url), endFrame: end ? mediaPath(end.url) : undefined, prompt: clipPrompt(p, sh), aspect: p.aspect, durationSec: sh.durationSec, outFile: file }, (pct) => { void onJob?.({ state: "running", provider: prov.name, attempt, progress: Math.round(pct), estUsd: est.usd }); });
        record("video", prov.type === "mock" ? "Demo" : prov.name, prov.model, undefined, 0, est.usd);
        await db.update(p.id, (x) => { const t = findShot(x, shotId); t.clipUrl = mediaUrl(file); t.clipProvider = prov.name; });
        return { url: mediaUrl(file), provider: prov.id, name: prov.name, attempt, errors };
      } catch (e) {
        errors.push(`${prov.name} #${attempt}: ${(e as Error).message.slice(0, 160)}`);
        if (/no API key|HTTP 40[13]|HTTP 422|unsupported/i.test((e as Error).message)) break; // don't retry config errors
        if (attempt <= retries) await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }
  throw new Error("All video providers failed — " + errors.join(" | "));
}

// ---- video job queue (one clip at a time per server; the VPS has a single CPU) ----
const vq: { pid: string; shotId: string }[] = []; let vqRunning = false;
const setJob = (pid: string, shotId: string, j: Partial<NonNullable<Shot["clipJob"]>>) => db.update(pid, (x) => { try { const t = findShot(x, shotId); t.clipJob = { ...(t.clipJob || { state: "queued" }), ...j, updatedAt: now() }; } catch { /* deleted */ } });
export async function queueClips(pid: string, shotIds: string[]) {
  const p = db.getProject(pid)!;
  const prov = chain(p.videoProvider)[0];
  for (const id of shotIds) {
    if (vq.some((q) => q.pid === pid && q.shotId === id)) continue;
    const sh = findShot(p, id);
    await setJob(pid, id, { state: "queued", provider: prov?.name, attempt: 0, progress: 0, error: undefined, estUsd: prov ? estimate(prov, sh.durationSec).usd : undefined });
    vq.push({ pid, shotId: id });
  }
  if (!vqRunning) void drain();
  return { queued: shotIds.length, provider: prov?.name };
}
/** Drop a deleted project's clips from the queue. */
export function dropProjectClips(pid: string) { for (let i = vq.length - 1; i >= 0; i--) if (vq[i].pid === pid) vq.splice(i, 1); }
async function drain() {
  vqRunning = true;
  try {
    while (vq.length) {
      const { pid, shotId } = vq.shift()!;
      const p = db.getProject(pid); if (!p) continue;
      try { await withStep(pid, "video", () => clipShot(p, shotId, (j) => setJob(pid, shotId, j))); await setJob(pid, shotId, { state: "done", progress: 100, error: undefined }); }
      catch (e) { await setJob(pid, shotId, { state: "failed", error: (e as Error).message.slice(0, 400) }); }
    }
  } finally { vqRunning = false; }
}
/** Cost/duration estimate for every framed shot with the project's provider. */
export function videoEstimate(p: Project) {
  const prov = chain(p.videoProvider)[0] || listProviders()[0];
  const shots = shotsOf(p).filter((s) => s.activeStart);
  let secs = 0, usd = 0, priced = true;
  for (const s of shots) { const e = estimate(prov, s.durationSec); secs += e.seconds; if (e.usd === undefined) priced = false; else usd += e.usd; }
  return { provider: prov?.name, shots: shots.length, seconds: secs, usd: priced ? +usd.toFixed(2) : undefined };
}

/** Subtitle cues: ≤ 42 characters per line, ≤ 2 lines per cue; long lines split across cues in proportion to their length. */
export function cues(text: string, a: number, b: number) {
  const words = text.trim().split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > 42 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  const groups: string[] = []; for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2).join("\n"));
  const total = groups.reduce((n, g) => n + g.length, 0) || 1; let t = a;
  return groups.map((g) => { const d = ((b - a) * g.length) / total; const c = { a: t, b: t + d - (groups.length > 1 ? 0.04 : 0), text: g }; t += d; return c; });
}
function srtTime(t: number) {
  const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

const MUSIC: Record<string, string> = {
  ambient: "aevalsrc='0.05*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.1*t))+0.04*sin(2*PI*164.8*t)+0.03*sin(2*PI*220*t)':s=44100",
  tension: "aevalsrc='0.06*sin(2*PI*55*t)*(0.5+0.5*sin(2*PI*0.5*t))+0.03*sin(2*PI*58*t)':s=44100",
  upbeat: "aevalsrc='0.05*sin(2*PI*261.6*t)*(0.5+0.5*sin(2*PI*2*t))+0.04*sin(2*PI*329.6*t)*(0.5+0.5*sin(2*PI*2*t+1))':s=44100",
};

/** Assemble the final cut: per-shot segments (clip, or Ken Burns on stills), voice, music bed, burned subtitles → MP4. */
export async function renderProject(projectId: string) {
  let p = db.getProject(projectId)!;
  const dir = projectMediaDir(p.id);
  const work = path.join(dir, "render-tmp");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    await setRender(p.id, { status: "running", progress: 2, message: "Preparing shots", url: undefined, review: undefined, warnings: undefined, startedAt: now() });
    const shots = shotsOf(p);
    if (!shots.length) throw new Error("No storyboard shots yet");
    // voice every line that has no audio yet; a TTS outage never fails the whole render — the shot renders silent with a warning
    const warnings: string[] = [];
    const lines = shots.filter((sh) => (sh.narration || sh.dialogue) && (!sh.audioUrl || !fs.existsSync(mediaPath(sh.audioUrl))));
    for (let i = 0; i < lines.length; i++) {
      await setRender(p.id, { progress: 2 + Math.round((i / lines.length) * 8), message: `Voicing line ${i + 1}/${lines.length}` });
      try { await voiceShot(db.getProject(p.id)!, lines[i].id); }
      catch (e) { warnings.push(`Shot ${lines[i].index + 1}: voice unavailable (${(e as Error).message.slice(0, 140)}) — rendered without narration. Tap Re-render to retry.`); }
    }
    // dialogue clarity: every voiced line is checked (pace + speech-to-text round trip) and auto-fixed before the cut
    const voiced = shotsOf(db.getProject(p.id)!).filter((sh) => sh.audioUrl && (sh.narration || sh.dialogue) && sh.clarity?.audio !== sh.audioUrl);
    for (let i = 0; i < voiced.length; i++) {
      await setRender(p.id, { progress: 10 + Math.round((i / voiced.length) * 4), message: `Checking dialogue clarity ${i + 1}/${voiced.length}` });
      await clarityShot(p.id, voiced[i].id).catch(() => null);
    }
    for (const sh of shotsOf(db.getProject(p.id)!)) if (sh.clarity && !sh.clarity.ok) warnings.push(`Shot ${sh.index + 1}: line may be hard to understand (${sh.clarity.issues.join("; ")}) — consider rewording it.`);
    if (warnings.length) await setRender(p.id, { warnings });
    p = db.getProject(p.id)!;
    const { w, h } = aspectSize(p.aspect, 1280);
    const fps = 25;
    const segs: string[] = [];
    const subs: string[] = [];
    let t = 0;
    const list = shotsOf(p);
    for (let i = 0; i < list.length; i++) {
      const sh: Shot = list[i];
      await setRender(p.id, { progress: Math.round(5 + (i / list.length) * 70), message: `Rendering shot ${i + 1}/${list.length}` });
      const start = sh.startFrame.find((v) => v.id === sh.activeStart);
      const end = sh.endFrame.find((v) => v.id === sh.activeEnd);
      const audio = sh.audioUrl && fs.existsSync(mediaPath(sh.audioUrl)) ? mediaPath(sh.audioUrl) : null;
      const adur = audio ? await probeDuration(audio) : 0;
      const trimS = sh.trimStart || 0;
      // fit each shot to its voice line (unless the user locked a length), so narration covers the cut instead of dead air
      const base = sh.durationLocked ? Math.max(sh.durationSec, adur + 0.6) : adur ? fitDuration(adur) : (sh.narration || sh.dialogue) ? sh.durationSec : Math.min(sh.durationSec, SILENT_MAX);
      // the 250 ms lead-in + the whole line + a breath must fit, so one line never runs into the next (no overlapping speech)
      const dur = +Math.max(2, base - trimS - (sh.trimEnd || 0), adur ? adur + 0.6 : 0).toFixed(2);
      const out = path.join(work, `seg${String(i).padStart(3, "0")}.mp4`);
      const vIn: string[] = [];
      let vf: string;
      if (p.outputType === "video" && sh.clipUrl && fs.existsSync(mediaPath(sh.clipUrl))) {
        vIn.push("-stream_loop", "-1", "-ss", String(trimS), "-i", mediaPath(sh.clipUrl));
        vf = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,format=yuv420p[v]`;
      } else {
        const img = start ? mediaPath(start.url) : null;
        if (!img) { vIn.push("-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:r=${fps}`); vf = `[0:v]trim=duration=${dur},format=yuv420p[v]`; }
        else {
          const n = Math.round(dur * fps);
          const dirn = i % 2 === 0 ? "min(1+0.0012*on,1.2)" : "max(1.2-0.0012*on,1)";
          const zp = (k: number) => `[${k}:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='${dirn}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${w}x${h}:fps=${fps},setsar=1`;
          vIn.push("-i", img);
          if (end && dur > 3) {
            vIn.push("-i", mediaPath(end.url));
            const fade = Math.min(1, dur / 3);
            vf = `${zp(0)}[a];${zp(1)}[b];[a][b]xfade=transition=fade:duration=${fade}:offset=${(dur - fade - 0.05).toFixed(2)},trim=duration=${dur},format=yuv420p[v]`;
          } else vf = `${zp(0)},trim=duration=${dur},format=yuv420p[v]`;
        }
      }
      const aIdx = vIn.filter((x) => x === "-i").length;
      const aIn = audio ? ["-i", audio] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
      const af = audio ? `[${aIdx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=250|250,apad,atrim=duration=${dur}[a]` : `[${aIdx}:a]atrim=duration=${dur}[a]`;
      await ffmpeg([...vIn, ...aIn, "-filter_complex", `${vf};${af}`, "-map", "[v]", "-map", "[a]", "-t", String(dur), "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k", out]);
      segs.push(out);
      const line = sh.narration || sh.dialogue || "";
      if (line) for (const c of cues(line, t + 0.25, t + Math.max(1, Math.min(dur - 0.05, adur + 0.35)))) subs.push(`${subs.length + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`);
      t += dur;
    }
    await setRender(p.id, { progress: 80, message: "Joining shots" });
    const listFile = path.join(work, "list.txt");
    fs.writeFileSync(listFile, segs.map((s) => `file '${s}'`).join("\n"));
    const joined = path.join(work, "joined.mp4");
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined]);
    await setRender(p.id, { progress: 88, message: "Mixing music & subtitles" });
    const srt = path.join(work, "subs.srt");
    fs.writeFileSync(srt, subs.join("\n"));
    const final = path.join(dir, `final-${Date.now()}.mp4`);
    const args = ["-i", joined];
    let fc = "";
    let amap = "0:a";
    // music is ducked under speech (sidechain on the voice track), then the mix is loudness-normalised to -16 LUFS / -1.5 dBTP
    const LOUD = "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100";
    if (MUSIC[p.music]) { args.push("-f", "lavfi", "-t", String(t), "-i", MUSIC[p.music]); fc += `[0:a]asplit=2[vo][key];[1:a]volume=0.45,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, t - 2)}:d=2[m];[m][key]sidechaincompress=threshold=0.015:ratio=10:attack=15:release=350:makeup=1[md];[vo][md]amix=inputs=2:duration=first:normalize=0,${LOUD}[a]`; }
    else fc += `[0:a]${LOUD}[a]`;
    amap = "[a]";
    const subIdx = args.filter((x) => x === "-i").length;
    if (subs.length) args.push("-i", srt);
    const vfilter = p.subtitles && subs.length ? `subtitles=${srt.replace(/:/g, "\\:")}:force_style='FontName=DejaVu Sans,FontSize=${p.aspect === "16:9" ? 18 : 12},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=${p.aspect === "16:9" ? 28 : 60}'` : "";
    if (vfilter) fc = (fc ? fc + ";" : "") + `[0:v]${vfilter}[v]`;
    // subtitles: burned in when on, and always a soft (toggleable) track + a sidecar .srt
    await ffmpeg([...args, ...(fc ? ["-filter_complex", fc] : []), "-map", vfilter ? "[v]" : "0:v", "-map", amap, ...(subs.length ? ["-map", `${subIdx}:s`, "-c:s", "mov_text", "-metadata:s:s:0", "language=eng"] : []), "-c:v", vfilter ? "libx264" : "copy", ...(vfilter ? ["-preset", "veryfast", "-crf", "21"] : []), "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final]);
    const srtOut = final.replace(/\.mp4$/, ".srt");
    if (subs.length) { fs.copyFileSync(srt, srtOut); fs.writeFileSync(srtOut.replace(/\.srt$/, ".vtt"), "WEBVTT\n\n" + subs.join("\n").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2")); }
    await setRender(p.id, { srtUrl: subs.length ? mediaUrl(srtOut) : undefined });
    await setRender(p.id, { progress: 95, message: "Muse is reviewing the cut" });
    const review = await reviewCut(db.getProject(p.id)!, t);
    const speech = (await Promise.all(list.map((s) => s.audioUrl && fs.existsSync(mediaPath(s.audioUrl)) ? probeDuration(mediaPath(s.audioUrl)) : 0))).reduce((a, b) => a + b, 0);
    await setRender(p.id, { status: "done", progress: 100, message: `Rendered ${t.toFixed(1)}s · voice ${speech.toFixed(1)}s (${Math.round((speech / Math.max(t, 0.1)) * 100)}%)`, url: mediaUrl(final), review, warnings: warnings.length ? warnings : undefined });
    fs.rmSync(work, { recursive: true, force: true });
  } catch (e) {
    await setRender(p.id, { status: "error", message: (e as Error).message.slice(0, 500) });
  }
}

async function reviewCut(p: Project, total: number) {
  const shots = shotsOf(p);
  const rows = await Promise.all(shots.map(async (s, i) => ({ i: i + 1, dur: s.durationSec, audio: s.audioUrl ? await probeDuration(mediaPath(s.audioUrl)) : 0, text: s.narration || s.dialogue || "", hasFrame: !!s.activeStart, continuity: s.continuity?.ok })));
  if (llmLive()) {
    return chat([{ role: "system", content: "You are a post-production supervisor. Review this edit decision list for voice/subtitle sync, pacing, continuity and platform fit. Reply with 3-6 short bullet points and concrete fixes." }, { role: "user", content: `Format ${p.format} ${p.aspect}, total ${total.toFixed(1)}s.\n${JSON.stringify(rows)}` }], { temperature: 0.2, task: "review" });
  }
  const notes: string[] = [];
  const max = { yt_shorts: 60, tiktok: 180, fb_reels: 90, yt_long: 1200 }[p.format];
  notes.push(total <= max ? `✓ Runtime ${total.toFixed(1)}s fits ${p.format.replace("_", " ")} (≤ ${max}s).` : `⚠ Runtime ${total.toFixed(1)}s exceeds the ${max}s limit — trim shots.`);
  const tight = rows.filter((r) => r.audio && r.audio + 0.3 > r.dur);
  notes.push(tight.length ? `⚠ Voice is tight on shot(s) ${tight.map((r) => r.i).join(", ")}.` : "✓ Every voice line fits inside its shot; subtitles are timed to the audio.");
  const noFrame = rows.filter((r) => !r.hasFrame);
  notes.push(noFrame.length ? `⚠ Shot(s) ${noFrame.map((r) => r.i).join(", ")} have no frame (rendered black).` : "✓ Every shot has a frame.");
  const bad = rows.filter((r) => r.continuity === false);
  notes.push(bad.length ? `⚠ Continuity flags on shot(s) ${bad.map((r) => r.i).join(", ")}.` : "✓ No open continuity flags.");
  return notes.map((n) => "• " + n).join("\n") + "\n(Demo heuristic review — Muse Spark reviews the cut when a Meta key is set.)";
}

// ───────────────────────── Prompt-to-edit ─────────────────────────
type Op = { op: "duration"; shot: number; seconds: number } | { op: "move"; shot: number; to: number } | { op: "delete"; shot: number } | { op: "music"; value: string } | { op: "subtitles"; value: boolean } | { op: "narrator"; voice: string } | { op: "line"; shot: number; text: string } | { op: "trim"; shot: number; start?: number; end?: number };

function mockOps(prompt: string, p: Project): Op[] {
  const s = prompt.toLowerCase(); const ops: Op[] = [];
  const num = (re: RegExp) => { const m = s.match(re); return m ? parseInt(m[1]) : NaN; };
  let n = num(/shot\s*(\d+)/);
  if (/longer|slower|extend/.test(s) && n) ops.push({ op: "duration", shot: n, seconds: (shotsOf(p)[n - 1]?.durationSec || 4) + (num(/(\d+)\s*s(ec)?/) || 2) });
  if (/shorter|faster|tighten/.test(s)) { if (n) ops.push({ op: "duration", shot: n, seconds: Math.max(2, (shotsOf(p)[n - 1]?.durationSec || 4) - 2) }); else shotsOf(p).forEach((sh, i) => ops.push({ op: "duration", shot: i + 1, seconds: Math.max(3, sh.durationSec - 1) })); }
  const mv = s.match(/move shot\s*(\d+)\s*(?:to|after|before)?\s*(?:position|shot)?\s*(\d+)/);
  if (mv) ops.push({ op: "move", shot: +mv[1], to: +mv[2] });
  if (/(delete|remove|cut) shot/.test(s) && n) ops.push({ op: "delete", shot: n });
  if (/no music|remove music|music off/.test(s)) ops.push({ op: "music", value: "none" });
  else for (const m of ["ambient", "tension", "upbeat"]) if (s.includes(m) || (m === "tension" && /suspense|dramatic/.test(s)) || (m === "upbeat" && /happy|energetic/.test(s))) { ops.push({ op: "music", value: m }); break; }
  if (/(no|remove|hide|turn off) (subtitles|captions)/.test(s)) ops.push({ op: "subtitles", value: false });
  else if (/(add|show|turn on) (subtitles|captions)/.test(s)) ops.push({ op: "subtitles", value: true });
  if (/nigerian|naija/.test(s) && /voice|narrat/.test(s)) ops.push({ op: "narrator", voice: /female|woman/.test(s) ? "en-NG-EzinneNeural" : "en-NG-AbeoNeural" });
  if (/british|uk/.test(s) && /voice|narrat/.test(s)) ops.push({ op: "narrator", voice: "en-GB-RyanNeural" });
  n = NaN;
  return ops;
}

export async function aiEdit(p: Project, prompt: string) {
  const shots = shotsOf(p);
  const { data, source } = await structured<{ ops: Op[]; reply: string }>(
    `You are ReelForge's AI editor. Translate the user's request into edit operations on the timeline. Shots are 1-indexed. Allowed ops: {"op":"duration","shot","seconds"}, {"op":"move","shot","to"}, {"op":"delete","shot"}, {"op":"trim","shot","start","end"}, {"op":"music","value":"none|ambient|tension|upbeat"}, {"op":"subtitles","value":bool}, {"op":"narrator","voice":"edge voice id"}, {"op":"line","shot","text"}. Return {"ops":[...],"reply":"one sentence describing what you changed"}.`,
    `Timeline:\n${shots.map((s, i) => `${i + 1}. [${s.durationSec}s] ${s.camera}: ${s.description.slice(0, 80)} ${s.dialogue ? `| ${s.speaker}: ${s.dialogue}` : s.narration ? `| VO: ${s.narration}` : ""}`).join("\n")}\nMusic: ${p.music}. Subtitles: ${p.subtitles}. Narrator: ${p.narratorVoice}\n\nRequest: ${prompt}`,
    () => { const ops = mockOps(prompt, p); return { ops, reply: ops.length ? `Applied ${ops.length} change(s): ${ops.map((o) => o.op).join(", ")}.` : "Demo mode understands: 'make shot 2 longer', 'move shot 3 to 1', 'remove shot 4', 'tension music', 'turn off subtitles', 'Nigerian female narrator'. Add a Meta key for free-form edits." }; },
  );
  await db.update(p.id, (x) => {
    const flat = () => x.scenes.flatMap((s) => s.shots);
    for (const o of data.ops || []) {
      const target = "shot" in o ? flat()[o.shot - 1] : undefined;
      if (o.op === "duration" && target) { target.durationSec = Math.max(1, Math.min(30, o.seconds)); target.durationLocked = true; }
      if (o.op === "trim" && target) { target.trimStart = o.start || 0; target.trimEnd = o.end || 0; }
      if (o.op === "line" && target) { if (target.narration !== undefined) target.narration = o.text; else target.dialogue = o.text; target.audioUrl = undefined; }
      if (o.op === "delete" && target) for (const s of x.scenes) s.shots = s.shots.filter((y) => y.id !== target.id);
      if (o.op === "move" && target) {
        for (const s of x.scenes) s.shots = s.shots.filter((y) => y.id !== target.id);
        const dest = flat()[Math.max(0, o.to - 1)];
        const sc = x.scenes.find((s) => s.shots.includes(dest!)) || x.scenes[0];
        sc.shots.splice(dest ? sc.shots.indexOf(dest) : 0, 0, target);
      }
      if (o.op === "music") x.music = o.value;
      if (o.op === "subtitles") x.subtitles = o.value;
      if (o.op === "narrator") { x.narratorVoice = o.voice; flat().forEach((s) => { if (s.narration) s.audioUrl = undefined; }); }
    }
    flat().forEach((s, i) => (s.index = i));
    x.editLog.push({ role: "user", content: prompt, at: now() }, { role: "assistant", content: data.reply, at: now() });
  });
  return { ...data, source };
}
