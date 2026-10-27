import { NextResponse } from "next/server";
import { learn } from "@/lib/memory";
import { requireProject } from "@/lib/guard";
import { brainstormStream } from "@/lib/brainstorm";
import { streamJob } from "@/lib/jobs";
import { withStep } from "@/lib/usage";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Ctx) {
  const g = await requireProject((await params).id); if (g instanceof Response) return g;
  const p = g.p;
  const { message, autoResearch } = await req.json().catch(() => ({}));
  if (!message || !String(message).trim()) return NextResponse.json({ error: "Say something" }, { status: 400 });
  learn(g.user.id, p, { kind: "brainstorm_request", detail: String(message).slice(0, 400) });
  return withStep(p.id, "idea", () => streamJob(brainstormStream(p, String(message).slice(0, 4000), autoResearch !== false), { projectId: p.id, ownerId: g.user.id, action: "brainstorm" }));
}
