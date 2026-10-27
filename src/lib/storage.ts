import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "./config";
import { MEDIA_DIR } from "./db";

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
export async function r2Req(c: R2Conf, method: string, key: string, body?: Buffer, type?: string) {
  const u = new URL(`${c.endpoint}/${c.bucket}/${keyPath(key)}`);
  const now = new Date(); const amz = now.toISOString().replace(/[-:]|\.\d{3}/g, ""); const date = amz.slice(0, 8);
  const ph = h(body || "");
  const headers: Record<string, string> = { host: u.host, "x-amz-content-sha256": ph, "x-amz-date": amz, ...(type ? { "content-type": type } : {}) };
  const names = Object.keys(headers).sort();
  const creq = [method, u.pathname, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), ph].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", amz, scope, h(creq)].join("\n");
  const sig = crypto.createHmac("sha256", signingKey(c.secret, date)).update(sts).digest("hex");
  const { host: _host, ...send } = headers; void _host;
  return fetch(u, { method, body: body ? new Uint8Array(body) : undefined, headers: { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` }, signal: AbortSignal.timeout(30000) });
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
