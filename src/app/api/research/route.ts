import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { db } from "@/lib/db";
import { listSessions, startManual, startResearch, type Task } from "@/lib/research";
export const dynamic = "force-dynamic";
export async function GET() { const u = await requireUser(); if (u instanceof Response) return u; return NextResponse.json(listSessions(u.role === "admin" ? undefined : u.id)); }
export async function POST(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  if (b.manual) return NextResponse.json({ id: startManual(b.url ? String(b.url) : undefined, u.id).id });
  if (b.projectId) { const p = db.getProject(String(b.projectId)); if (!p || (u.role !== "admin" && p.ownerId !== u.id)) return NextResponse.json({ error: "You don't have access to this project." }, { status: 403 }); }
  const task: Task = ["trending", "analyse", "watch", "custom"].includes(b.task) ? b.task : "trending";
  const goal = String(b.goal || (task === "watch" ? b.url : "") || "").trim();
  if (goal.length < 3) return NextResponse.json({ error: "Describe what to research" }, { status: 400 });
  if (task === "watch" && !/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(String(b.url || goal))) return NextResponse.json({ error: "Paste a YouTube video link to watch" }, { status: 400 });
  const s = startResearch({ goal: goal.slice(0, 300), task, url: task === "watch" ? String(b.url || goal) : undefined, projectId: b.projectId || undefined, maxSteps: Number(b.maxSteps) || undefined, ownerId: u.id });
  return NextResponse.json({ id: s.id });
}
