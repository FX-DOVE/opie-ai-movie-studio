import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { remoteUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".srt": "text/plain" };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  // media is private: the project's owner (or an admin) only
  const u = await currentUser(); if (!u) return new Response("unauthorized", { status: 401 });
  const pid = rel.split("/")[0];
  if (u.role !== "admin") { const p = db.getProject(pid); if (!p || p.ownerId !== u.id) return new Response("forbidden", { status: 403 }); }
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR + path.sep) || !fs.existsSync(abs)) return new Response("not found", { status: 404 });
  const stat = fs.statSync(abs);
  const type = TYPES[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const remote = await remoteUrl(rel, type); // R2 enabled → presigned redirect; otherwise local disk
  if (remote) return Response.redirect(remote, 302);
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1]) : 0;
    const end = m?.[2] ? parseInt(m[2]) : stat.size - 1;
    const stream = fs.createReadStream(abs, { start, end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  return new Response(fs.readFileSync(abs), { headers: { "Content-Type": type, "Content-Length": String(stat.size), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=31536000, immutable" } });
}
