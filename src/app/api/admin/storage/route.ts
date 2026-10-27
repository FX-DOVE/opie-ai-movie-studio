import { isAdmin } from "@/lib/auth";
import { storageMode, testR2 } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET() { if (!(await isAdmin())) return Response.json({ error: "unauthorized" }, { status: 401 }); return Response.json({ mode: storageMode() }); }
export async function POST() { if (!(await isAdmin())) return Response.json({ error: "unauthorized" }, { status: 401 }); return Response.json({ ...(await testR2()), mode: storageMode() }); }
