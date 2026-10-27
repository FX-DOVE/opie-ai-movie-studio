import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import "@/lib/recover";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser(); if (!u) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const j = getJob((await params).id);
  const owner = j && (j.ownerId || (j.projectId ? db.getProject(j.projectId)?.ownerId : undefined));
  if (j && u.role !== "admin" && owner !== u.id) return NextResponse.json({ error: "You don't have access to this task." }, { status: 403 });
  if (!j) return NextResponse.json({ error: "This task expired — please try again." }, { status: 404 });
  const since = Number(new URL(req.url).searchParams.get("since") || 0);
  return NextResponse.json({ id: j.id, done: j.done, state: j.state, action: j.action, status: j.status, body: j.result, error: j.error, events: j.events.slice(since), next: j.events.length, startedAt: j.startedAt, updatedAt: j.t });
}
