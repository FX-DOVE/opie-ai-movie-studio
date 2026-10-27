import { NextResponse } from "next/server";
import { publicView } from "@/lib/providers/videoProviders";
export const dynamic = "force-dynamic";
/** Enabled video providers for the per-project dropdown (no keys, no URLs). */
import { requireUser } from "@/lib/guard";
export async function GET() { const u = await requireUser(); if (u instanceof Response) return u; return NextResponse.json({ providers: publicView() }); }
