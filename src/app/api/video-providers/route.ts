import { NextResponse } from "next/server";
import { publicView } from "@/lib/providers/videoProviders";
export const dynamic = "force-dynamic";
/** Enabled video providers for the per-project dropdown (no keys, no URLs). */
export async function GET() { return NextResponse.json({ providers: publicView() }); }
