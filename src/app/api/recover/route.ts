import { NextResponse } from "next/server";
import { recoverNow } from "@/lib/recover";
import { internalToken } from "@/lib/internal";
import { isAdmin } from "@/lib/auth";
export const dynamic = "force-dynamic";
/** Boot hook (called by instrumentation with the internal token once the server is listening): resume interrupted background work. Idempotent. */
async function ok(req: Request) { return req.headers.get("x-rf-internal") === internalToken() || (await isAdmin()); }
export async function POST(req: Request) { if (!(await ok(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); return NextResponse.json(await recoverNow()); }
export async function GET(req: Request) { return POST(req); }
