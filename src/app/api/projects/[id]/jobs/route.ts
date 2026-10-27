import { NextResponse } from "next/server";
import { activeJobs, recentJobs } from "@/lib/jobs";
import "@/lib/recover";
export const dynamic = "force-dynamic";
/** A project's background jobs: what is running right now (so a reopened/refreshed page can reconnect) + recent results. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const view = (j: ReturnType<typeof recentJobs>[number]) => ({ id: j.id, kind: j.kind, action: j.action, busyKey: j.busyKey, state: j.state, done: j.done, error: j.error, startedAt: j.startedAt, updatedAt: j.t, attempts: j.attempts });
  return NextResponse.json({ active: activeJobs(id).map(view), recent: recentJobs(id, 15).map(view) });
}
