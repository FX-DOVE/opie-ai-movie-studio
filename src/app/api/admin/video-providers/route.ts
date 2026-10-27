import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { adminView, DEFAULT_MAPPING, LTX_COMFY_WORKFLOW, PRESETS, saveProviders, type VideoProviderCfg } from "@/lib/providers/videoProviders";
export const dynamic = "force-dynamic";
const out = () => ({ providers: adminView(), presets: PRESETS, defaultMapping: DEFAULT_MAPPING, comfyWorkflow: LTX_COMFY_WORKFLOW });
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(out());
}
/** body: { providers: VideoProviderCfg[] (order = fallback order), keys: { [id]: "new key" | null (remove) } } */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json()) as { providers: VideoProviderCfg[]; keys?: Record<string, string | null> };
  try { await saveProviders(b.providers || [], b.keys || {}); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json(out());
}
