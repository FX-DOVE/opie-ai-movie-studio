import { desk, deskContext } from "@/lib/desk";
import { allSessions } from "@/lib/research";
export const dynamic = "force-dynamic";

const pass = async (r: Response) => new Response(r.status === 204 ? null : await r.arrayBuffer(), { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" } });
const down = () => Response.json({ state: "unavailable", error: "The desktop service isn’t running." }, { status: 503 });

export async function GET(_: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  if (op === "editable") return Response.json({ text: await chromeEditable() });
  if (!["status", "frame"].includes(op)) return Response.json({ error: "not found" }, { status: 404 });
  try { return await pass(await desk("/" + op, undefined, 5000)); } catch { return down(); }
}
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params; if (!["wake", "sleep", "control", "input", "browser"].includes(op)) return Response.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (op === "control") for (const s of allSessions()) if (s.status === "running" || s.status === "paused") s.control = !!b.on; // pause/resume the agent
  try {
    const r = await desk("/" + op, b, 20000);
    if (op === "input" && r.ok && (b.t === "click" || b.t === "up")) {
      const j = await r.json(); if (/chrom/i.test(j.cls || "")) j.text = Number(b.y) < 0.13 || await chromeEditable(); return Response.json(j);
    }
    return await pass(r);
  } catch { return down(); }
}
/** Is a text field focused in the desktop Chromium? (decides whether the phone keyboard stays up) */
async function chromeEditable() {
  try {
    const ctx = await deskContext(); if (!ctx) return false;
    for (const p of ctx.pages()) {
      const yes = await p.evaluate(() => { const e = document.activeElement as HTMLElement | null; return document.visibilityState === "visible" && !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)); }).catch(() => false);
      if (yes) return true;
    }
  } catch { /* */ }
  return false;
}
