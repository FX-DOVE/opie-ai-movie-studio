import { NextResponse } from "next/server";
import { listSessions, startResearch, type Task } from "@/lib/research";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(listSessions()); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const task: Task = ["trending", "analyse", "watch", "custom"].includes(b.task) ? b.task : "trending";
  const goal = String(b.goal || (task === "watch" ? b.url : "") || "").trim();
  if (goal.length < 3) return NextResponse.json({ error: "Describe what to research" }, { status: 400 });
  if (task === "watch" && !/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(String(b.url || goal))) return NextResponse.json({ error: "Paste a YouTube video link to watch" }, { status: 400 });
  const s = startResearch({ goal: goal.slice(0, 300), task, url: task === "watch" ? String(b.url || goal) : undefined, projectId: b.projectId || undefined, maxSteps: Number(b.maxSteps) || undefined });
  return NextResponse.json({ id: s.id });
}
