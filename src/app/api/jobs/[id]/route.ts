import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import "@/lib/recover";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const j = getJob((await params).id);
  if (!j) return NextResponse.json({ error: "This task expired — please try again." }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return NextResponse.json({ id: j.id, done: j.done, state: j.state, action: j.action, status: j.status, body: j.result, error: j.error, events: j.events.slice(since), next: j.events.length, startedAt: j.startedAt, updatedAt: j.t });
}
