/** Token & cost ledger per task/model/project step (no prompts or keys stored). Persisted to DATA_DIR/usage.json. */
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { getConfig } from "./config";

// Prices are NOT hardcoded facts: they come from Admin → Pricing (editable; defaults are only a starting point).
const triple = (k: string) => { const v = (getConfig(k) || "").split("/").map((x) => parseFloat(x)); return v.length === 3 && v.every((x) => isFinite(x)) ? { in: v[0], cached: v[1], out: v[2] } : undefined; };
export function priceOf(model: string): { in: number; cached: number; out: number } | undefined {
  if (/contributor/.test(model)) return triple("PRICE_CONTRIBUTOR");
  if (/^muse-wonder/.test(model)) return triple("PRICE_WONDER");
  if (/^muse-spark-1\.\d$/.test(model)) return triple("PRICE_SPARK");
  if (/muse-spark-open|^meta-models\//.test(model)) return triple("PRICE_BASETEN");
  return undefined;
}
export function imagePrice(model: string) { const k = /^sam/.test(model) ? "PRICE_SAM" : /^muse-image/.test(model) ? "PRICE_IMAGE" : ""; const v = k ? parseFloat(getConfig(k) || "") : NaN; return isFinite(v) ? v : 0; }

export interface UsageRow { at: string; task: string; provider: string; model: string; in: number; cached: number; out: number; images?: number; usd: number; pid?: string; step?: string }
export interface EscalationRow { at: string; label: string; from: string; to: string; reason: string; outcome: string; steps: number; spark: { in: number; out: number; usd: number }; wonder: { in: number; out: number; usd: number } }
const g = globalThis as unknown as { __rfUsage?: UsageRow[]; __rfUsageT?: ReturnType<typeof setTimeout>; __rfEsc?: EscalationRow[]; __rfStep?: AsyncLocalStorage<{ pid: string; step: string }> };
const dir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
const file = () => path.join(dir(), "usage.json");
const escFile = () => path.join(dir(), "escalations.json");
function rows(): UsageRow[] {
  if (!g.__rfUsage) { try { g.__rfUsage = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { g.__rfUsage = []; } }
  return g.__rfUsage!;
}
function escRows(): EscalationRow[] {
  if (!g.__rfEsc) { try { g.__rfEsc = JSON.parse(fs.readFileSync(escFile(), "utf8")); } catch { g.__rfEsc = []; } }
  return g.__rfEsc!;
}
const steps = (g.__rfStep ||= new AsyncLocalStorage());
/** Tag every model call inside fn with a project + pipeline step (feeds the “Built with Meta” pipeline view). */
export function withStep<T>(pid: string, step: string, fn: () => T): T { return steps.run({ pid, step }, fn); }
export const currentStep = () => steps.getStore();
/** Tag the rest of the current async flow (route handler / background job) with a project step. */
export function enterStep(pid: string, step: string) { steps.enterWith({ pid, step }); }

export function cost(model: string, inTok: number, cached: number, out: number, images = 0) {
  const p = priceOf(model); const img = imagePrice(model) * images;
  if (!p) return img;
  return ((inTok - cached) * p.in + cached * p.cached + out * p.out) / 1e6 + img;
}
function save(f: string, data: unknown) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data)); } catch { /* best effort */ } }
/** Accepts Chat Completions or Responses usage objects. */
export function record(task: string, provider: string, model: string, u: Record<string, unknown> | undefined, images = 0, usdOverride?: number) {
  const n = (x: unknown) => (typeof x === "number" ? x : 0);
  const d = (u?.prompt_tokens_details || u?.input_tokens_details) as Record<string, unknown> | undefined;
  const inTok = n(u?.prompt_tokens ?? u?.input_tokens), out = n(u?.completion_tokens ?? u?.output_tokens), cached = n(d?.cached_tokens);
  const ctx = steps.getStore();
  if (!inTok && !out && !images && !ctx) return;
  const r: UsageRow = { at: new Date().toISOString(), task, provider, model, in: inTok, cached, out, ...(images ? { images } : {}), usd: +(usdOverride ?? cost(model, inTok, cached, out, images)).toFixed(6), ...(ctx ? { pid: ctx.pid, step: ctx.step } : {}) };
  const all = rows(); all.push(r); if (all.length > 8000) all.splice(0, all.length - 8000);
  clearTimeout(g.__rfUsageT); g.__rfUsageT = setTimeout(() => save(file(), all), 1500);
}
export function logEscalation(e: Omit<EscalationRow, "at">) {
  const all = escRows(); all.push({ at: new Date().toISOString(), ...e }); if (all.length > 500) all.splice(0, all.length - 500);
  save(escFile(), all);
}
/** Project deleted: keep the cost rows for billing totals but drop the link to the project. */
export function anonymizeProject(pid: string) {
  const all = rows(); let n = 0;
  for (const r of all) if (r.pid === pid) { delete r.pid; r.step = r.step ? r.step : undefined; n++; }
  if (n) save(file(), all);
  return n;
}
export function projectTrace(pid: string) { return rows().filter((r) => r.pid === pid); }
export function usageReport(days = 30) {
  const since = Date.now() - days * 864e5; const all = rows().filter((r) => Date.parse(r.at) >= since);
  const agg = (k: (r: UsageRow) => string) => Object.values(all.reduce((m, r) => { const key = k(r); const a = (m[key] ||= { key, calls: 0, in: 0, cached: 0, out: 0, images: 0, usd: 0 }); a.calls++; a.in += r.in; a.cached += r.cached; a.out += r.out; a.images += r.images || 0; a.usd += r.usd; return m; }, {} as Record<string, { key: string; calls: number; in: number; cached: number; out: number; images: number; usd: number }>)).sort((a, b) => b.usd - a.usd || b.calls - a.calls);
  const esc = escRows().filter((r) => Date.parse(r.at) >= since);
  return { days, total: +all.reduce((s, r) => s + r.usd, 0).toFixed(4), byTask: agg((r) => r.task), byModel: agg((r) => `${r.provider} · ${r.model}`), recent: all.slice(-25).reverse(), escalations: esc.slice(-50).reverse(), unpriced: [...new Set(all.filter((r) => !priceOf(r.model) && !imagePrice(r.model)).map((r) => r.model))] };
}
