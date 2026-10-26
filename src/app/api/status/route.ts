import { NextResponse } from "next/server";
import { liveStatus } from "@/lib/config";
import { EDGE_VOICES } from "@/lib/providers/tts";
export const dynamic = "force-dynamic";
/** Public: only booleans about which engines are live — never key material. */
export async function GET() { return NextResponse.json({ ...liveStatus(), voices: EDGE_VOICES }); }
