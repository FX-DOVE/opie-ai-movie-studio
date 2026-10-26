import crypto from "node:crypto";

function key() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") console.warn("[opie] APP_SECRET is not set; using an insecure dev secret");
    return crypto.createHash("sha256").update("opie-dev-insecure-secret").digest();
  }
  return crypto.createHash("sha256").update(s).digest();
}
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
export function decrypt(blob: string) {
  const b = Buffer.from(blob.slice(3), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
export function mask(v: string) { return v.length <= 8 ? "••••" : v.slice(0, 4) + "••••" + v.slice(-4); }
