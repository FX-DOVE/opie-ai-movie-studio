import { agentStream } from "@/lib/agent";
import { streamJob } from "@/lib/jobs";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;
export async function POST(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  if (b.projectId) { const p = db.getProject(String(b.projectId)); if (p && u.role !== "admin" && p.ownerId !== u.id) return Response.json({ error: "You don't have access to this project." }, { status: 403 }); }
  const message = String(b.message || "").trim().slice(0, 4000);
  if (!message) return Response.json({ error: "message required" }, { status: 400 });
  const { stream } = agentStream({ convId: b.convId ? String(b.convId) : undefined, message, projectId: b.projectId ? String(b.projectId) : undefined, autoResearch: b.autoResearch !== false, ownerId: u.id });
  return streamJob(stream, { projectId: b.projectId ? String(b.projectId) : undefined, ownerId: u.id, action: "agent" });
}
