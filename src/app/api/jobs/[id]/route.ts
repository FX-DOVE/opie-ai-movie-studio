import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const j = getJob((await params).id);
  if (!j) return NextResponse.json({ error: "This task expired — please try again." }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return NextResponse.json({ done: j.done, status: j.status, body: j.body, events: j.events.slice(since), next: j.events.length });
}
