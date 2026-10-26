import { NextResponse } from "next/server";
import { startResearch } from "@/lib/research";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { goal } = await req.json().catch(() => ({}));
  if (!goal || String(goal).length < 3) return NextResponse.json({ error: "Describe what to research" }, { status: 400 });
  const s = startResearch(String(goal).slice(0, 300));
  return NextResponse.json({ id: s.id });
}
