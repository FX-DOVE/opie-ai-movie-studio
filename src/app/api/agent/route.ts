import { agentStream } from "@/lib/agent";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const message = String(b.message || "").trim().slice(0, 4000);
  if (!message) return Response.json({ error: "message required" }, { status: 400 });
  const { stream } = agentStream({ convId: b.convId ? String(b.convId) : undefined, message, projectId: b.projectId ? String(b.projectId) : undefined });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
