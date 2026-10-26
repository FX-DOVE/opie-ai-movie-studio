import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { FORMATS, type Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(db.listProjects().map(({ id, title, mode, format, aspect, style, outputType, cover, updatedAt, scenes, render }) => ({ id, title, mode, format, aspect, style, outputType, cover, updatedAt, shots: scenes.reduce((n, s) => n + s.shots.length, 0), rendered: render.status === "done" })));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const t = new Date().toISOString();
  const format = (b.format in FORMATS ? b.format : "yt_shorts") as Project["format"];
  const p: Project = {
    id: nanoid(10), title: String(b.title || "Untitled project").slice(0, 120), mode: ["drama", "documentary", "ad"].includes(b.mode) ? b.mode : "drama",
    format, aspect: ["9:16", "16:9", "1:1", "4:5"].includes(b.aspect) ? b.aspect : FORMATS[format].aspect,
    style: ["realistic", "pixar", "cartoon", "anime", "custom"].includes(b.style) ? b.style : "realistic", customStyle: b.customStyle || "",
    outputType: b.outputType === "video" ? "video" : "image", idea: String(b.idea || ""), script: String(b.script || ""), brainstorm: [], assets: [], scenes: [], bible: "",
    narratorVoice: getConfig("DEFAULT_NARRATOR") || "en-US-AndrewNeural", music: b.mode === "ad" ? "upbeat" : b.mode === "documentary" ? "ambient" : "tension", subtitles: true,
    render: { status: "idle", progress: 0, message: "", updatedAt: t }, editLog: [], createdAt: t, updatedAt: t,
  };
  await db.saveProject(p);
  return NextResponse.json(p);
}
