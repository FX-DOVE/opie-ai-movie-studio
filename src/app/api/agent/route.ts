import { agentStream } from "@/lib/agent";
import { streamJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const message = String(b.message || "").trim().slice(0, 4000);
  if (!message) return Response.json({ error: "message required" }, { status: 400 });
  const { stream } = agentStream({ convId: b.convId ? String(b.convId) : undefined, message, projectId: b.projectId ? String(b.projectId) : undefined });
  return streamJob(stream);
}
