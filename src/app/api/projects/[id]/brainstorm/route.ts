import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brainstormStream } from "@/lib/brainstorm";
import { streamJob } from "@/lib/jobs";
import { withStep } from "@/lib/usage";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Ctx) {
  const p = db.getProject((await params).id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { message, autoResearch } = await req.json().catch(() => ({}));
  if (!message || !String(message).trim()) return NextResponse.json({ error: "Say something" }, { status: 400 });
  return withStep(p.id, "idea", () => streamJob(brainstormStream(p, String(message).slice(0, 4000), autoResearch !== false)));
}
