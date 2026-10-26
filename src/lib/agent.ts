import { nanoid } from "nanoid";
import { db } from "./db";
import { chatP, chatStream, llmLive, parseJson, type Msg } from "./providers/meta";
import { brainstormStream } from "./brainstorm";
import { getSession, startResearch, type Task } from "./research";
import type { Idea, Project } from "./types";
import { keywordReport, rewriteAsScript, scriptReport, stamp } from "./youtube";
import { FORMATS } from "./types";

/** Opie assistant: a conversational agent with tool calling over the studio's own actions. */
type Turn = { role: "user" | "assistant" | "tool"; content: string; at: string; tool?: string; ok?: boolean };
interface Conv { id: string; projectId?: string; turns: Turn[]; busy: boolean; interrupts: string[]; abort: boolean; researchId?: string; lastIdeas: Idea[] }
const g = globalThis as unknown as { __opieConvs?: Map<string, Conv> };
const convs = (g.__opieConvs ||= new Map<string, Conv>());
export const getConv = (id: string) => convs.get(id);

const base = () => `http://127.0.0.1:${process.env.PORT || 3000}`;
async function act(id: string, body: Record<string, unknown>) {
  const r = await fetch(`${base()}/api/projects/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${body.action} failed (${r.status})`);
  return j;
}
const proj = (c: Conv) => { const p = c.projectId && db.getProject(c.projectId); if (!p) throw new Error("No project is open yet — create_project or open_project first."); return p; };
/** Production pipeline used when a weak model under-plans: next missing stage the user asked for. */
const STAGES: [string, RegExp, (p: Project) => boolean][] = [
  ["write_script", /script|write|all the way|end.to.end|full|complete|render|video|ad\b|make/i, (p) => !!p.script.trim()],
  ["extract_assets", /asset|character|all the way|end.to.end|full|complete|render|video|storyboard|make/i, (p) => p.assets.length > 0],
  ["generate_asset_images", /asset|image|all the way|end.to.end|full|complete|render|video|make/i, (p) => p.assets.length > 0 && p.assets.every((a) => a.activeImage)],
  ["build_storyboard", /storyboard|shot|all the way|end.to.end|full|complete|render|video|make/i, (p) => p.scenes.some((s) => s.shots.length)],
  ["generate_frames", /frame|storyboard|all the way|end.to.end|full|complete|render|video|make/i, (p) => shots(p).length > 0 && shots(p).every((s) => s.activeStart)],
  ["voiceover", /voice|narrat|all the way|end.to.end|full|complete|render|make/i, (p) => shots(p).length > 0 && shots(p).every((s) => s.audioUrl || !(s.dialogue || s.narration))],
  ["render_video", /render|all the way|end.to.end|full|complete|final video|make/i, (p) => p.render.status === "done"],
];
export function nextStage(p: Project | undefined, request: string, tried: string[]) {
  if (!p || !/make|create|produce|build|write|render|generate|all the way|script|storyboard|voice/i.test(request)) return undefined;
  // Stages are sequential: never skip past one that failed (e.g. no assets from an empty script).
  const st = STAGES.find(([, re, ok]) => re.test(request) && !ok(p));
  return st && tried.filter((t) => t === st[0]).length < 2 ? st[0] : undefined;
}
const shots = (p: Project) => p.scenes.flatMap((s) => s.shots);
export function state(p?: Project) {
  if (!p) return "No project open.";
  const sh = shots(p);
  return `Project "${p.title}" (id ${p.id}) · ${p.mode} · ${FORMATS[p.format]?.label} ${p.aspect} · style ${p.style} · output ${p.outputType}\nidea: ${p.idea ? p.idea.slice(0, 160) : "(none)"} · script: ${p.script ? p.script.split(/\s+/).length + " words" : "(none)"} · assets: ${p.assets.length} (${p.assets.filter((a) => a.activeImage).length} with images) · shots: ${sh.length} (${sh.filter((s) => s.activeStart).length} with frames, ${sh.filter((s) => s.audioUrl).length} voiced) · research notes: ${(p.research || []).length} · render: ${p.render.status}`;
}

type Tool = { desc: string; req?: string[]; run: (c: Conv, a: Record<string, unknown>, emit: (o: unknown) => void) => Promise<string> };
const shotAt = (p: Project, a: Record<string, unknown>) => { const all = shots(p); const n = Number(a.shot ?? a.index ?? 1); const s = all[Math.max(0, n - 1)]; if (!s) throw new Error(`No shot ${n} (there are ${all.length})`); return s; };
export const TOOLS: Record<string, Tool> = {
  list_projects: { desc: "{} — list existing projects", run: async () => db.listProjects().slice(0, 10).map((p) => `${p.id}: ${p.title} (${p.mode}, ${p.format})`).join("\n") || "none" },
  open_project: { req: ["projectId"], desc: '{"projectId"} — switch to an existing project', run: async (c, a) => { const p = db.getProject(String(a.projectId)); if (!p) throw new Error("not found"); c.projectId = p.id; return state(p); } },
  create_project: { req: ["title","mode","format"], desc: '{"title","mode":"drama|documentary|ad","format":"yt_shorts|tiktok|fb_reels|yt_long","aspect":"9:16|16:9|1:1|4:5","style":"realistic|pixar|cartoon|anime","outputType":"image|video","idea"}', run: async (c, a, emit) => {
    const r = await fetch(`${base()}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }); const p = await r.json(); c.projectId = p.id; emit({ type: "project", id: p.id, title: p.title }); return state(p); } },
  brainstorm: { req: ["message"], desc: '{"message"} — brainstorm story/ad ideas in the project (returns idea cards)', run: async (c, a) => {
    const p = proj(c); const rd = brainstormStream(p, String(a.message || p.idea || p.title)).getReader(); const dec = new TextDecoder(); let buf = "", done: { message?: { content: string; ideas?: Idea[] } } = {};
    for (;;) { const { value, done: d } = await rd.read(); if (d) break; buf += dec.decode(value); }
    for (const l of buf.split("\n")) { try { const o = JSON.parse(l); if (o.type === "done") done = o; if (o.type === "error") throw new Error(o.error); } catch (e) { if ((e as Error).message && !(e instanceof SyntaxError)) throw e; } }
    c.lastIdeas = done.message?.ideas || [];
    return c.lastIdeas.length ? c.lastIdeas.map((i, k) => `${k + 1}. ${i.title} — ${i.logline}`).join("\n") : (done.message?.content || "").slice(0, 800); } },
  use_idea: { desc: '{"index":1} — set one brainstormed idea as the project idea', run: async (c, a) => { const p = proj(c); let i = c.lastIdeas[Number(a.index || 1) - 1];
    if (!i) { const last = [...p.brainstorm].reverse().find((m) => m.role === "assistant" && m.kind !== "note"); if (!last) throw new Error("No ideas yet — brainstorm first"); i = last.ideas?.[0] || { title: p.title, logline: last.content.replace(/\s+/g, " ").slice(0, 600), hook: "", beats: [], characters: [] } as Idea; } await act(p.id, { action: "useIdea", idea: i }); return `Idea set: ${i.title}`; } },
  write_script: { desc: '{"instruction"} — write the full script, or revise it per the instruction', run: async (c, a) => { const p = proj(c); await act(p.id, { action: "writeScript", prompt: String(a.instruction || "") }); const q = db.getProject(p.id)!; return `Script ${q.script.split(/\s+/).length} words. Opening: ${q.script.slice(0, 300)}`; } },
  extract_assets: { desc: "{} — extract characters/locations/props from the script", run: async (c) => { const p = proj(c); await act(p.id, { action: "extractAssets" }); return db.getProject(p.id)!.assets.map((x) => `${x.kind}: ${x.name}`).join(", "); } },
  generate_asset_images: { desc: "{} — generate reference images for every asset", run: async (c) => { const p = proj(c); await act(p.id, { action: "autocreateAssets" }); return state(db.getProject(p.id)); } },
  build_storyboard: { desc: "{} — split the script into scenes and shots", run: async (c) => { const p = proj(c); await act(p.id, { action: "buildStoryboard" }); const q = db.getProject(p.id)!; return `${q.scenes.length} scenes, ${shots(q).length} shots:\n` + shots(q).slice(0, 12).map((s, i) => `${i + 1}. ${s.description.slice(0, 90)}`).join("\n"); } },
  generate_frames: { desc: '{"limit":50} — generate start frames for shots that have none', run: async (c, a) => { const p = proj(c); await act(p.id, { action: "autofillFrames", limit: Number(a.limit) || 50 }); return state(db.getProject(p.id)); } },
  edit_shot: { req: ["shot","prompt"], desc: '{"shot":1,"prompt"} — regenerate shot N\'s frame with a change', run: async (c, a) => { const p = proj(c); const s = shotAt(p, a); await act(p.id, { action: "frame", shotId: s.id, which: "start", prompt: String(a.prompt || "") }); return `Shot ${a.shot} regenerated with "${a.prompt}"`; } },
  continuity_check: { desc: "{} — check continuity across all shots", run: async (c) => { const p = proj(c); const r = await act(p.id, { action: "continuityAll" }); return JSON.stringify(r.result ?? r).slice(0, 900); } },
  fix_continuity: { req: ["shot"], desc: '{"shot":1} — auto-fix continuity on shot N', run: async (c, a) => { const p = proj(c); const s = shotAt(p, a); const r = await act(p.id, { action: "fixContinuity", shotId: s.id }); return JSON.stringify(r.result ?? r).slice(0, 400); } },
  voiceover: { desc: "{} — generate voiceover for every shot", run: async (c) => { const p = proj(c); await act(p.id, { action: "voiceAll" }); return state(db.getProject(p.id)); } },
  render_video: { desc: "{} — assemble and render the final video (waits until done)", run: async (c, _a, emit) => {
    const p = proj(c); await act(p.id, { action: "render" });
    for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 3000)); const q = db.getProject(p.id)!; if (i % 5 === 0) emit({ type: "status", text: `Rendering… ${Math.round(q.render.progress || 0)}% ${q.render.message || ""}` }); if (q.render.status === "done" || q.render.status === "error") return `Render ${q.render.status}: ${q.render.message} ${q.render.url || ""}`; if (c.abort) return "Render continues in background"; }
    return "Render still running in the background"; } },
  edit_video: { req: ["prompt"], desc: '{"prompt"} — apply an edit command (music, subtitles, pacing, voice…)', run: async (c, a) => { const p = proj(c); const r = await act(p.id, { action: "aiEdit", prompt: String(a.prompt || "") }); return JSON.stringify(r.result ?? r).slice(0, 500); } },
  research: { req: ["task","goal"], desc: '{"task":"trending|analyse|watch|custom","goal","url"?,"maxSteps":8} — run the virtual-desktop browser agent (YouTube research, watching videos); notes are saved to the open project', run: async (c, a, emit) => {
    const task = (["trending", "analyse", "watch", "custom"].includes(String(a.task)) ? a.task : "custom") as Task;
    const s = startResearch({ goal: String(a.goal || a.url || "research"), task, url: a.url ? String(a.url) : undefined, projectId: c.projectId, maxSteps: Number(a.maxSteps) || 8 });
    c.researchId = s.id; emit({ type: "session", id: s.id }); let seen = 0;
    while (s.status === "running" || s.status === "paused") {
      await new Promise((r) => setTimeout(r, 1500));
      for (const st of s.steps.slice(seen)) if (st.kind === "act" || st.kind === "note") emit({ type: "status", text: `🖥 ${st.action}` }); seen = s.steps.length;
    }
    const x = getSession(s.id)!;
    return `status ${x.status}${x.error ? " " + x.error : ""}. Videos seen: ${x.trending.slice(0, 8).map((v: { title: string; channel: string; views?: string }) => `${v.title} (${v.channel}, ${v.views || "?"})`).join("; ")}\nNOTES:\n${x.notes.slice(0, 2500)}`; } },
  extract_keywords: { req: ["input"], desc: '{"input": YouTube link or seed keyword} — tags, hashtags, autocomplete suggestions, ranked into primary/long-tail/trending keywords', run: async (_c, a) => { const r = await keywordReport(String(a.input)); return `Video: ${r.raw.video?.title || "-"} | tags: ${r.raw.tags.slice(0, 15).join(", ") || "none"}\nPRIMARY: ${r.report.primary.join(", ")}\nLONG-TAIL: ${r.report.longTail.join(", ")}\nTRENDING: ${r.report.trending.join(", ")}\nHASHTAGS: ${r.report.hashtags.join(" ")}\n${r.report.summary || ""}`; } },
  get_youtube_script: { req: ["url"], desc: '{"url", "use_as_script": false} — ALREADY returns the full timestamped transcript (no research needed after it) + hook/beats/CTA analysis; use_as_script=true writes an ORIGINAL rewritten script into the open project', run: async (c, a) => {
    const r = await scriptReport(String(a.url)); if (!r.segs.length) return `No transcript available for "${r.video.title}" (${r.via}).`;
    let extra = ""; if (a.use_as_script && c.projectId) { const w = await rewriteAsScript(r); await db.update(c.projectId, (x) => { x.script = w.script; }); extra = `\nWrote an original script into the project (${w.script.split(/\s+/).length} words).`; }
    return `"${r.video.title}" — ${r.video.channel} · ${r.segs.length} caption lines via ${r.via}\nHOOK: ${r.analysis?.hook || "-"}\nBEATS: ${(r.analysis?.beats || []).map((b) => `${b.t || ""} ${b.beat}`).join(" | ")}\nCTA: ${r.analysis?.cta || "-"}\nTRANSCRIPT: ${r.segs.slice(0, 60).map((s) => `[${stamp(s.t)}] ${s.text}`).join(" ").slice(0, 1800)}${extra}`; } },
  project_status: { desc: "{} — current project state", run: async (c) => state(proj(c)) },
};

function system(c: Conv) {
  const p = c.projectId ? db.getProject(c.projectId) : undefined;
  return `You are Opie, the assistant inside an AI movie studio. You chat naturally AND get things done by calling tools. You can create projects, brainstorm, write scripts, build assets/storyboards, generate frames, fix continuity, voice, render, edit, and browse the web on a virtual desktop.

TOOLS (name args — purpose):
${Object.entries(TOOLS).map(([k, t]) => `- ${k} ${t.desc}`).join("\n")}

HOW YOU WORK: you talk to the user in natural dialogue; the runtime executes the tools you plan, one by one, and shows the user a progress card for each. For a multi-step request plan all the steps and carry them through without asking permission for each. Only ask a clarifying question when something essential is truly ambiguous; otherwise choose sensible defaults (e.g. a TikTok ad → create_project mode ad, format tiktok, 9:16; usual order: create_project → brainstorm → use_idea → write_script → extract_assets → generate_asset_images → build_storyboard → generate_frames → voiceover → render_video). To browse the web or YouTube use the research tool. Never invent tool results.

CURRENT STATE: ${state(p)}${c.researchId ? `\nLast desktop research id: ${c.researchId}` : ""}`;
}

const STOP = /^\s*(stop|cancel|abort|halt|enough)\b/i;
/** A message that arrives while the agent is mid-task: redirects the desktop agent and the planner. */
export function interrupt(c: Conv, msg: string) {
  c.interrupts.push(msg);
  const s = c.researchId ? getSession(c.researchId) : undefined;
  if (STOP.test(msg)) { c.abort = true; if (s && (s.status === "running" || s.status === "paused")) { s.stop = true; s.pause = false; } return "Stopping now — I'll wrap up with what I have."; }
  if (s && (s.status === "running" || s.status === "paused")) { (s.inbox ||= []).push(msg); return "Got it — I'm steering the desktop agent with that now."; }
  return "Noted — I'll factor that in after the current step.";
}

export function agentStream(o: { convId?: string; message: string; projectId?: string }): { conv: Conv; stream: ReadableStream<Uint8Array> } {
  let c = o.convId ? convs.get(o.convId) : undefined;
  if (!c) { c = { id: o.convId || nanoid(10), turns: [], busy: false, interrupts: [], abort: false, lastIdeas: [] }; convs.set(c.id, c); }
  if (o.projectId && db.getProject(o.projectId)) c.projectId = o.projectId;
  const conv = c; const enc = new TextEncoder();
  const now = () => new Date().toISOString();
  if (conv.busy) {
    const reply = interrupt(conv, o.message);
    conv.turns.push({ role: "user", content: o.message, at: now() }, { role: "assistant", content: reply, at: now() });
    return { conv, stream: new ReadableStream({ start(ctrl) { ctrl.enqueue(enc.encode(JSON.stringify({ type: "conv", id: conv.id }) + "\n" + JSON.stringify({ type: "delta", text: reply }) + "\n" + JSON.stringify({ type: "done", interrupt: true }) + "\n")); ctrl.close(); } }) };
  }
  conv.busy = true; conv.abort = false; conv.interrupts = [];
  conv.turns.push({ role: "user", content: o.message, at: now() });
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const emit = (x: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(x) + "\n")); } catch { /* client gone */ } };
      emit({ type: "conv", id: conv.id, projectId: conv.projectId });
      try {
        if (!llmLive()) { const t = "I'm in demo mode — add a Meta key (or an OpenAI-compatible fallback like xAI) in Admin → AI brain and I'll be able to plan and run studio tasks for you."; emit({ type: "delta", text: t }); conv.turns.push({ role: "assistant", content: t, at: now() }); return; }
        const hist = (): Msg[] => conv.turns.slice(-24).map((t: Turn): Msg => t.role === "tool" ? { role: "user", content: `TOOL RESULT ${t.tool} (${t.ok ? "ok" : "error"}):\n${t.content}` } : { role: t.role, content: t.content });
        const say = async (instruction: string) => {
          const meta: { provider?: string; model?: string } = {}; let full = ""; emit({ type: "thinking" });
          for await (const d of chatStream([{ role: "system", content: system(conv) }, ...hist(), { role: "user", content: `[runtime instruction, not from the user] ${instruction} Never describe a step as done unless a TOOL RESULT shows it; no bracketed placeholders like [Writing Script]. Keep it under 120 words.` }], { temperature: 0.5, agent: true }, meta)) {
            if (!full) emit({ type: "provider", provider: meta.provider, model: meta.model });
            const cut = (full + d).search(/\n?\s*(CALL\s*\{|```|\n\s*\[)/); if (cut >= 0) { const rest = (full + d).slice(full.length, cut); if (rest) emit({ type: "delta", text: rest }); full = (full + d).slice(0, cut); break; }
            full += d; emit({ type: "delta", text: d });
            if (full.length > 1400) break;
          }
          conv.turns.push({ role: "assistant", content: full.trim(), at: now() });
          emit({ type: "turn_end", provider: meta.provider ? `${meta.provider}${meta.model ? ` · ${meta.model}` : ""}` : undefined });
        };
        type Step = { tool: string; args?: Record<string, unknown> };
        const plan = async (): Promise<Step[]> => {
          emit({ type: "status", text: "Planning…" });
          try {
            const ask = 'PLANNER: output ONLY JSON (no prose): {"plan":[{"tool":"<tool name>","args":{...}}]} — the ordered tool calls still needed to fully satisfy the user\'s latest request given CURRENT STATE and the results so far. Use {"plan":[]} if the request is just a question/chat, is already done, or you are waiting for the user to answer a question. Fill args concretely (titles, prompts, goals) from the conversation.';
            const r = await chatP([{ role: "system", content: system(conv) }, ...hist(), { role: "user", content: ask }], { json: true, temperature: 0.1, agent: true });
            if (process.env.AGENT_DEBUG) console.log("PLAN", r.text);
            let j: { plan?: (Step | string)[] };
            try { j = parseJson(r.text); } catch { j = { plan: [...r.text.matchAll(new RegExp(`\\b(${Object.keys(TOOLS).join("|")})\\b`, "g"))].map((m) => m[1]).filter((t, i, a) => a.indexOf(t) === i) }; }
            return (j.plan || []).map((x) => typeof x === "string" ? { tool: x } : { ...x, tool: x.tool || (x as { name?: string }).name || "" }).filter((x) => x && TOOLS[x.tool]).slice(0, 12);
          } catch (e) { if (process.env.AGENT_DEBUG) console.log("PLANERR", e); return []; }
        };
        const fill = async (st: Step) => {
          const t = TOOLS[st.tool]; const args = { ...(st.args || {}) };
          if (!(t.req || []).some((k) => args[k] === undefined || args[k] === "")) return args;
          try {
            const r = await chatP([{ role: "system", content: `Fill the arguments for tool ${st.tool} ${t.desc}. Base them on the user's request and the conversation. Output ONLY the JSON args object.` }, { role: "user", content: `Conversation:\n${conv.turns.filter((x) => x.role !== "tool").slice(-8).map((x) => `${x.role}: ${x.content.slice(0, 600)}`).join("\n")}\n\nState: ${state(conv.projectId ? db.getProject(conv.projectId) : undefined)}\nPartial args: ${JSON.stringify(args)}` }], { json: true, temperature: 0.1 });
            return { ...parseJson<Record<string, unknown>>(r.text), ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== "" && v !== undefined)) };
          } catch { return args; }
        };
        await say("Reply to the user's latest message in natural, friendly language. If they asked you to make or do something, briefly acknowledge and outline the steps you will take (1–3 short sentences) and do NOT state any results yet — the tools run automatically right after you, so never ask for confirmation or say ready?. If it's a question you can answer from the conversation and tool results, answer it fully. If something essential is truly missing, ask ONE short clarifying question. No JSON, no CALL lines.");
        const last = conv.turns[conv.turns.length - 1]?.content || "";
        const isQ = /\?\s*$/.test(o.message) && /^\s*(which|what|how|why|who|when|where|did|does|do|is|are|was|were|can you tell|tell me|explain|summari[sz]e)\b/i.test(o.message) && !/\b(research|browse|watch|search|look up|find out|check|trending|latest|right now|youtube|desktop)\b/i.test(o.message);
        let steps = isQ ? [] : /\?\s*$/.test(last) && last.length < 300 && !/\b(I'll|I will|let me|let's)\b/i.test(last) ? [] : await plan();
        let ran = 0;
        if (steps.length) emit({ type: "plan", steps: steps.map((x) => x.tool) });
        while (steps.length && ran < 14 && !conv.abort) {
          const st = steps.shift()!; const tool = TOOLS[st.tool];
          const tid = nanoid(6); emit({ type: "tool_start", id: tid, name: st.tool, args: st.args || {} });
          const args = await fill(st); emit({ type: "tool_args", id: tid, args });
          let res: string, ok = true;
          try { res = await tool.run(conv, args, emit); } catch (e) { res = (e as Error).message.slice(0, 400); ok = false; }
          emit({ type: "tool_end", id: tid, name: st.tool, ok, summary: res.slice(0, 600) });
          conv.turns.push({ role: "assistant", content: `CALL ${JSON.stringify({ tool: st.tool, args })}`, at: now() }, { role: "tool", tool: st.tool, ok, content: res.slice(0, 3500), at: now() });
          ran++;
          const said = conv.interrupts.splice(0);
          if (said.length) { for (const u of said) conv.turns.push({ role: "user", content: `(said while you were working) ${u}`, at: now() }); if (!conv.abort) { await say("The user just said something while you were working. Respond briefly and naturally, saying how you'll adjust. No JSON."); steps = await plan(); } }
          else if (!ok && steps.length) { steps = await plan(); }
          if (!steps.length && !conv.abort && ran < 14 && !isQ) {
            const req = [...conv.turns].reverse().find((t) => t.role === "user" && !t.content.startsWith("(said"))?.content || "";
            const tried = conv.turns.slice(-30).filter((t) => t.role === "tool" && !t.ok).map((t) => t.tool!);
            const nx = nextStage(conv.projectId ? db.getProject(conv.projectId) : undefined, req, tried);
            if (nx) { steps = [{ tool: nx, args: nx === "write_script" ? { instruction: req } : {} }]; continue; } const more = (await plan()).filter((x) => !conv.turns.some((t) => t.role === "tool" && t.ok && t.tool === x.tool && !["edit_shot", "fix_continuity", "edit_video"].includes(x.tool))); if (more.length) { steps = more; emit({ type: "plan", steps: steps.map((x) => x.tool) }); } }
        }
        if (ran) await say(conv.abort ? "You were stopped by the user. Summarise briefly what was done and what's left. No JSON." : "All steps are done. Give the user a short conversational summary of what you did and what you found/made (cite concrete results), and suggest a next step. No JSON, no CALL lines.");
        if (conv.abort) emit({ type: "status", text: "Stopped." });
      } catch (e) { emit({ type: "error", error: (e as Error).message.slice(0, 500) }); }
      finally { conv.busy = false; emit({ type: "done", projectId: conv.projectId }); try { ctrl.close(); } catch { /* */ } }
    },
  });
  return { conv, stream };
}
