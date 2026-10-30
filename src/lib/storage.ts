import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import { spawnSync } from "node:child_process";
import { MEDIA_DIR, db } from "./db";

/**
 * Pluggable storage. Media is always produced on local disk (ffmpeg needs real files);
 * when R2 is enabled, files are mirrored to Cloudflare R2 (S3-compatible) on first request
 * and served with short-lived presigned URLs (or a public base URL). Without keys → local disk.
 */
export interface R2Conf { account: string; key: string; secret: string; bucket: string; endpoint: string; publicBase?: string }
export function r2Conf(): R2Conf | null {
  const account = getConfig("R2_ACCOUNT_ID") || "", key = getConfig("R2_ACCESS_KEY_ID") || "", secret = getConfig("R2_SECRET_ACCESS_KEY") || "";
  const bucket = getConfig("R2_BUCKET") || "cineforge";
  const endpoint = (getConfig("R2_ENDPOINT") || (account ? `https://${account}.r2.cloudflarestorage.com` : "")).replace(/\/$/, "");
  if (!key || !secret || !endpoint) return null;
  return { account, key, secret, bucket, endpoint, publicBase: getConfig("R2_PUBLIC_URL")?.replace(/\/$/, "") || undefined };
}
export const r2Enabled = () => getConfig("R2_ENABLED") === "on" && !!r2Conf();
export const storageMode = () => (r2Enabled() ? "r2" : "local");

const h = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");
const hm = (k: Buffer | string, s: string) => crypto.createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const keyPath = (k: string) => k.split("/").map(enc).join("/");
function signingKey(secret: string, date: string) { return hm(hm(hm(hm("AWS4" + secret, date), "auto"), "s3"), "aws4_request"); }

/** SigV4 header-signed request to R2. */
export async function r2Req(c: R2Conf, method: string, key: string, body?: Buffer, type?: string, query: Record<string, string> = {}) {
  const u = new URL(`${c.endpoint}/${c.bucket}${key ? "/" + keyPath(key) : ""}`);
  const qs = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const now = new Date(); const amz = now.toISOString().replace(/[-:]|\.\d{3}/g, ""); const date = amz.slice(0, 8);
  const ph = h(body || "");
  const headers: Record<string, string> = { host: u.host, "x-amz-content-sha256": ph, "x-amz-date": amz, ...(type ? { "content-type": type } : {}) };
  const names = Object.keys(headers).sort();
  const creq = [method, u.pathname, qs, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), ph].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", amz, scope, h(creq)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(c.secret, date)).update(sts).digest("hex");
  const { host: _host, ...send } = headers; void _host;
  return fetch(qs ? `${u.origin}${u.pathname}?${qs}` : u, { method, body: body ? new Uint8Array(body) : undefined, headers: { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` }, signal: AbortSignal.timeout(30000) });
}
/** Presigned GET URL (default 1 hour). */
export function presign(c: R2Conf, key: string, expires = 3600) {
  if (c.publicBase) return `${c.publicBase}/${keyPath(key)}`;
  const u = new URL(`${c.endpoint}/${c.bucket}/${keyPath(key)}`);
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ""); const date = amz.slice(0, 8); const scope = `${date}/auto/s3/aws4_request`;
  const q: [string, string][] = [["X-Amz-Algorithm", "AWS4-HMAC-SHA256"], ["X-Amz-Credential", `${c.key}/${scope}`], ["X-Amz-Date", amz], ["X-Amz-Expires", String(expires)], ["X-Amz-SignedHeaders", "host"]];
  const qs = q.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const creq = ["GET", u.pathname, qs, `host:${u.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(c.secret, date)).update(["AWS4-HMAC-SHA256", amz, scope, h(creq)].join("\n")).digest("hex");
  return `${u.origin}${u.pathname}?${qs}&X-Amz-Signature=${sig}`;
}

const g = globalThis as unknown as { __r2Up?: Set<string> };
const uploaded = (g.__r2Up ||= new Set());
/** URL to serve a media file from: presigned R2 URL (uploading on first use) or null → serve locally. */
export async function remoteUrl(rel: string, type: string): Promise<string | null> {
  if (!r2Enabled()) return null; const c = r2Conf()!; const key = "media/" + rel;
  try {
    if (!uploaded.has(key)) {
      const head = await r2Req(c, "HEAD", key);
      if (!head.ok) { const r = await r2Req(c, "PUT", key, fs.readFileSync(path.join(MEDIA_DIR, rel)), type); if (!r.ok) throw new Error(`R2 upload ${r.status}`); }
      uploaded.add(key);
    }
    return presign(c, key);
  } catch (e) { console.error("R2 fallback to local:", (e as Error).message); return null; }
}

/** Admin "Test connection": upload, read back, delete a tiny object. */
export async function testR2(): Promise<{ ok: boolean; message: string }> {
  const c = r2Conf(); if (!c) return { ok: false, message: "Missing Access Key ID, Secret Access Key or Endpoint." };
  const key = `reelforge-test/${Date.now()}.txt`, body = Buffer.from("reelforge ok " + new Date().toISOString());
  try {
    const put = await r2Req(c, "PUT", key, body, "text/plain"); if (!put.ok) return { ok: false, message: `Upload failed (${put.status}): ${(await put.text()).match(/<Message>(.*?)<\/Message>/)?.[1] || put.statusText}` };
    const get = await fetch(presign({ ...c, publicBase: undefined }, key, 60)); const txt = await get.text();
    if (!get.ok || txt !== body.toString()) return { ok: false, message: `Read-back failed (${get.status}).` };
    const del = await r2Req(c, "DELETE", key); if (!del.ok && del.status !== 204) return { ok: false, message: `Uploaded and read OK, but delete failed (${del.status}) — the token needs Object Read & Write.` };
    return { ok: true, message: `Connected to bucket “${c.bucket}”: upload, presigned read and delete all worked.` };
  } catch (e) { return { ok: false, message: "Couldn’t reach R2: " + (e as Error).message }; }
}

/** Delete every R2 object under a key prefix (e.g. "media/<projectId>/"). Runs whenever R2 keys are configured, even if serving is switched off. */
export async function r2DeletePrefix(prefix: string): Promise<{ deleted: number; remaining: number; error?: string }> {
  const c = r2Conf(); if (!c || !prefix || prefix === "/") return { deleted: 0, remaining: 0 };
  let deleted = 0;
  try {
    for (let round = 0; round < 50; round++) {
      const r = await r2Req(c, "GET", "", undefined, undefined, { "list-type": "2", prefix, "max-keys": "1000" });
      if (!r.ok) return { deleted, remaining: -1, error: `R2 list ${r.status}` };
      const keys = [...(await r.text()).matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
      if (!keys.length) return { deleted, remaining: 0 };
      for (const k of keys) { const d = await r2Req(c, "DELETE", k); if (d.ok || d.status === 204 || d.status === 404) { deleted++; uploaded.delete(k); } }
    }
    return { deleted, remaining: -1, error: "too many objects" };
  } catch (e) { return { deleted, remaining: -1, error: (e as Error).message }; }
}
/** Count R2 objects under a prefix (verification). */
export async function r2Count(prefix: string): Promise<number> {
  const c = r2Conf(); if (!c) return 0;
  const r = await r2Req(c, "GET", "", undefined, undefined, { "list-type": "2", prefix, "max-keys": "1000" });
  if (!r.ok) throw new Error(`R2 list ${r.status}`);
  return [...(await r.text()).matchAll(/<Key>/g)].length;
}

/* ---------- R2 as primary store: local disk is only a working cache ---------- */

/** Synchronously pull a missing media file from R2 into the local cache (used by mediaPath, so ffmpeg/vision always get a real file). */
export function hydrateSync(rel: string, abs: string): boolean {
  if (!r2Enabled() || fs.existsSync(abs)) return fs.existsSync(abs);
  const url = presign({ ...r2Conf()!, publicBase: undefined }, "media/" + rel, 600);
  const js = `const fs=require("fs");(async()=>{const r=await fetch(process.argv[1]);if(!r.ok)process.exit(2);const b=Buffer.from(await r.arrayBuffer());fs.mkdirSync(require("path").dirname(process.argv[2]),{recursive:true});const t=process.argv[2]+".part"+process.pid;fs.writeFileSync(t,b);fs.renameSync(t,process.argv[2]);})().catch(()=>process.exit(3))`;
  const r = spawnSync(process.execPath, ["-e", js, url, abs], { timeout: 180_000, stdio: "ignore" });
  return r.status === 0 && fs.existsSync(abs);
}
(globalThis as unknown as { __rfHydrate?: typeof hydrateSync }).__rfHydrate = hydrateSync;

/** Does R2 hold this media file? Returns its size, or null. */
export async function r2Head(rel: string): Promise<{ size: number; etag: string } | null> {
  const c = r2Conf(); if (!c) return null;
  const r = await r2Req(c, "HEAD", "media/" + rel); if (!r.ok) return null;
  return { size: Number(r.headers.get("content-length") || -1), etag: (r.headers.get("etag") || "").replace(/"/g, "") };
}
/** Stream a media file from R2 (range-aware) — used when it is no longer on local disk. */
export async function r2Fetch(rel: string, range?: string | null): Promise<Response | null> {
  if (!r2Enabled()) return null;
  const r = await fetch(presign({ ...r2Conf()!, publicBase: undefined }, "media/" + rel, 600), { headers: range ? { range } : {} });
  return r.ok || r.status === 206 || r.status === 416 ? r : null;
}

const busy = (pid: string) => {
  const p = db.getProject(pid); if (!p) return true; // unknown/deleting: leave alone
  if (["queued", "running"].includes(p.render?.status)) return true;
  if (p.scenes?.some((s) => s.shots.some((sh) => sh.clipJob && ["queued", "running"].includes(sh.clipJob.state)))) return true;
  const jobs = (globalThis as unknown as { __jobs?: Map<string, { projectId?: string; done: boolean }> }).__jobs;
  for (const j of jobs?.values() || []) if (!j.done && j.projectId === pid) return true;
  return false;
};
function walk(d: string, out: string[] = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, out); else out.push(f); } return out; }

/** Upload idle local media to R2, verify (size + MD5/ETag) and drop the local copy. */
export async function offloadOnce(minAgeMs = 10 * 60_000): Promise<{ uploaded: number; dropped: number; failed: number; bytes: number }> {
  const s = { uploaded: 0, dropped: 0, failed: 0, bytes: 0 };
  if (!r2Enabled()) return s; const c = r2Conf()!;
  for (const pid of fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR) : []) {
    const dir = path.join(MEDIA_DIR, pid); if (!fs.statSync(dir).isDirectory() || (pid !== "_admin" && busy(pid))) continue;
    for (const abs of walk(dir)) {
      try {
        if (/\.part\d*$|\.tmp$/.test(abs)) continue;
        const st = fs.statSync(abs); if (Date.now() - st.mtimeMs < minAgeMs) continue;
        const rel = path.relative(MEDIA_DIR, abs).split(path.sep).join("/");
        const buf = fs.readFileSync(abs); const md5 = crypto.createHash("md5").update(buf).digest("hex");
        let head = await r2Head(rel);
        if (!head || head.size !== st.size || head.etag !== md5) {
          const type = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".srt": "text/plain", ".vtt": "text/vtt" } as Record<string, string>)[path.extname(abs).toLowerCase()] || "application/octet-stream";
          const put = await r2Req(c, "PUT", "media/" + rel, buf, type); if (!put.ok) throw new Error("PUT " + put.status);
          s.uploaded++; head = await r2Head(rel);
        }
        if (!head || head.size !== st.size || head.etag !== md5) throw new Error("verify mismatch");
        if (fs.statSync(abs).mtimeMs !== st.mtimeMs) continue; // rewritten meanwhile
        fs.unlinkSync(abs); s.dropped++; s.bytes += st.size;
      } catch (e) { s.failed++; console.error("R2 offload", abs, (e as Error).message); }
    }
  }
  return s;
}
const og = globalThis as unknown as { __rfOffload?: NodeJS.Timeout };
/** Background sweeper: every 5 minutes move idle media to R2. */
export function startOffloader() {
  if (og.__rfOffload) return;
  let running = false;
  og.__rfOffload = setInterval(() => { if (running) return; running = true; offloadOnce().then((s) => { if (s.dropped || s.failed) console.log("R2 offload", JSON.stringify(s)); }).catch(() => {}).finally(() => { running = false; }); }, 5 * 60_000);
  og.__rfOffload.unref?.();
}
