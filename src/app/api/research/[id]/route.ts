import { NextResponse } from "next/server";
import { getSession } from "@/lib/research";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Ctx) {
  const s = getSession((await params).id);
  return s ? NextResponse.json(s) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function DELETE(_: Request, { params }: Ctx) {
  const s = getSession((await params).id);
  if (s) s.stop = true;
  return NextResponse.json({ ok: true });
}
