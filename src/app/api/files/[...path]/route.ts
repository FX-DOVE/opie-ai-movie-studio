import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR } from "@/lib/db";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".srt": "text/plain" };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR + path.sep) || !fs.existsSync(abs)) return new Response("not found", { status: 404 });
  const stat = fs.statSync(abs);
  const type = TYPES[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? parseInt(m[1]) : 0;
    const end = m?.[2] ? parseInt(m[2]) : stat.size - 1;
    const stream = fs.createReadStream(abs, { start, end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  return new Response(fs.readFileSync(abs), { headers: { "Content-Type": type, "Content-Length": String(stat.size), "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" } });
}
