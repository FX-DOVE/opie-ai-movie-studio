import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { createProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser(); if (u instanceof Response) return u;
  return NextResponse.json(db.listProjects(u.role === "admin" ? undefined : u.id).map(({ id, title, mode, format, aspect, style, outputType, cover, updatedAt, scenes, render, ownerId }) => ({ id, title, mode, format, aspect, style, outputType, cover, updatedAt, shots: scenes.reduce((n, s) => n + s.shots.length, 0), rendered: render.status === "done", rendering: render.status === "running" || render.status === "queued", ...(u.role === "admin" && ownerId !== u.id ? { ownerId } : {}) })));
}

export async function POST(req: Request) {
  const u = await requireUser(); if (u instanceof Response) return u;
  const b = await req.json().catch(() => ({}));
  return NextResponse.json(await createProject(b, u.id));
}
