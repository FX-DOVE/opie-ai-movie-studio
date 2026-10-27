/**
 * Meta native computer use (muse-spark-1.3 by default, escalating to muse-wonder-1.0) on Reel's real Linux desktop.
 * Loop: screenshot (desk /shot, 1280×720 JPEG) → Responses API with tools:[{type:"computer"}] → computer_call actions
 * → executed with xdotool via the desk service → fresh screenshot as computer_call_output → repeat.
 */
import { getConfig } from "./config";
import { desk, deskContext } from "./desk";
import { cost, logEscalation, record } from "./usage";

export const DW = 1280, DH = 720;
export const computerUseLive = () => !!getConfig("META_API_KEY");
/** Model-facing screenshot size (downscaled + recompressed to cut image tokens); actions are mapped back to 1280×720. */
const shotW = () => { const w = parseInt(getConfig("CU_SHOT_WIDTH") || "1024"); return w >= 320 && w <= DW ? w : 1024; };

export interface CuStep { action: string; text?: string; screen?: string }
export interface CuOpts {
  task: string; maxSteps?: number; model?: string;
  onStep?: (s: CuStep) => void | Promise<void>;
  /** return false to stop; awaited before each turn (lets the user take control / pause) */
  gate?: () => boolean | Promise<boolean>;
  label?: string;
  /** caller says this task is hard → start on the escalation model (logged as reason "complex") */
  complex?: boolean;
  /** pin the model (Admin Compare test) */
  noEscalate?: boolean;
}

/** Complex = flagged by the caller, or (Admin: auto-flag on) a long brief / 3+ chained steps. */
export function isComplex(o: CuOpts) {
  if (o.complex) return true;
  if (getConfig("CU_COMPLEX_AUTO") === "off") return false;
  return o.task.length > 700 || (o.task.match(/\b(then|after that|next)\b/gi) || []).length >= 3;
}

// Stable prefix (same text every call, per width) → served from Meta's prompt cache.
const instructions = (W: number, H: number) => `You are Reel, a computer-use agent operating a real Linux desktop (Openbox) for a film studio. Screenshots are ${W}x${H}.
Desktop icons on the left: Browser (Chromium), Files, Terminal. A taskbar is at the bottom. Chromium is usually already open and maximised — use it for the web.
Coordinates are pixels in the screenshot you were last shown: (0,0) is the top-left. Click the centre of the target element.
Return a short batch of actions only when they do not depend on intermediate visual feedback (click, type, keypress). Do not batch across page loads, searches or modal transitions. Use wait when a page is loading.
To go to a URL: press ctrl+l (or click Chromium's address bar), type the URL, press Enter. Prefer direct URLs (e.g. https://www.youtube.com/results?search_query=...) over many clicks.
Be efficient: use as few steps as possible.
Never sign in, never type passwords, never buy anything, never accept terms on the user's behalf. If a sign-in wall, CAPTCHA or bot check blocks you, stop and say so.
Finish by replying with a normal message containing your findings (the answer when the goal is visibly complete, or a short explanation when infeasible). Do not claim completion unless the screenshot supports it.`;

export async function deskShot(settle = 350, w = DW, q?: number): Promise<string> {
  const r = await desk("/shot", { settle, ...(w < DW ? { w } : {}), ...(q ? { q } : {}) }, 15000);
  if (!r.ok) throw new Error("desktop screenshot failed (" + r.status + ")");
  return "data:image/jpeg;base64," + Buffer.from(await r.arrayBuffer()).toString("base64");
}

const KEY: Record<string, string> = { ENTER: "Return", RETURN: "Return", ESC: "Escape", ESCAPE: "Escape", TAB: "Tab", SPACE: "space", BACKSPACE: "BackSpace", DELETE: "Delete", DEL: "Delete", UP: "Up", DOWN: "Down", LEFT: "Left", RIGHT: "Right", ARROWUP: "Up", ARROWDOWN: "Down", ARROWLEFT: "Left", ARROWRIGHT: "Right", HOME: "Home", END: "End", PAGEUP: "Prior", PAGEDOWN: "Next", CTRL: "ctrl", CONTROL: "ctrl", ALT: "alt", SHIFT: "shift", META: "super", SUPER: "super", CMD: "ctrl", COMMAND: "ctrl", WIN: "super" };
export const xkey = (keys: string[]) => keys.map((k) => KEY[k.toUpperCase()] || (k.length === 1 ? k.toLowerCase() : k)).join("+");

type Act = { type: string; x?: number; y?: number; button?: string; text?: string; keys?: string[]; scroll_x?: number; scroll_y?: number; path?: { x: number; y: number }[] };
const inp = (o: Record<string, unknown>) => desk("/input", o, 20000);

/** Execute one action. `W`×`H` is the screenshot space the model saw. */
export async function runAction(a: Act, W = DW, H = DH) {
  const nx = (x?: number) => Math.max(0, Math.min(1, (x ?? W / 2) / W)), ny = (y?: number) => Math.max(0, Math.min(1, (y ?? H / 2) / H));
  const button = a.button === "right" ? "right" : a.button === "wheel" ? "middle" : "left";
  const k = H / DH; // scroll deltas are in screenshot pixels too
  let r: Response | undefined;
  switch (a.type) {
    case "click": r = await inp({ t: "click", x: nx(a.x), y: ny(a.y), button }); break;
    case "double_click": r = await inp({ t: "click", x: nx(a.x), y: ny(a.y), double: true }); break;
    case "move": r = await inp({ t: "move", x: nx(a.x), y: ny(a.y) }); break;
    case "drag": r = await inp({ t: "drag", path: (a.path || []).map((p) => ({ x: nx(p.x), y: ny(p.y) })) }); break;
    case "type": r = await inp({ t: "type", text: a.text || "" }); break;
    case "keypress": r = await inp({ t: "key", key: xkey(a.keys || []) }); break;
    case "scroll": {
      if (a.scroll_y) r = await inp({ t: "scroll", x: nx(a.x), y: ny(a.y), dy: a.scroll_y / k });
      if (a.scroll_x) r = await inp({ t: "hscroll", x: nx(a.x), y: ny(a.y), dx: a.scroll_x / k });
      break;
    }
    case "wait": await new Promise((z) => setTimeout(z, 1500)); return;
    default: return; // screenshot / unknown → just re-capture
  }
  if (r && !r.ok) throw new Error(`desk input ${r.status}`);
}

const label = (a: Act) => `${a.type}${a.text ? ` "${a.text.slice(0, 60)}"` : ""}${a.keys ? ` ${a.keys.join("+")}` : ""}${a.x !== undefined ? ` @${a.x},${a.y}` : ""}${a.scroll_y ? ` dy=${a.scroll_y}` : ""}`;
const sig = (s: string) => s.length + ":" + s.slice(-4000, -3000); // cheap "did the screen change?" fingerprint

/** URL currently shown in Reel's Chromium (for the safety-check allowlist). */
async function currentUrl() { try { const c = await deskContext(); const ps = c?.pages() || []; return ps.length ? ps[ps.length - 1].url() : ""; } catch { return ""; } }
const RISKY = /malicious|sensitive|credential|password|payment|purchase|financ|personal|login|sign.?in/i;
/**
 * Meta returns pending_safety_checks on some actions. Policy (Admin → CU_SAFETY_ACK):
 *  - "allowlist" (default): acknowledge only generic checks (no risky code/message), never for typing on a non-allowlisted
 *    site, and only while the browser is on an allowlisted research domain (or a blank tab). Everything else stops for a human.
 *  - "never": always stop and hand control to the user.
 */
async function canAck(checks: { code?: string; message?: string }[], acts: Act[]) {
  if ((getConfig("CU_SAFETY_ACK") || "allowlist") !== "allowlist") return false;
  if (checks.some((c) => RISKY.test(`${c.code || ""} ${c.message || ""}`))) return false;
  const url = await currentUrl(); let host = "";
  try { host = new URL(url).hostname; } catch { /* about:blank etc. */ }
  const allow = (getConfig("CU_SAFE_DOMAINS") || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const onAllowed = !host || /^(about:|chrome:\/\/newtab)/.test(url) || allow.some((d) => host === d || host.endsWith("." + d));
  if (!onAllowed) return false;
  // typed text: allow only URLs/search terms (no @, no long secrets-looking strings)
  return acts.every((a) => a.type !== "type" || (!!a.text && a.text.length < 200 && !/@|\bpass(word)?\b/i.test(a.text)));
}

export interface CuResult { text: string; steps: number; model: string; stopped?: string; escalated?: boolean; reason?: string; usd: number; tokens: Record<string, { in: number; out: number; usd: number }> }
/**
 * Run a computer-use trajectory. Muse Spark 1.3 drives first; the task is handed to the escalation model
 * (muse-wonder-1.0 by default, Admin-switchable) when Spark errors, gets stuck repeatedly, or the task is flagged
 * complex. Each escalation is logged (reason + tokens + cost per model). Screenshots are downscaled/JPEG'd, the context
 * keeps only the last few screenshots (the chain restarts with a short text history), the system prompt is
 * cache-stable, steps are capped, and every call's tokens/cost are logged for Admin.
 */
const NATIVE = new Map<string, boolean>(); // model → accepts tools:[{type:"computer"}] (learned at runtime)
export async function runComputerUse(o: CuOpts): Promise<CuResult> {
  const base = (getConfig("META_BASE_URL") || "https://api.meta.ai/v1").replace(/\/$/, "");
  const key = getConfig("META_API_KEY"); if (!key) throw new Error("No Meta API key");
  const first = o.model || getConfig("META_AGENT_MODEL") || "muse-spark-1.3";
  const esc = o.noEscalate ? "none" : getConfig("META_ESCALATE_MODEL") || "muse-wonder-1.0";
  const canEsc = esc !== "none" && esc !== first;
  let model = first;
  const escAfter = Math.max(1, parseInt(getConfig("CU_ESCALATE_AFTER") || "3"));
  const keep = Math.max(2, parseInt(getConfig("CU_HISTORY") || "4"));
  const max = Math.min(o.maxSteps || 99, parseInt(getConfig("CU_MAX_STEPS") || "12"));
  const W = shotW(), H = Math.round((W * DH) / DW / 2) * 2, INS = instructions(W, H);
  let usd = 0; let reason: string | undefined;
  const tokens: CuResult["tokens"] = {};
  const drop = new Set<string>();
  const call = async (body: Record<string, unknown>) => {
    const extra: Record<string, unknown> = { truncation: "auto", prompt_cache_key: "reelforge-computer-use", prompt_cache_retention: "24h" };
    for (let t = 0; t < 4; t++) {
      const b = { ...body, ...Object.fromEntries(Object.entries(extra).filter(([k]) => !drop.has(k))) };
      const r = await fetch(base + "/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(180000) });
      if (r.ok) {
        const j = await r.json(); const m = String(b.model); const u = j.usage || {};
        record(o.label || "computer-use", "Meta Muse", m, u);
        const c = cost(m, u.input_tokens || 0, u.input_tokens_details?.cached_tokens || 0, u.output_tokens || 0); usd += c;
        const tk = (tokens[m] ||= { in: 0, out: 0, usd: 0 }); tk.in += u.input_tokens || 0; tk.out += u.output_tokens || 0; tk.usd += c;
        return j;
      }
      const txt = await r.text();
      const bad = r.status === 400 ? Object.keys(extra).find((k) => !drop.has(k) && txt.includes(k)) : undefined;
      if (bad) { drop.add(bad); continue; } // optional feature not enabled on this account
      if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 600 * 2 ** t + Math.random() * 300)); continue; }
      throw new Error(`Muse computer use ${r.status}: ${txt.slice(0, 300)}`);
    }
    throw new Error("Muse computer use: retries exhausted");
  };
  const chatUsage = (m: string, u: Record<string, number & { cached_tokens?: number }> | undefined) => {
    record(o.label || "computer-use", "Meta Muse", m, u);
    const pin = u?.prompt_tokens || 0, pout = u?.completion_tokens || 0;
    const c = cost(m, pin, (u?.prompt_tokens_details as unknown as { cached_tokens?: number })?.cached_tokens || 0, pout); usd += c;
    const tk = (tokens[m] ||= { in: 0, out: 0, usd: 0 }); tk.in += pin; tk.out += pout; tk.usd += c;
  };
  /**
   * Fallback driver for models that do not accept the native computer tool (e.g. muse-wonder-1.0 on some accounts):
   * vision chat → JSON actions in screenshot pixels → the same xdotool executor.
   */
  const visionDrive = async (m: string, left: number): Promise<{ text: string; steps: number; stopped?: string }> => {
    const sys = INS + `\nYou cannot call tools. Reply with JSON only: {"actions":[{"type":"click|double_click|type|keypress|scroll|wait","x":int,"y":int,"text":string,"keys":[string],"scroll_y":int}],"done":boolean,"answer":string}. Use done=true with the answer when finished or blocked.`;
    for (let k = 0; k < left; k++) {
      if (o.gate && !(await o.gate())) return { text: "", steps: k, stopped: "stopped" };
      const r = await fetch(base + "/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ model: m, temperature: 0.1, response_format: { type: "json_object" }, prompt_cache_key: "reelforge-computer-vision", messages: [{ role: "system", content: sys }, { role: "user", content: [
          { type: "text", text: `${o.task}${history.length ? `\n\nDone so far: ${history.slice(-8).join(" → ")}` : ""}\nCurrent screen attached.` }, { type: "image_url", image_url: { url: shot } }] }] }) });
      if (!r.ok) throw new Error(`${m} vision driver ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json(); chatUsage(m, j.usage);
      let plan: { actions?: Act[]; done?: boolean; answer?: string } = {};
      try { const t = String(j.choices?.[0]?.message?.content || ""); plan = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { /* treat as no-op */ }
      if (plan.done || !plan.actions?.length) return { text: plan.answer || "", steps: k };
      const acts = plan.actions.slice(0, 4);
      if (acts.some((a) => a.type === "type" && /@|pass(word)?/i.test(a.text || ""))) return { text: "Stopped: the next step would type personal data or a password — please take over.", steps: k, stopped: "safety" };
      for (const a of acts) await runAction(a, W, H).catch(() => {});
      shot = await deskShot(450, W); const what = acts.map(label).join(" · "); history.push(what);
      await o.onStep?.({ action: `${what} (${m}, vision driver)`, screen: shot });
    }
    return { text: `Stopped at the step cap. Progress: ${history.slice(-5).join(" → ")}`, steps: left, stopped: "budget" };
  };
  const textOf = (resp: { output?: { type: string; content?: { text?: string }[] }[]; output_text?: string }) => resp.output_text || (resp.output || []).filter((x) => x.type === "message").map((x) => (x.content || []).map((c) => c.text || "").join("")).join("\n");
  const history: string[] = [];
  const fresh = (shot: string) => call({ model, instructions: INS, tools: [{ type: "computer" }], input: [{ role: "user", content: [
    { type: "input_text", text: o.task + (history.length ? `\n\nProgress so far (most recent last):\n${history.slice(-8).map((h, i) => `${i + 1}. ${h}`).join("\n")}\nContinue from the current screen.` : "") },
    { type: "input_image", image_url: shot }] }] });

  let shot = await deskShot(0, W);
  let i = 0;
  const finish = (r: Omit<CuResult, "usd" | "tokens" | "model" | "escalated" | "reason">): CuResult => {
    const out: CuResult = { ...r, model, escalated: !!reason, reason, usd, tokens };
    if (reason) {
      const z = { in: 0, out: 0, usd: 0 }; const pick = (m: string) => { const t = tokens[m] || z; return { in: t.in, out: t.out, usd: +t.usd.toFixed(5) }; };
      logEscalation({ label: o.label || "computer-use", from: first, to: esc, reason, outcome: r.stopped || (r.text ? "finished" : "no answer"), steps: r.steps, spark: pick(first), wonder: pick(esc) });
    }
    return out;
  };
  const escalate = async (why: string) => { model = esc; reason = why; await o.onStep?.({ action: `Handing this task to ${esc} — ${why}`, screen: shot }); };
  await o.onStep?.({ action: "screenshot", screen: shot });
  if (canEsc && isComplex(o)) await escalate("task flagged complex");
  const unsupported = (e: unknown) => /Unsupported tool type|not support.*computer/i.test((e as Error).message);
  /** fresh native chain; if this model rejects the computer tool, drive it through the vision fallback instead */
  const start = async (): Promise<{ resp?: Awaited<ReturnType<typeof call>>; done?: CuResult }> => {
    if (NATIVE.get(model) !== false) {
      try { return { resp: await fresh(shot) }; } catch (e) { if (!unsupported(e)) throw e; NATIVE.set(model, false); }
    }
    await o.onStep?.({ action: `${model} has no native computer tool on this key — using the vision driver`, screen: shot });
    const r = await visionDrive(model, Math.max(1, max - i));
    return { done: finish({ text: r.text, steps: i + r.steps, stopped: r.stopped }) };
  };
  let resp;
  try { const s0 = await start(); if (s0.done) return s0.done; resp = s0.resp; }
  catch (e) { if (!canEsc || reason) throw e; await escalate(`${first} failed: ${(e as Error).message.slice(0, 120)}`); const s1 = await start(); if (s1.done) return s1.done; resp = s1.resp; }
  let turns = 0, stuck = 0, last = "", lastSig = sig(shot);
  try {
    for (; i < max; i++) {
      const calls = (resp.output || []).filter((x: { type: string }) => x.type === "computer_call");
      const said = textOf(resp);
      if (!calls.length) return finish({ text: said, steps: i });
      if (o.gate && !(await o.gate())) return finish({ text: said, steps: i, stopped: "stopped" });
      const c = calls[0];
      const acts: Act[] = c.actions || (c.action ? [c.action] : []);
      let acked: unknown[] = [];
      if (c.pending_safety_checks?.length) {
        // acknowledged only under the allowlist policy (generic check, research domain, no personal data); otherwise a human decides
        if (!(await canAck(c.pending_safety_checks, acts))) return finish({ text: `Stopped for a safety check: ${c.pending_safety_checks.map((x: { message?: string; code?: string }) => x.message || x.code).join("; ")} — take control on Reel’s computer to continue.`, steps: i, stopped: "safety" });
        acked = c.pending_safety_checks;
        await o.onStep?.({ action: `Safety check acknowledged (allowlisted site): ${c.pending_safety_checks.map((x: { message?: string; code?: string }) => x.code || x.message).join("; ").slice(0, 120)}`, screen: shot });
      }
      let failed = false;
      for (const a of acts) { try { await runAction(a, W, H); } catch { failed = true; break; } }
      shot = await deskShot(acts.some((a) => a.type === "wait") ? 0 : 450, W);
      const what = acts.map(label).join(" · ") || "screenshot";
      history.push(what);
      await o.onStep?.({ action: what, text: said.slice(0, 240), screen: shot });
      // stuck = an action failed, or a real action left the screen unchanged, or the same batch repeats
      const passive = acts.every((a) => a.type === "wait" || a.type === "screenshot" || a.type === "move");
      const s2 = sig(shot);
      const why = failed ? "action failed" : what === last ? "repeating the same action" : !passive && s2 === lastSig ? "screen unchanged" : "";
      stuck = why ? stuck + 1 : 0;
      last = what; lastSig = s2; turns++;
      if (stuck >= escAfter && canEsc && model !== esc) {
        await escalate(`stuck ${escAfter}× in a row (last: ${why})`);
        stuck = 0; turns = 0; const s2 = await start(); if (s2.done) return s2.done; resp = s2.resp; continue;
      }
      if (turns >= keep) { turns = 0; resp = await fresh(shot); continue; } // short context: restart the chain with a text history
      const item: Record<string, unknown> = { type: "computer_call_output", call_id: c.call_id, acknowledged_safety_checks: acked, output: { type: "computer_screenshot", image_url: shot } };
      resp = await call({ model, instructions: INS, tools: [{ type: "computer" }], previous_response_id: resp.id, input: [item] });
    }
  } catch (e) {
    // Spark errored mid-task → hand the rest to the escalation model once, continuing from the current screen
    if (!canEsc || reason) { if (reason) finish({ text: "", steps: i, stopped: "error" }); throw e; }
    await escalate(`${first} failed mid-task: ${(e as Error).message.slice(0, 120)}`);
    const r = await runComputerUse({ ...o, task: `${o.task}\n\nProgress so far: ${history.slice(-8).join(" → ")}. Continue from the current screen.`, model: esc, noEscalate: true, complex: false, maxSteps: Math.max(1, max - i) });
    for (const [m, t] of Object.entries(r.tokens)) { const tk = (tokens[m] ||= { in: 0, out: 0, usd: 0 }); tk.in += t.in; tk.out += t.out; tk.usd += t.usd; }
    usd += r.usd;
    return finish({ text: r.text, steps: i + r.steps, stopped: r.stopped });
  }
  return finish({ text: textOf(resp) || `Stopped at the ${max}-step cap. Progress: ${history.slice(-5).join(" → ")}`, steps: max, stopped: "budget" });
}
