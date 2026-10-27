import { NextResponse } from "next/server";
import { recoverNow } from "@/lib/recover";
export const dynamic = "force-dynamic";
/** Boot hook (called by instrumentation once the server is listening): resume interrupted background work. Idempotent. */
export async function POST() { return NextResponse.json(await recoverNow()); }
export async function GET() { return NextResponse.json(await recoverNow()); }
