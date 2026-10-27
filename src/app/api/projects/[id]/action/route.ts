import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startJob, activeJobs } from "@/lib/jobs";
import { runAction } from "@/lib/actions";
import "@/lib/recover";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** Long actions run as durable server-side jobs (x-job header): the reply is just a job id; the work never depends on this HTTP request. */
export async function POST(req: Request, { params }: Ctx) {
  const id = (await params).id;
  const b = await req.json().catch(() => ({}));
  if (!db.getProject(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (req.headers.get("x-job")) {
    const busyKey = String(b._busy || b.action || "");
    delete b._busy;
    const dup = activeJobs(id).find((j) => j.action === b.action && j.busyKey === busyKey && JSON.stringify(j.body) === JSON.stringify(b));
    if (dup) return NextResponse.json({ job: dup.id, deduped: true }, { status: 202 });
    const jid = startJob({ projectId: id, action: String(b.action || ""), busyKey, body: b });
    return NextResponse.json({ job: jid }, { status: 202 });
  }
  const r = await runAction(id, b);
  return NextResponse.json(r.body, { status: r.status });
}
